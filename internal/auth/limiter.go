package auth

import (
	"sync"
	"time"
)

type Limiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	items  map[string]bucket
}

type bucket struct {
	count int
	until time.Time
}

func NewLimiter(limit int, window time.Duration) *Limiter {
	return &Limiter{limit: limit, window: window, items: map[string]bucket{}}
}

func (l *Limiter) Allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b := l.items[key]
	if now.After(b.until) {
		b = bucket{until: now.Add(l.window)}
	}
	if b.count >= l.limit {
		l.items[key] = b
		return false
	}
	b.count++
	l.items[key] = b
	if len(l.items) > 10_000 {
		for k, item := range l.items {
			if now.After(item.until) {
				delete(l.items, k)
			}
		}
	}
	return true
}
