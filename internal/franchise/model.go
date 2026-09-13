package franchise

import "time"

type Contract struct{ID,PlayerID,TeamID string;Years int;AnnualValue int64;Guaranteed int64;SignedAt time.Time}
type DraftPick struct{ID,LeagueID,TeamID string;Season,Round,Pick int}
type TransactionType string
const(Trade TransactionType="trade";Signing TransactionType="signing";Release TransactionType="release";Draft TransactionType="draft";Waiver TransactionType="waiver")
type Transaction struct{ID,LeagueID string;Type TransactionType;TeamIDs,PlayerIDs,PickIDs []string;OccurredAt time.Time;Summary string}
type Offer struct{FromTeamID,ToTeamID string;PlayerIDs,PickIDs []string;ExpiresAt time.Time}

func CapHit(contracts []Contract)int64{var n int64;for _,c:=range contracts{n+=c.AnnualValue};return n}
func CanAfford(cap int64,contracts []Contract,newAnnual int64)bool{return CapHit(contracts)+newAnnual<=cap}
