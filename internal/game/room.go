package game

import (
	"errors"
	"sync"
	"time"
)

type Side string
const(TeamX Side="x";TeamO Side="o")
type Selection struct{Side Side;Formation,PlayID string;LockedAt time.Time}
type Resolution struct{X,O Selection;Ready bool}
type Room struct{mu sync.Mutex;gameID string;round int;selections map[Side]Selection;deadline time.Time}
func NewRoom(gameID string)*Room{return &Room{gameID:gameID,selections:map[Side]Selection{}}}
func(r *Room)BeginRound(playClock time.Duration){r.mu.Lock();defer r.mu.Unlock();r.round++;r.selections=map[Side]Selection{};r.deadline=time.Now().Add(playClock)}
func(r *Room)Lock(side Side,formation,playID string)(Resolution,error){r.mu.Lock();defer r.mu.Unlock();if side!=TeamX&&side!=TeamO{return Resolution{},errors.New("invalid side")};if time.Now().After(r.deadline)&&!r.deadline.IsZero(){return Resolution{},errors.New("play clock expired")};if _,ok:=r.selections[side];ok{return Resolution{},errors.New("call already locked")};r.selections[side]=Selection{Side:side,Formation:formation,PlayID:playID,LockedAt:time.Now()};x,xok:=r.selections[TeamX];o,ook:=r.selections[TeamO];return Resolution{X:x,O:o,Ready:xok&&ook},nil}
