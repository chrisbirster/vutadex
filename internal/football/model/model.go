package model

import "time"

type Role string
const (
	RoleOwner Role="owner"; RoleGM Role="gm"; RoleHeadCoach Role="head_coach"; RoleOC Role="oc"; RoleDC Role="dc"; RolePlayer Role="player"
)

type Position string
const (
	QB Position="QB"; RB Position="RB"; WR Position="WR"; TE Position="TE"; LT Position="LT"; LG Position="LG"; C Position="C"; RG Position="RG"; RT Position="RT"; EDGE Position="EDGE"; DT Position="DT"; LB Position="LB"; CB Position="CB"; S Position="S"; K Position="K"; P Position="P"
)

type Attributes struct { Speed,Strength,Agility,Awareness,Stamina,ThrowPower,ThrowAccuracy,RouteRunning,Hands,Blocking,Coverage,Tackling int }
type Player struct { ID,FirstName,LastName string; Position Position; Age int; TeamID string; Overall,Potential int; Attributes Attributes }
type Team struct { ID,City,Name,Abbreviation string; PrimaryColor,SecondaryColor string; Players []Player }
type League struct { ID,Name string; Season int; Teams []Team }
type Membership struct { UserID,TeamID string; Role Role; CreatedAt time.Time }

type GameState struct {
	ID string `json:"id"`; Seed uint64 `json:"seed"`; HomeID string `json:"homeId"`; AwayID string `json:"awayId"`; Possession string `json:"possession"`
	Quarter int `json:"quarter"`; Clock int `json:"clock"`; Down int `json:"down"`; Distance int `json:"distance"`; Ball int `json:"ball"`; HomeScore int `json:"homeScore"`; AwayScore int `json:"awayScore"`; PlayNumber int `json:"playNumber"`; Finished bool `json:"finished"`
}

type Event struct { Sequence int `json:"sequence"`; Type string `json:"type"`; Quarter int `json:"quarter"`; Clock int `json:"clock"`; Description string `json:"description"`; Yards int `json:"yards,omitempty"`; Scoring bool `json:"scoring,omitempty"` }
