package game

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

type LobbyStatus string

const (
	LobbyWaiting   LobbyStatus = "waiting"
	LobbyReady     LobbyStatus = "ready"
	LobbyActive    LobbyStatus = "active"
	LobbyFinal     LobbyStatus = "final"
	LobbyForfeited LobbyStatus = "forfeited"
)

type LobbySnapshot struct {
	ID           string      `json:"id"`
	GameID       string      `json:"gameId"`
	OwnerUserID  string      `json:"ownerUserId"`
	GuestUserID  string      `json:"guestUserId,omitempty"`
	WinnerUserID string      `json:"winnerUserId,omitempty"`
	Status       LobbyStatus `json:"status"`
	Sequence     int         `json:"sequence"`
	Round        RoundState  `json:"round"`
	CreatedAt    time.Time   `json:"createdAt"`
	UpdatedAt    time.Time   `json:"updatedAt"`
}

type LobbyEvent struct {
	Sequence     int         `json:"sequence"`
	Kind         string      `json:"kind"`
	At           time.Time   `json:"at"`
	Side         Side        `json:"side,omitempty"`
	Message      string      `json:"message"`
	Resolution   *Resolution `json:"resolution,omitempty"`
	Game         *Demo       `json:"game,omitempty"`
	WinnerUserID string      `json:"winnerUserId,omitempty"`
}

type LobbyCatchUp struct {
	Room   LobbySnapshot `json:"room"`
	Events []LobbyEvent   `json:"events"`
}

type LobbyCreate struct {
	Room       LobbySnapshot `json:"room"`
	InviteCode string        `json:"inviteCode"`
}

type lobbyRoom struct {
	mu         sync.Mutex
	snapshot   LobbySnapshot
	inviteCode string
	calls      *Room
	events     []LobbyEvent
}

type LobbyService struct {
	mu      sync.RWMutex
	games   *Service
	rooms   map[string]*lobbyRoom
	invites map[string]string
}

func NewLobbyService(games *Service) *LobbyService {
	return &LobbyService{games: games, rooms: map[string]*lobbyRoom{}, invites: map[string]string{}}
}

func (s *LobbyService) Create(ctx context.Context, ownerUserID string, seed uint64) (LobbyCreate, error) {
	ownerUserID = strings.TrimSpace(ownerUserID)
	if ownerUserID == "" {
		return LobbyCreate{}, errors.New("owner user required")
	}
	current, err := s.games.Create(ctx, seed)
	if err != nil {
		return LobbyCreate{}, err
	}
	roomID, err := randomID("room_", 12)
	if err != nil {
		return LobbyCreate{}, err
	}
	invite, err := randomID("", 9)
	if err != nil {
		return LobbyCreate{}, err
	}
	now := time.Now().UTC()
	room := &lobbyRoom{
		inviteCode: invite,
		calls:      NewRoom(current.State.ID),
		snapshot: LobbySnapshot{
			ID: roomID, GameID: current.State.ID, OwnerUserID: ownerUserID,
			Status: LobbyWaiting, CreatedAt: now, UpdatedAt: now,
		},
	}
	room.appendLocked(LobbyEvent{Kind: "room_created", Message: "Team X created the room"})

	s.mu.Lock()
	s.rooms[roomID] = room
	s.invites[invite] = roomID
	s.mu.Unlock()
	return LobbyCreate{Room: room.snapshotLocked(), InviteCode: invite}, nil
}

