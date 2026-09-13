package realtime

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type Hub struct {
	mu      sync.RWMutex
	rooms   map[string]map[*websocket.Conn]struct{}
	origins []string
}

func New(origins ...string) *Hub {
	return &Hub{rooms: map[string]map[*websocket.Conn]struct{}{}, origins: origins}
}

func (h *Hub) ServeGame(w http.ResponseWriter, r *http.Request, gameID string) {
	h.serve(w, r, gameID, nil)
}

func (h *Hub) ServeGameSnapshot(w http.ResponseWriter, r *http.Request, roomID string, initial any) {
	h.serve(w, r, roomID, initial)
}

func (h *Hub) serve(w http.ResponseWriter, r *http.Request, roomID string, initial any) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: h.origins})
	if err != nil {
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "bye")

	h.add(roomID, conn)
	defer h.remove(roomID, conn)
	if initial != nil {
		writeCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		_ = writeJSON(writeCtx, conn, initial)
		cancel()
	}
	ctx := conn.CloseRead(r.Context())
	<-ctx.Done()
}

func (h *Hub) Broadcast(ctx context.Context, roomID string, value any) {
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	h.mu.RLock()
	clients := make([]*websocket.Conn, 0, len(h.rooms[roomID]))
	for conn := range h.rooms[roomID] {
		clients = append(clients, conn)
	}
	h.mu.RUnlock()
	for _, conn := range clients {
		writeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		_ = conn.Write(writeCtx, websocket.MessageText, data)
		cancel()
	}
}

func writeJSON(ctx context.Context, conn *websocket.Conn, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return conn.Write(ctx, websocket.MessageText, data)
}

func (h *Hub) add(id string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[id] == nil {
		h.rooms[id] = map[*websocket.Conn]struct{}{}
	}
	h.rooms[id][conn] = struct{}{}
}

func (h *Hub) remove(id string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms[id], conn)
	if len(h.rooms[id]) == 0 {
		delete(h.rooms, id)
	}
}
