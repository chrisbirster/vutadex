package playbook

type Side string
const (Offense Side="offense"; Defense Side="defense")
type Assignment struct { Position string `json:"position"`; Kind string `json:"kind"`; Route string `json:"route,omitempty"`; Depth int `json:"depth,omitempty"`; Target string `json:"target,omitempty"` }
type Play struct { ID string `json:"id"`; Name string `json:"name"`; Side Side `json:"side"`; Formation string `json:"formation"`; Personnel string `json:"personnel"`; Concept string `json:"concept"`; Assignments []Assignment `json:"assignments"` }

var OffenseCore = []Play{
	{ID:"gun-trips-mesh",Name:"Mesh",Side:Offense,Formation:"Gun Trips Right",Personnel:"11",Concept:"mesh",Assignments:[]Assignment{{"X","route","drag",5,""},{"Y","route","drag",6,""},{"Z","route","corner",12,""},{"RB","route","flat",2,""}}},
	{ID:"gun-trips-stick",Name:"Stick",Side:Offense,Formation:"Gun Trips Right",Personnel:"11",Concept:"stick"},
	{ID:"gun-trips-four-verts",Name:"Four Verticals",Side:Offense,Formation:"Gun Trips Right",Personnel:"11",Concept:"verticals"},
	{ID:"gun-doubles-inside-zone",Name:"Inside Zone",Side:Offense,Formation:"Gun Doubles",Personnel:"11",Concept:"inside-zone"},
	{ID:"gun-doubles-counter",Name:"Counter",Side:Offense,Formation:"Gun Doubles",Personnel:"11",Concept:"counter"},
	{ID:"singleback-zone",Name:"Wide Zone",Side:Offense,Formation:"Singleback",Personnel:"12",Concept:"wide-zone"},
	{ID:"singleback-pa-cross",Name:"PA Cross",Side:Offense,Formation:"Singleback",Personnel:"12",Concept:"play-action"},
	{ID:"pistol-read-option",Name:"Read Option",Side:Offense,Formation:"Pistol",Personnel:"11",Concept:"option"},
	{ID:"goal-line-power",Name:"Power",Side:Offense,Formation:"Goal Line",Personnel:"22",Concept:"power"},
	{ID:"empty-spacing",Name:"Spacing",Side:Offense,Formation:"Empty",Personnel:"10",Concept:"spacing"},
}
var DefenseCore = []Play{
	{ID:"nickel-cover-1",Name:"Cover 1 Hole",Side:Defense,Formation:"Nickel 4-2",Personnel:"4-2-5",Concept:"cover-1"},
	{ID:"nickel-cover-2",Name:"Cover 2",Side:Defense,Formation:"Nickel 4-2",Personnel:"4-2-5",Concept:"cover-2"},
	{ID:"nickel-cover-3",Name:"Cover 3",Side:Defense,Formation:"Nickel 4-2",Personnel:"4-2-5",Concept:"cover-3"},
	{ID:"nickel-quarters",Name:"Quarters",Side:Defense,Formation:"Nickel 4-2",Personnel:"4-2-5",Concept:"quarters"},
	{ID:"four-three-sam-blitz",Name:"Sam Blitz",Side:Defense,Formation:"4-3 Over",Personnel:"4-3",Concept:"blitz"},
	{ID:"three-four-zone-blitz",Name:"Zone Blitz",Side:Defense,Formation:"3-4 Odd",Personnel:"3-4",Concept:"zone-blitz"},
	{ID:"dime-cover-2-man",Name:"2 Man",Side:Defense,Formation:"Dime",Personnel:"4-1-6",Concept:"cover-2-man"},
	{ID:"goal-line-gaps",Name:"Gap Crash",Side:Defense,Formation:"Goal Line",Personnel:"5-3",Concept:"run-blitz"},
}
