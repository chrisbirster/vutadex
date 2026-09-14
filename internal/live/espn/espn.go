package espn

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/chrisbirster/vutadex/internal/live"
)

const (
	defaultSummaryBase = "https://site.api.espn.com"
	defaultCoreBase    = "https://sports.core.api.espn.com"
)

type cacheEntry struct {
	body      []byte
	expiresAt time.Time
}

type Provider struct {
	summaryBase string
	coreBase    string
	client      *http.Client
	cacheTTL    time.Duration

	mu    sync.Mutex
	cache map[string]cacheEntry
}

func New(summaryBase string) *Provider {
	return NewWithBases(summaryBase, defaultCoreBase, nil)
}

func NewWithBases(summaryBase, coreBase string, client *http.Client) *Provider {
	if strings.TrimSpace(summaryBase) == "" {
		summaryBase = defaultSummaryBase
	}
	if strings.TrimSpace(coreBase) == "" {
		coreBase = defaultCoreBase
	}
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &Provider{
		summaryBase: strings.TrimRight(summaryBase, "/"),
		coreBase:    strings.TrimRight(coreBase, "/"),
		client:      client,
		cacheTTL:    3 * time.Second,
		cache:       make(map[string]cacheEntry),
	}
}

func (p *Provider) Game(ctx context.Context, id string) (json.RawMessage, error) {
	u := p.summaryBase + "/apis/site/v2/sports/football/nfl/summary?event=" + url.QueryEscape(id)
	body, err := p.fetch(ctx, u)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(body), nil
}

func (p *Provider) Plays(ctx context.Context, id string) ([]live.Play, error) {
	u := p.coreBase + "/v2/sports/football/leagues/nfl/events/" + url.PathEscape(id) +
		"/competitions/" + url.PathEscape(id) + "/plays?limit=300"
	body, err := p.fetch(ctx, u)
	if err != nil {
		return nil, err
	}

	var payload struct {
		Items []struct {
			ID          string `json:"id"`
			Text        string `json:"text"`
			ScoringPlay bool   `json:"scoringPlay"`
			StatYardage int    `json:"statYardage"`
			Type        struct {
				Text string `json:"text"`
			} `json:"type"`
			Period struct {
				Number int `json:"number"`
			} `json:"period"`
			Clock struct {
				DisplayValue string `json:"displayValue"`
			} `json:"clock"`
			Start struct {
				Down     int `json:"down"`
				Distance int `json:"distance"`
				YardLine int `json:"yardLine"`
				Team     ref `json:"team"`
			} `json:"start"`
			End struct {
				YardLine int `json:"yardLine"`
			} `json:"end"`
			Drive ref `json:"drive"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("decode espn plays: %w", err)
	}

	plays := make([]live.Play, 0, len(payload.Items))
	for _, item := range payload.Items {
		plays = append(plays, live.Play{
			ID:          item.ID,
			GameID:      id,
			DriveID:     idFromRef(item.Drive.Ref),
			Quarter:     item.Period.Number,
			Clock:       item.Clock.DisplayValue,
			Down:        item.Start.Down,
			Distance:    item.Start.Distance,
			YardLine:    item.Start.YardLine,
			EndYardLine: item.End.YardLine,
			Possession:  idFromRef(item.Start.Team.Ref),
			Type:        item.Type.Text,
			Description: item.Text,
			Yards:       item.StatYardage,
			Scoring:     item.ScoringPlay,
		})
	}
	return plays, nil
}

func (p *Provider) Situation(ctx context.Context, id string) (live.Situation, error) {
	u := p.coreBase + "/v2/sports/football/leagues/nfl/events/" + url.PathEscape(id) +
		"/competitions/" + url.PathEscape(id) + "/situation"
	body, err := p.fetch(ctx, u)
	if err != nil {
		return live.Situation{}, err
	}
	var payload struct {
		Down         int  `json:"down"`
		Distance     int  `json:"distance"`
		YardLine     int  `json:"yardLine"`
		IsRedZone    bool `json:"isRedZone"`
		HomeTimeouts int  `json:"homeTimeouts"`
		AwayTimeouts int  `json:"awayTimeouts"`
		Possession   ref  `json:"possession"`
		LastPlay     ref  `json:"lastPlay"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return live.Situation{}, fmt.Errorf("decode espn situation: %w", err)
	}
	return live.Situation{
		GameID:       id,
		Down:         payload.Down,
		Distance:     payload.Distance,
		YardLine:     payload.YardLine,
		Possession:   idFromRef(payload.Possession.Ref),
		IsRedZone:    payload.IsRedZone,
		HomeTimeouts: payload.HomeTimeouts,
		AwayTimeouts: payload.AwayTimeouts,
		LastPlayID:   idFromRef(payload.LastPlay.Ref),
	}, nil
}

func (p *Provider) Gamecast(ctx context.Context, id string) (live.Gamecast, error) {
	plays, err := p.Plays(ctx, id)
	if err != nil {
		return live.Gamecast{}, err
	}
	situation, err := p.Situation(ctx, id)
	if err != nil {
		return live.Gamecast{}, err
	}
	return live.Gamecast{
		GameID:      id,
		Source:      "espn-development",
		Situation:   situation,
		Drives:      live.DrivesFromPlays(plays),
		Plays:       plays,
		RefreshedAt: time.Now().UTC(),
	}, nil
}

func (p *Provider) fetch(ctx context.Context, u string) ([]byte, error) {
	now := time.Now()
	p.mu.Lock()
	if entry, ok := p.cache[u]; ok && now.Before(entry.expiresAt) {
		body := append([]byte(nil), entry.body...)
		p.mu.Unlock()
		return body, nil
	}
	p.mu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "VutaDex-development-adapter/0.1")
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("espn status %s", resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if !json.Valid(body) {
		return nil, fmt.Errorf("espn returned invalid json")
	}

	p.mu.Lock()
	p.cache[u] = cacheEntry{body: append([]byte(nil), body...), expiresAt: now.Add(p.cacheTTL)}
	p.mu.Unlock()
	return body, nil
}

type ref struct {
	Ref string `json:"$ref"`
}

func idFromRef(raw string) string {
	if raw == "" {
		return ""
	}
	if parsed, err := url.Parse(raw); err == nil {
		raw = parsed.Path
	}
	raw = strings.TrimRight(raw, "/")
	if i := strings.LastIndexByte(raw, '/'); i >= 0 {
		return raw[i+1:]
	}
	return raw
}
