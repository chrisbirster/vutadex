package season

import (
	"context"
	"strings"
)

func (s *Service) Game(ctx context.Context, gameID string) (Game, error) {
	return s.repo.Game(ctx, strings.TrimSpace(gameID))
}
