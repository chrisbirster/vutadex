package realtime

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type Hub struct { mu sync.RWMutex; rooms map[string]map[*websocket.Conn]struct{}; origins []string }
func New(origins ...string)*Hub{return &Hub{rooms:map[string]map[*websocket.Conn]struct{}{},origins:origins}}
func(h *Hub)ServeGame(w http.ResponseWriter,r *http.Request,gameID string){
	c,err:=websocket.Accept(w,r,&websocket.AcceptOptions{OriginPatterns:h.origins});if err!=nil{return};defer c.Close(websocket.StatusNormalClosure,"bye")
	h.add(gameID,c);defer h.remove(gameID,c)
	ctx:=c.CloseRead(r.Context());<-ctx.Done()
}
func(h *Hub)Broadcast(ctx context.Context,gameID string,v any){data,err:=json.Marshal(v);if err!=nil{return};h.mu.RLock();clients:=make([]*websocket.Conn,0,len(h.rooms[gameID]));for c:=range h.rooms[gameID]{clients=append(clients,c)};h.mu.RUnlock();for _,c:=range clients{writeCtx,cancel:=context.WithTimeout(ctx,2*time.Second);_ = c.Write(writeCtx,websocket.MessageText,data);cancel()}}
func(h *Hub)add(id string,c *websocket.Conn){h.mu.Lock();defer h.mu.Unlock();if h.rooms[id]==nil{h.rooms[id]=map[*websocket.Conn]struct{}{}};h.rooms[id][c]=struct{}{}}
func(h *Hub)remove(id string,c *websocket.Conn){h.mu.Lock();defer h.mu.Unlock();delete(h.rooms[id],c);if len(h.rooms[id])==0{delete(h.rooms,id)}}
