package franchise

import "context"

func (s *Service) Player(ctx context.Context, playerID string) (PlayerAsset, error) {
	return s.repo.Player(ctx, playerID)
}

func (s *Service) TeamContracts(ctx context.Context, teamID string) ([]Contract, error) {
	return s.repo.TeamContracts(ctx, teamID)
}

func (s *Service) TeamDraftPicks(ctx context.Context, teamID string, season int) ([]DraftPick, error) {
	return s.repo.TeamDraftPicks(ctx, teamID, season)
}

func (s *Service) OffersForTeam(ctx context.Context, teamID string) ([]Offer, error) {
	return s.repo.OffersForTeam(ctx, teamID)
}

func (s *Service) Offer(ctx context.Context, offerID string) (Offer, error) {
	return s.repo.Offer(ctx, offerID)
}

func (s *Service) CPUFreeAgentDecision(ctx context.Context, teamID, playerID string, annualValue int64) (bool, string, error) {
	player, err := s.repo.Player(ctx, playerID)
	if err != nil {
		return false, "", err
	}
	contracts, err := s.repo.TeamContracts(ctx, teamID)
	if err != nil {
		return false, "", err
	}
	returnValue, reason := ShouldSign(player, annualValue, RemainingCap(s.cap, contracts))
	return returnValue, reason, nil
}
