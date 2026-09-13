package franchise

import "time"

const DefaultSalaryCap int64 = 255_000_000

type Contract struct {
	ID          string    `json:"id"`
	LeagueID    string    `json:"leagueId"`
	PlayerID    string    `json:"playerId"`
	TeamID      string    `json:"teamId"`
	StartSeason int       `json:"startSeason"`
	Years       int       `json:"years"`
	AnnualValue int64     `json:"annualValue"`
	Guaranteed  int64     `json:"guaranteed"`
	SignedAt    time.Time `json:"signedAt"`
}

type DraftPick struct {
	ID             string `json:"id"`
	LeagueID       string `json:"leagueId"`
	OriginalTeamID string `json:"originalTeamId"`
	TeamID         string `json:"teamId"`
	Season         int    `json:"season"`
	Round          int    `json:"round"`
	Pick           int    `json:"pick"`
}

type TransactionType string

const (
	Trade   TransactionType = "trade"
	Signing TransactionType = "signing"
	Release TransactionType = "release"
	Draft   TransactionType = "draft"
	Waiver  TransactionType = "waiver"
)

type Transaction struct {
	ID         string          `json:"id"`
	LeagueID   string          `json:"leagueId"`
	Type       TransactionType `json:"type"`
	TeamIDs    []string        `json:"teamIds"`
	PlayerIDs  []string        `json:"playerIds"`
	PickIDs    []string        `json:"pickIds"`
	OccurredAt time.Time       `json:"occurredAt"`
	Summary    string          `json:"summary"`
}

type OfferStatus string

const (
	OfferOpen     OfferStatus = "open"
	OfferAccepted OfferStatus = "accepted"
	OfferRejected OfferStatus = "rejected"
	OfferExpired  OfferStatus = "expired"
)

type Offer struct {
	ID            string      `json:"id"`
	LeagueID      string      `json:"leagueId"`
	FromTeamID    string      `json:"fromTeamId"`
	ToTeamID      string      `json:"toTeamId"`
	FromPlayerIDs []string    `json:"fromPlayerIds"`
	ToPlayerIDs   []string    `json:"toPlayerIds"`
	FromPickIDs   []string    `json:"fromPickIds"`
	ToPickIDs     []string    `json:"toPickIds"`
	Status        OfferStatus `json:"status"`
	ExpiresAt     time.Time   `json:"expiresAt"`
	CreatedAt     time.Time   `json:"createdAt"`
}

type PlayerStatus string

const (
	PlayerRoster    PlayerStatus = "roster"
	PlayerFreeAgent PlayerStatus = "free_agent"
	PlayerWaivers   PlayerStatus = "waivers"
	PlayerDraft     PlayerStatus = "draft"
	PlayerRetired   PlayerStatus = "retired"
)

type PlayerAsset struct {
	ID        string       `json:"id"`
	LeagueID  string       `json:"leagueId"`
	TeamID    string       `json:"teamId,omitempty"`
	Status    PlayerStatus `json:"status"`
	FirstName string       `json:"firstName"`
	LastName  string       `json:"lastName"`
	Position  string       `json:"position"`
	Age       int          `json:"age"`
	Overall   int          `json:"overall"`
	Potential int          `json:"potential"`
}

type WaiverClaim struct {
	ID        string    `json:"id"`
	LeagueID  string    `json:"leagueId"`
	PlayerID  string    `json:"playerId"`
	TeamID    string    `json:"teamId"`
	Priority  int       `json:"priority"`
	CreatedAt time.Time `json:"createdAt"`
}

type DraftSelection struct {
	Pick   DraftPick   `json:"pick"`
	Player PlayerAsset `json:"player"`
}

type TradeEvaluation struct {
	Accept       bool   `json:"accept"`
	Incoming     int    `json:"incoming"`
	Outgoing     int    `json:"outgoing"`
	NetValue     int    `json:"netValue"`
	RequiredEdge int    `json:"requiredEdge"`
	Reason       string `json:"reason"`
}

func CapHit(contracts []Contract) int64 {
	var total int64
	for _, contract := range contracts {
		total += contract.AnnualValue
	}
	return total
}

func CanAfford(cap int64, contracts []Contract, newAnnual int64) bool {
	return CapHit(contracts)+newAnnual <= cap
}

func RemainingCap(cap int64, contracts []Contract) int64 {
	return cap - CapHit(contracts)
}
