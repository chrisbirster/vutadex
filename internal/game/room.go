package game

import (
	"errors"
	"sync"
	"time"
)

type Side string

const (
	TeamX Side = "x"
	TeamO Side = "o"
)

type Selection struct {
	Side      Side      `json:"side"`
	Formation string    `json:"formation"`
	PlayID    string    `json:"playId"`
	LockedAt  time.Time `json:"lockedAt"`
}

type Resolution struct {
	X     Selection `json:"x"`
	O     Selection `json:"o"`
	Ready bool      `json:"ready"`
}

type RoundState struct {
	GameID   string    `json:"gameId"`
	Round    int       `json:"round"`
	Deadline time.Time `json:"deadline"`
	XLocked  bool      `json:"xLocked"`
	OLocked  bool      `json:"oLocked"`
}

type Room struct {
	mu         sync.Mutex
	gameID     string
	round      int
	selections map[Side]Selection
	deadline   time.Time
}

func NewRoom(gameID string) *Room {
	return &Room{gameID: gameID, selections: map[Side]Selection{}}
}

func (r *Room) BeginRound(playClock time.Duration) RoundState {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.round++
	r.selections = map[Side]Selection{}
	r.deadline = time.Now().Add(playClock)
	return r.stateLocked()
}

func (r *Room) ResetLocks(playClock time.Duration) RoundState {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.selections = map[Side]Selection{}
	r.deadline = time.Now().Add(playClock)
	return r.stateLocked()
}

func (r *Room) State() RoundState {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.stateLocked()
}

func (r *Room) Lock(side Side, formation, playID string) (Resolution, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if side != TeamX && side != TeamO {
		return Resolution{}, errors.New("invalid side")
	}
	if r.deadline.IsZero() {
		return Resolution{}, errors.New("round not started")
	}
	if time.Now().After(r.deadline) {
		return Resolution{}, errors.New("play clock expired")
	}
	if _, ok := r.selections[side]; ok {
		return Resolution{}, errors.New("call already locked")
	}
	r.selections[side] = Selection{Side: side, Formation: formation, PlayID: playID, LockedAt: time.Now()}
	x, xok := r.selections[TeamX]
	o, ook := r.selections[TeamO]
	return Resolution{X: x, O: o, Ready: xok && ook}, nil
}

func (r *Room) stateLocked() RoundState {
	_, xLocked := r.selections[TeamX]
	_, oLocked := r.selections[TeamO]
	return RoundState{GameID: r.gameID, Round: r.round, Deadline: r.deadline, XLocked: xLocked, OLocked: oLocked}
}
