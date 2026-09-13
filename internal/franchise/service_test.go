package franchise

import (
	"context"
	"testing"
	"time"
)

func testRepo() *MemoryRepository {
	repo := NewMemoryRepository()
	repo.SeedPlayer(PlayerAsset{ID: "x-qb", LeagueID: "lg", TeamID: "x", Status: PlayerRoster, FirstName: "Marcus", LastName: "Vance", Position: "QB", Age: 27, Overall: 88, Potential: 90})
	repo.SeedPlayer(PlayerAsset{ID: "x-wr", LeagueID: "lg", TeamID: "x", Status: PlayerRoster, FirstName: "Darius", LastName: "Reed", Position: "WR", Age: 25, Overall: 82, Potential: 87})
	repo.SeedPlayer(PlayerAsset{ID: "o-edge", LeagueID: "lg", TeamID: "o", Status: PlayerRoster, FirstName: "Malik", LastName: "Ward", Position: "EDGE", Age: 24, Overall: 85, Potential: 92})
	repo.SeedPlayer(PlayerAsset{ID: "fa-cb", LeagueID: "lg", Status: PlayerFreeAgent, FirstName: "Noah", LastName: "Price", Position: "CB", Age: 28, Overall: 79, Potential: 80})
	repo.SeedPlayer(PlayerAsset{ID: "waiver-rb", LeagueID: "lg", Status: PlayerWaivers, FirstName: "Miles", LastName: "Coleman", Position: "RB", Age: 26, Overall: 75, Potential: 78})
	repo.SeedPlayer(PlayerAsset{ID: "rookie-lb", LeagueID: "lg", Status: PlayerDraft, FirstName: "Caleb", LastName: "Hayes", Position: "LB", Age: 21, Overall: 73, Potential: 91})
	repo.SeedContract(Contract{ID: "ctr-x-qb", LeagueID: "lg", PlayerID: "x-qb", TeamID: "x", StartSeason: 2027, Years: 4, AnnualValue: 45_000_000})
	repo.SeedContract(Contract{ID: "ctr-x-wr", LeagueID: "lg", PlayerID: "x-wr", TeamID: "x", StartSeason: 2027, Years: 3, AnnualValue: 20_000_000})
	repo.SeedContract(Contract{ID: "ctr-o-edge", LeagueID: "lg", PlayerID: "o-edge", TeamID: "o", StartSeason: 2027, Years: 3, AnnualValue: 24_000_000})
	repo.SeedDraftPick(DraftPick{ID: "pick-x-1", LeagueID: "lg", OriginalTeamID: "x", TeamID: "x", Season: 2028, Round: 1, Pick: 8})
	repo.SeedDraftPick(DraftPick{ID: "pick-o-2", LeagueID: "lg", OriginalTeamID: "o", TeamID: "o", Season: 2028, Round: 2, Pick: 40})
	return repo
}

func TestSignFreeAgentHonorsCapAndPersistsTransaction(t *testing.T) {
	ctx := context.Background()
	repo := testRepo()
	service := NewService(repo, 90_000_000)
	contract, err := service.SignFreeAgent(ctx, "lg", "x", "fa-cb", 2027, 2, 10_000_000, 8_000_000)
	if err != nil {
		t.Fatal(err)
	}
	if contract.TeamID != "x" || contract.PlayerID != "fa-cb" {
		t.Fatalf("unexpected contract: %#v", contract)
	}
	player, _ := repo.Player(ctx, "fa-cb")
	if player.TeamID != "x" || player.Status != PlayerRoster {
		t.Fatalf("free agent was not moved to roster: %#v", player)
	}
	txns, _ := service.Transactions(ctx, "lg", 10)
	if len(txns) != 1 || txns[0].Type != Signing {
		t.Fatalf("missing signing transaction: %#v", txns)
	}
	if _, err := service.SignFreeAgent(ctx, "lg", "x", "waiver-rb", 2027, 1, 20_000_001, 0); err == nil {
		t.Fatal("expected non-free-agent/cap signing to fail")
	}
}

func TestReleaseMovesPlayerToWaiversAndPriorityWins(t *testing.T) {
	ctx := context.Background()
	repo := testRepo()
	service := NewService(repo, DefaultSalaryCap)
	if err := service.Release(ctx, "lg", "x", "x-wr"); err != nil {
		t.Fatal(err)
	}
	player, _ := repo.Player(ctx, "x-wr")
	if player.TeamID != "" || player.Status != PlayerWaivers {
		t.Fatalf("released player should be on waivers: %#v", player)
	}
	if _, err := service.SubmitWaiverClaim(ctx, "lg", "x", "x-wr", 5); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitWaiverClaim(ctx, "lg", "o", "x-wr", 1); err != nil {
		t.Fatal(err)
	}
	awarded, err := service.ProcessWaivers(ctx, "lg", 2027, 2_000_000)
	if err != nil {
		t.Fatal(err)
	}
	if len(awarded) != 1 || awarded[0].TeamID != "o" {
		t.Fatalf("highest-priority waiver team did not win: %#v", awarded)
	}
	player, _ = repo.Player(ctx, "x-wr")
	if player.TeamID != "o" || player.Status != PlayerRoster {
		t.Fatalf("waiver award did not move player: %#v", player)
	}
}

