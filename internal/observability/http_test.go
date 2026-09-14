package observability

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestIDAndRecovery(t *testing.T) {
	h := New(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if RequestID(r.Context()) != "client-123" {
			t.Fatalf("request id missing from context")
		}
		panic("boom")
	}), nil)
	req := httptest.NewRequest(http.MethodGet, "/boom", nil)
	req.Header.Set("X-Request-ID", "client-123")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d", res.Code)
	}
	if got := res.Header().Get("X-Request-ID"); got != "client-123" {
		t.Fatalf("request id=%q", got)
	}
}

func TestReadinessFailure(t *testing.T) {
	h := New(http.NotFoundHandler(), func(context.Context) error { return errors.New("db down") })
	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/v1/readyz", nil))
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d", res.Code)
	}
}

func TestMetrics(t *testing.T) {
	h := New(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }), nil)
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/x", nil))
	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if res.Code != http.StatusOK || res.Body.Len() == 0 {
		t.Fatalf("metrics response status=%d body=%q", res.Code, res.Body.String())
	}
}
