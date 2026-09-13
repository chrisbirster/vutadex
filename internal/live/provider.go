package live

import (
	"context"
	"encoding/json"
)

type Provider interface { Game(context.Context,string)(json.RawMessage,error) }