func TestDraftConsumesPickAndCreatesRookieContract(t *testing.T) {
	ctx := context.Background()
	repo := testRepo()
	service := NewService(repo, DefaultSalaryCap)
	selection, err := service.DraftPlayer(ctx, "lg", "x", "pick-x-1", "rookie-lb", 2028)
	if err != nil {
		t.Fatal(err)
	}
	if selection.Pick.ID != "pick-x-1" || selection.Player.ID != "rookie-lb" {
		t.Fatalf("unexpected selection: %#v", selection)
	}
	player, _ := repo.Player(ctx, "rookie-lb")
	if player.TeamID != "x" || player.Status != PlayerRoster {
		t.Fatalf("rookie not moved to roster: %#v", player)
	}
	if _, err := repo.DraftPick(ctx, "pick-x-1"); err == nil {
		t.Fatal("used draft pick should no longer be available")
	}
	if _, err := service.DraftPlayer(ctx, "lg", "x", "pick-x-1", "fa-cb", 2028); err == nil {
		t.Fatal("expected consumed pick to reject second selection")
	}
}

func TestTradeMovesPlayersPicksAndContractsAtomically(t *testing.T) {
	ctx := context.Background()
	repo := testRepo()
	service := NewService(repo, DefaultSalaryCap)
	offer, err := service.CreateOffer(ctx, "lg", "x", "o", []string{"x-wr"}, []string{"o-edge"}, []string{"pick-x-1"}, []string{"pick-o-2"}, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	txn, err := service.AcceptOffer(ctx, offer.ID, "o")
	if err != nil {
		t.Fatal(err)
	}
	if txn.Type != Trade {
		t.Fatalf("unexpected transaction: %#v", txn)
	}
	xwr, _ := repo.Player(ctx, "x-wr")
	edge, _ := repo.Player(ctx, "o-edge")
	if xwr.TeamID != "o" || edge.TeamID != "x" {
		t.Fatalf("players did not swap teams: %#v %#v", xwr, edge)
	}
	xPick, _ := repo.DraftPick(ctx, "pick-x-1")
	oPick, _ := repo.DraftPick(ctx, "pick-o-2")
	if xPick.TeamID != "o" || oPick.TeamID != "x" {
		t.Fatalf("picks did not swap teams: %#v %#v", xPick, oPick)
	}
	xContracts, _ := repo.TeamContracts(ctx, "x")
	oContracts, _ := repo.TeamContracts(ctx, "o")
	if annualForPlayers(xContracts, []string{"o-edge"}) != 24_000_000 || annualForPlayers(oContracts, []string{"x-wr"}) != 20_000_000 {
		t.Fatalf("contracts did not follow traded players: x=%#v o=%#v", xContracts, oContracts)
	}
	storedOffer, _ := repo.Offer(ctx, offer.ID)
	if storedOffer.Status != OfferAccepted {
		t.Fatalf("offer was not closed after trade: %#v", storedOffer)
	}
}

func TestCPUTradePolicyRejectsBadOfferAndAcceptsStrongOffer(t *testing.T) {
	ctx := context.Background()
	repo := testRepo()
	service := NewService(repo, DefaultSalaryCap)

	bad, err := service.CreateOffer(ctx, "lg", "x", "o", []string{"x-wr"}, []string{"o-edge"}, nil, nil, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	badEval, err := service.CPUDecision(ctx, bad.ID, "o")
	if err != nil {
		t.Fatal(err)
	}
	if badEval.Accept {
		t.Fatalf("CPU accepted weak offer: %#v", badEval)
	}
	badStored, _ := repo.Offer(ctx, bad.ID)
	if badStored.Status != OfferRejected {
		t.Fatalf("rejected CPU offer remained open: %#v", badStored)
	}

	good, err := service.CreateOffer(ctx, "lg", "x", "o", []string{"x-qb"}, []string{"o-edge"}, []string{"pick-x-1"}, nil, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	goodEval, err := service.CPUDecision(ctx, good.ID, "o")
	if err != nil {
		t.Fatal(err)
	}
	if !goodEval.Accept {
		t.Fatalf("CPU rejected strong offer: %#v", goodEval)
	}
	goodStored, _ := repo.Offer(ctx, good.ID)
	if goodStored.Status != OfferAccepted {
		t.Fatalf("accepted CPU offer remained open: %#v", goodStored)
	}
}

func TestCPUFreeAgentValuePolicy(t *testing.T) {
	player := PlayerAsset{Age: 25, Overall: 82, Potential: 87}
	ok, _ := ShouldSign(player, 20_000_000, 30_000_000)
	if !ok {
		t.Fatal("expected reasonable free-agent price to be accepted")
	}
	ok, _ = ShouldSign(player, 30_000_001, 30_000_000)
	if ok {
		t.Fatal("expected contract above remaining cap to be rejected")
	}
}
