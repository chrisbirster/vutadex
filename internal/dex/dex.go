package dex

import "time"

type Kind string
const(Player Kind="player";Team Kind="team";Game Kind="game";Season Kind="season";Draft Kind="draft";Record Kind="record")
type Entry struct{ID,LeagueID,SubjectID,Title string;Kind Kind;Summary string;Facts map[string]any;CreatedAt time.Time}
type Career struct{PlayerID string;Seasons,Games,Championships,MVPs int;PassingYards,RushingYards,ReceivingYards,Touchdowns int64}

type Index interface{Put(Entry)error;Get(leagueID string,kind Kind,subjectID string)(Entry,error);Search(leagueID,query string,limit int)([]Entry,error)}