func (s *LobbyService) Join(inviteCode, userID string) (LobbyCatchUp, error) {
	inviteCode = strings.TrimSpace(inviteCode)
	userID = strings.TrimSpace(userID)
	if inviteCode == "" || userID == "" {
		return LobbyCatchUp{}, errors.New("invite code and user required")
	}
	s.mu.RLock()
	roomID := s.invites[inviteCode]
	room := s.rooms[roomID]
	s.mu.RUnlock()
	if room == nil {
		return LobbyCatchUp{}, errors.New("invite not found")
	}

	room.mu.Lock()
	defer room.mu.Unlock()
	if userID == room.snapshot.OwnerUserID {
		return LobbyCatchUp{}, errors.New("owner cannot join as Team O")
	}
	if room.snapshot.GuestUserID != "" && room.snapshot.GuestUserID != userID {
		return LobbyCatchUp{}, errors.New("room already has a Team O coach")
	}
	if room.snapshot.Status == LobbyForfeited || room.snapshot.Status == LobbyFinal {
		return LobbyCatchUp{}, errors.New("room is closed")
	}
	if room.snapshot.GuestUserID == "" {
		room.snapshot.GuestUserID = userID
		room.snapshot.Status = LobbyReady
		room.snapshot.UpdatedAt = time.Now().UTC()
		room.appendLocked(LobbyEvent{Kind: "guest_joined", Side: TeamO, Message: "Team O joined the room"})
		round := room.calls.BeginRound(normalPlayClock)
		room.snapshot.Round = round
		room.appendLocked(LobbyEvent{Kind: "round_started", Message: fmt.Sprintf("Round %d started", round.Round)})
	}
	return room.catchUpLocked(0), nil
}

