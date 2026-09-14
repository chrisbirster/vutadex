package observability

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

type ReadyFunc func(context.Context) error

type middleware struct {
	next     http.Handler
	ready    ReadyFunc
	started  time.Time
	requests atomic.Uint64
	errors   atomic.Uint64
	panics   atomic.Uint64
	latency  atomic.Uint64
}

func New(next http.Handler, ready ReadyFunc) http.Handler {
	return &middleware{next: next, ready: ready, started: time.Now().UTC()}
}

func (m *middleware) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet && r.URL.Path == "/api/v1/readyz" {
		m.serveReady(w, r)
		return
	}
	if r.Method == http.MethodGet && r.URL.Path == "/metrics" {
		m.serveMetrics(w)
		return
	}

	requestID := normalizedRequestID(r.Header.Get("X-Request-ID"))
	if requestID == "" {
		requestID = newRequestID()
	}
	w.Header().Set("X-Request-ID", requestID)
	ctx := context.WithValue(r.Context(), requestIDKey{}, requestID)
	r = r.WithContext(ctx)

	started := time.Now()
	recorder := &statusRecorder{ResponseWriter: w}
	m.requests.Add(1)
	defer func() {
		elapsed := time.Since(started)
		m.latency.Add(uint64(elapsed.Nanoseconds()))
		if recovered := recover(); recovered != nil {
			m.panics.Add(1)
			m.errors.Add(1)
			slog.Error("http panic", "request_id", requestID, "method", r.Method, "path", r.URL.Path, "panic", recovered)
			if recorder.status == 0 {
				http.Error(recorder, "internal server error", http.StatusInternalServerError)
			}
		}
		status := recorder.status
		if status == 0 {
			status = http.StatusOK
		}
		if status >= 500 {
			m.errors.Add(1)
		}
		slog.Info("http request", "request_id", requestID, "method", r.Method, "path", r.URL.Path, "status", status, "duration", elapsed)
	}()

	m.next.ServeHTTP(recorder, r)
}

func (m *middleware) serveReady(w http.ResponseWriter, r *http.Request) {
	if m.ready != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := m.ready(ctx); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"ok":false}` + "\n"))
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"ok":true}` + "\n"))
}

func (m *middleware) serveMetrics(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	requests := m.requests.Load()
	latencySeconds := float64(m.latency.Load()) / float64(time.Second)
	_, _ = fmt.Fprintf(w, "# TYPE vutadex_http_requests_total counter\nvutadex_http_requests_total %d\n", requests)
	_, _ = fmt.Fprintf(w, "# TYPE vutadex_http_errors_total counter\nvutadex_http_errors_total %d\n", m.errors.Load())
	_, _ = fmt.Fprintf(w, "# TYPE vutadex_http_panics_total counter\nvutadex_http_panics_total %d\n", m.panics.Load())
	_, _ = fmt.Fprintf(w, "# TYPE vutadex_http_request_duration_seconds counter\nvutadex_http_request_duration_seconds %.9f\n", latencySeconds)
	_, _ = fmt.Fprintf(w, "# TYPE vutadex_process_uptime_seconds gauge\nvutadex_process_uptime_seconds %.3f\n", time.Since(m.started).Seconds())
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (w *statusRecorder) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusRecorder) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(p)
}

// Unwrap lets http.ResponseController reach optional interfaces implemented by
// the underlying writer, which keeps WebSocket upgrades working through this
// middleware.
func (w *statusRecorder) Unwrap() http.ResponseWriter { return w.ResponseWriter }

type requestIDKey struct{}

func RequestID(ctx context.Context) string {
	value, _ := ctx.Value(requestIDKey{}).(string)
	return value
}

func normalizedRequestID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 128 {
		return ""
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			continue
		}
		return ""
	}
	return value
}

func newRequestID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err == nil {
		return hex.EncodeToString(raw[:])
	}
	return fmt.Sprintf("req-%d", time.Now().UnixNano())
}
