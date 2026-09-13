package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/smtp"
	"net/url"
	"strings"
	"sync"
	"time"
)

type User struct { ID string `json:"id"`; Email string `json:"email"` }

type Store interface {
	CreateChallenge(context.Context, Challenge) error
	ConsumeChallenge(context.Context, [32]byte, time.Time) (string, error)
	UpsertUser(context.Context, string) (User, error)
	CreateSession(context.Context, Session) error
	Session(context.Context, [32]byte, time.Time) (User, error)
	DeleteSession(context.Context, [32]byte) error
}

type Challenge struct { ID, Email string; TokenHash [32]byte; ExpiresAt time.Time }
type Session struct { ID, UserID string; TokenHash [32]byte; ExpiresAt time.Time }

type Sender interface { SendMagicLink(context.Context, string, string) error }

type Service struct { store Store; sender Sender; gameOrigin string }

func NewService(store Store, sender Sender, gameOrigin string) *Service {
	return &Service{store: store, sender: sender, gameOrigin: strings.TrimRight(gameOrigin, "/")}
}

func (s *Service) Request(ctx context.Context, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || !strings.Contains(email, "@") { return errors.New("valid email required") }
	token, hash, err := token()
	if err != nil { return err }
	if err := s.store.CreateChallenge(ctx, Challenge{ID: id("ml_"), Email: email, TokenHash: hash, ExpiresAt: time.Now().Add(10*time.Minute)}); err != nil { return err }
	link := s.gameOrigin + "/login/verify?token=" + url.QueryEscape(token)
	return s.sender.SendMagicLink(ctx, email, link)
}

func (s *Service) Verify(ctx context.Context, raw string) (string, User, error) {
	if raw == "" { return "", User{}, errors.New("token required") }
	hash := sha256.Sum256([]byte(raw))
	email, err := s.store.ConsumeChallenge(ctx, hash, time.Now())
	if err != nil { return "", User{}, err }
	user, err := s.store.UpsertUser(ctx, email)
	if err != nil { return "", User{}, err }
	rawSession, sessionHash, err := token()
	if err != nil { return "", User{}, err }
	if err := s.store.CreateSession(ctx, Session{ID: id("ses_"), UserID: user.ID, TokenHash: sessionHash, ExpiresAt: time.Now().Add(30*24*time.Hour)}); err != nil { return "", User{}, err }
	return rawSession, user, nil
}

func (s *Service) Session(ctx context.Context, raw string) (User, error) {
	if raw == "" { return User{}, errors.New("no session") }
	return s.store.Session(ctx, sha256.Sum256([]byte(raw)), time.Now())
}

func (s *Service) Logout(ctx context.Context, raw string) error {
	if raw == "" { return nil }
	return s.store.DeleteSession(ctx, sha256.Sum256([]byte(raw)))
}

func token() (string, [32]byte, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil { return "", [32]byte{}, err }
	raw := base64.RawURLEncoding.EncodeToString(b[:])
	return raw, sha256.Sum256([]byte(raw)), nil
}

func id(prefix string) string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return prefix + base64.RawURLEncoding.EncodeToString(b[:])
}

type LogSender struct{}
func (LogSender) SendMagicLink(_ context.Context, email, link string) error {
	slog.Warn("development magic link", "email", email, "link", link)
	return nil
}

type SMTPSender struct { Addr, Username, Password, From string }
func (s SMTPSender) SendMagicLink(_ context.Context, to, link string) error {
	host := s.Addr
	if i := strings.IndexByte(host, ':'); i >= 0 { host = host[:i] }
	var a smtp.Auth
	if s.Username != "" { a = smtp.PlainAuth("", s.Username, s.Password, host) }
	body := "From: VutaDex <"+s.From+">\r\nTo: "+to+"\r\nSubject: Sign in to VutaDex\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nOpen this link to sign in. It expires in 10 minutes:\r\n\r\n"+link+"\r\n"
	return smtp.SendMail(s.Addr, a, s.From, []string{to}, []byte(body))
}

// MemoryStore is deliberately development-only. Production startup requires PostgreSQL.
type MemoryStore struct { mu sync.Mutex; challenges []Challenge; users map[string]User; sessions map[[32]byte]struct{User User; Expires time.Time} }
func NewMemoryStore() *MemoryStore { return &MemoryStore{users: map[string]User{}, sessions: map[[32]byte]struct{User User; Expires time.Time}{}} }
func (m *MemoryStore) CreateChallenge(_ context.Context, c Challenge) error { m.mu.Lock(); defer m.mu.Unlock(); m.challenges=append(m.challenges,c); return nil }
func (m *MemoryStore) ConsumeChallenge(_ context.Context, h [32]byte, now time.Time) (string,error) { m.mu.Lock(); defer m.mu.Unlock(); for i,c := range m.challenges { if subtle.ConstantTimeCompare(c.TokenHash[:], h[:])==1 && now.Before(c.ExpiresAt) { m.challenges=append(m.challenges[:i],m.challenges[i+1:]...); return c.Email,nil } }; return "",errors.New("invalid or expired magic link") }
func (m *MemoryStore) UpsertUser(_ context.Context,email string)(User,error){ m.mu.Lock(); defer m.mu.Unlock(); if u,ok:=m.users[email];ok{return u,nil}; u:=User{ID:id("usr_"),Email:email};m.users[email]=u;return u,nil }
func (m *MemoryStore) CreateSession(_ context.Context,s Session)error{m.mu.Lock();defer m.mu.Unlock();for _,u:=range m.users{if u.ID==s.UserID{m.sessions[s.TokenHash]=struct{User User;Expires time.Time}{u,s.ExpiresAt};return nil}};return fmt.Errorf("user %s not found",s.UserID)}
func (m *MemoryStore) Session(_ context.Context,h [32]byte,now time.Time)(User,error){m.mu.Lock();defer m.mu.Unlock();v,ok:=m.sessions[h];if !ok||!now.Before(v.Expires){return User{},errors.New("invalid session")};return v.User,nil}
func (m *MemoryStore) DeleteSession(_ context.Context,h [32]byte)error{m.mu.Lock();defer m.mu.Unlock();delete(m.sessions,h);return nil}