func (s *LobbyService) CatchUp(roomID, userID string, since int) (LobbyCatchUp, error) {
	room, err := s.roomForUser(roomID, userID)
	if err != nil {
		return LobbyCatchUp{}, err
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	return room.catchUpLocked(since), nil
}

func (s *LobbyService) LockCall(ctx context.Context, roomID, userID, formation, playID string) (LobbyCatchUp, error) {
	room, err := s.roomForUser(roomID, userID)
	if err != nil {
		return LobbyCatchUp{}, err
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.snapshot.Status != LobbyReady && room.snapshot.Status != LobbyActive {
		return room.catchUpLocked(0), errors.New("room is not ready for calls")
	}

	side, err := participantSide(room.snapshot, userID)
	if err != nil {
		return room.catchUpLocked(0), err
	}
	current, err := s.games.Get(ctx, room.snapshot.GameID)
	if err != nil {
		return room.catchUpLocked(0), err
	}
	if err := validateMultiplayerCall(current, side, strings.TrimSpace(playID)); err != nil {
		return room.catchUpLocked(0), err
	}

	resolution, err := room.calls.Lock(side, strings.TrimSpace(formation), strings.TrimSpace(playID))
	if err != nil {
		return room.catchUpLocked(0), err
	}
	room.snapshot.Status = LobbyActive
	room.snapshot.Round = room.calls.State()
	room.snapshot.UpdatedAt = time.Now().UTC()
	if !resolution.Ready {
		room.appendLocked(LobbyEvent{Kind: "call_locked", Side: side, Message: fmt.Sprintf("Team %s locked its call", strings.ToUpper(string(side)))})
		return room.catchUpLocked(0), nil
	}

	resolved, _, err := s.games.ResolveMatchup(ctx, room.snapshot.GameID, resolution.X.PlayID, resolution.O.PlayID)
	if err != nil {
		room.snapshot.Status = LobbyReady
		room.snapshot.Round = room.calls.ResetLocks(normalPlayClock)
		room.snapshot.UpdatedAt = time.Now().UTC()
		room.appendLocked(LobbyEvent{Kind: "round_reset", Message: "The round was reset because the game could not be saved"})
		return room.catchUpLocked(0), err
	}
	gameCopy := resolved
	resolutionCopy := resolution
	room.appendLocked(LobbyEvent{Kind: "calls_revealed", Message: "Both calls locked; snap resolved", Resolution: &resolutionCopy, Game: &gameCopy})
	if resolved.State.Finished {
		room.snapshot.Status = LobbyFinal
		room.snapshot.Round = room.calls.State()
		room.snapshot.UpdatedAt = time.Now().UTC()
		room.appendLocked(LobbyEvent{Kind: "game_final", Message: "The multiplayer game is final", Game: &gameCopy})
		return room.catchUpLocked(0), nil
	}

	room.snapshot.Status = LobbyReady
	room.snapshot.Round = room.calls.BeginRound(normalPlayClock)
	room.snapshot.UpdatedAt = time.Now().UTC()
	room.appendLocked(LobbyEvent{Kind: "round_started", Message: fmt.Sprintf("Round %d started", room.snapshot.Round.Round)})
	return room.catchUpLocked(0), nil
}

func (s *LobbyService) Forfeit(roomID, userID string) (LobbyCatchUp, error) {
	room, err := s.roomForUser(roomID, userID)
	if err != nil {
		return LobbyCatchUp{}, err
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.snapshot.Status == LobbyForfeited || room.snapshot.Status == LobbyFinal {
		return room.catchUpLocked(0), errors.New("room is already closed")
	}
	winner := ""
	if userID == room.snapshot.OwnerUserID {
		winner = room.snapshot.GuestUserID
	} else {
		winner = room.snapshot.OwnerUserID
	}
	room.snapshot.Status = LobbyForfeited
	room.snapshot.WinnerUserID = winner
	room.snapshot.UpdatedAt = time.Now().UTC()
	room.appendLocked(LobbyEvent{Kind: "forfeit", Message: "A coach forfeited the room", WinnerUserID: winner})
	return room.catchUpLocked(0), nil
}

func (s *LobbyService) PublicSnapshot(roomID string) (LobbySnapshot, error) {
	s.mu.RLock()
	room := s.rooms[roomID]
	s.mu.RUnlock()
	if room == nil {
		return LobbySnapshot{}, errors.New("room not found")
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	return room.snapshotLocked(), nil
}

func (s *LobbyService) roomForUser(roomID, userID string) (*lobbyRoom, error) {
	s.mu.RLock()
	room := s.rooms[strings.TrimSpace(roomID)]
	s.mu.RUnlock()
	if room == nil {
		return nil, errors.New("room not found")
	}
	room.mu.Lock()
	owner := room.snapshot.OwnerUserID
	guest := room.snapshot.GuestUserID
	room.mu.Unlock()
	if userID != owner && userID != guest {
		return nil, errors.New("not a room participant")
	}
	return room, nil
}

func participantSide(snapshot LobbySnapshot, userID string) (Side, error) {
	if userID == snapshot.OwnerUserID {
		return TeamX, nil
	}
	if userID != "" && userID == snapshot.GuestUserID {
		return TeamO, nil
	}
	return "", errors.New("not a room participant")
}

func validateMultiplayerCall(current Demo, side Side, playID string) error {
	teamXOffense := current.State.Possession == current.State.HomeID
	needsOffense := (side == TeamX && teamXOffense) || (side == TeamO && !teamXOffense)
	if needsOffense {
		if _, _, err := resolveOffense(playID); err != nil {
			return fmt.Errorf("offensive call required: %w", err)
		}
		return nil
	}
	if _, _, err := resolveDefense(playID); err != nil {
		return fmt.Errorf("defensive call required: %w", err)
	}
	return nil
}

func (r *lobbyRoom) appendLocked(event LobbyEvent) {
	event.Sequence = len(r.events) + 1
	event.At = time.Now().UTC()
	r.events = append(r.events, event)
	r.snapshot.Sequence = event.Sequence
	r.snapshot.UpdatedAt = event.At
}

func (r *lobbyRoom) snapshotLocked() LobbySnapshot {
	out := r.snapshot
	out.Round = r.calls.State()
	return out
}

func (r *lobbyRoom) catchUpLocked(since int) LobbyCatchUp {
	if since < 0 {
		since = 0
	}
	events := make([]LobbyEvent, 0)
	for _, event := range r.events {
		if event.Sequence > since {
			events = append(events, event)
		}
	}
	return LobbyCatchUp{Room: r.snapshotLocked(), Events: events}
}

func randomID(prefix string, bytes int) (string, error) {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return prefix + base64.RawURLEncoding.EncodeToString(buf), nil
}
