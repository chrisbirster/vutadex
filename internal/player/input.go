package player

import "errors"

type Control string
const(QB Control="qb";RB Control="rb";MLB Control="mlb")
type Input struct{Sequence uint64 `json:"sequence"`;Control Control `json:"control"`;MoveX,MoveY float32 `json:"moveX"`;Action string `json:"action,omitempty"`;Target string `json:"target,omitempty"`}
func(i Input)Validate()error{if i.Control!=QB&&i.Control!=RB&&i.Control!=MLB{return errors.New("unsupported control")};if i.MoveX < -1||i.MoveX>1||i.MoveY < -1||i.MoveY>1{return errors.New("movement out of range")};switch i.Action{case "","throw","sprint","tackle","handoff":return nil;default:return errors.New("unsupported action")}}
