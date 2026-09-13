import { useNavigate, useParams } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import {
  api,
  type AuthSession,
  type LobbyCatchUp,
  type LobbyCreate,
  type LobbyEvent,
  type LobbySnapshot,
  type PlaybookPlay,
  type Simulation,
} from "./api";
import { colors, s } from "./styles.stylex";

function PageNav() {
  return (
    <nav {...stylex.attrs(s.nav)}>
      <a href="/" {...stylex.attrs(s.brand)}>VUTADEX</a>
      <div {...stylex.attrs(s.links)}>
        <a href="/multiplayer" {...stylex.attrs(s.link)}>Multiplayer</a>
        <a href="/" {...stylex.attrs(s.button, s.ghost)}>Coach Mode</a>
      </div>
    </nav>
  );
}

function specialPlay(id: string, name: string): PlaybookPlay {
  return { id, name, side: "offense", formation: "Situational", personnel: "special", concept: id.replace("special-", "") };
}

export function MultiplayerLobby() {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = createSignal("");
  const [created, setCreated] = createSignal<LobbyCreate>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  async function createRoom() {
    setBusy(true);
    setError("");
    try {
      setCreated(await api.createRoom(Math.floor(Math.random() * 1_000_000_000)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create multiplayer room");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    setBusy(true);
    setError("");
    try {
      const joined = await api.joinRoom(inviteCode().trim());
      navigate(`/room/${joined.room.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to join room");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageNav />
      <main {...stylex.attrs(s.section)}>
        <div {...stylex.attrs(s.three)}>
          <section {...stylex.attrs(s.card)}>
            <div {...stylex.attrs(s.kicker)}>HOST A GAME</div>
            <h1>Create a private room</h1>
            <p {...stylex.attrs(s.muted)}>You become Team X. Share the one-time room invite code with the Team O coach.</p>
            <button type="button" {...stylex.attrs(s.button)} disabled={busy()} onClick={() => void createRoom()}>Create room</button>
            <Show when={created()}>
              <div {...stylex.attrs(s.card)} style={{ "margin-top": "16px" }}>
                <div {...stylex.attrs(s.kicker)}>INVITE CODE</div>
                <strong>{created()!.inviteCode}</strong>
                <p {...stylex.attrs(s.muted)}>Room {created()!.room.id}</p>
                <a {...stylex.attrs(s.button)} href={`/room/${created()!.room.id}`}>Open room</a>
              </div>
            </Show>
          </section>

          <section {...stylex.attrs(s.card)}>
            <div {...stylex.attrs(s.kicker)}>JOIN A GAME</div>
            <h2>Coach Team O</h2>
            <p {...stylex.attrs(s.muted)}>Paste the invite code from the Team X coach.</p>
            <div {...stylex.attrs(s.form)}>
              <input
                {...stylex.attrs(s.input)}
                value={inviteCode()}
                placeholder="Invite code"
                onInput={(event) => setInviteCode(event.currentTarget.value)}
              />
              <button type="button" {...stylex.attrs(s.button)} disabled={busy() || !inviteCode().trim()} onClick={() => void joinRoom()}>Join room</button>
            </div>
          </section>

          <section {...stylex.attrs(s.card)}>
            <div {...stylex.attrs(s.kicker)}>HOW IT WORKS</div>
            <h2>Private until both lock</h2>
            <p {...stylex.attrs(s.muted)}>Each coach chooses the call for their team. The opponent only sees that you locked—not the play itself. Once both calls lock, the server reveals both and resolves one deterministic snap.</p>
            <p {...stylex.attrs(s.muted)}>Room state is sequence-numbered so reconnecting clients can request only the events they missed.</p>
          </section>
        </div>
        <Show when={error()}><p style={{ color: colors.danger }}>{error()}</p></Show>
      </main>
    </>
  );
}

export function MultiplayerRoom() {
  const params = useParams();
  const [session, setSession] = createSignal<AuthSession>();
  const [room, setRoom] = createSignal<LobbySnapshot>();
  const [events, setEvents] = createSignal<LobbyEvent[]>([]);
  const [game, setGame] = createSignal<Simulation>();
  const [offensePlays, setOffensePlays] = createSignal<PlaybookPlay[]>([]);
  const [defensePlays, setDefensePlays] = createSignal<PlaybookPlay[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  async function bootstrap() {
    setBusy(true);
    setError("");
    try {
      const roomID = params.roomId;
      if (!roomID) throw new Error("Room ID is missing from the route");
      const [me, books, catchUp] = await Promise.all([api.session(), api.playbooks(), api.room(roomID, 0)]);
      setSession(me);
      setOffensePlays(books.offense);
      setDefensePlays(books.defense);
      applyCatchUp(catchUp);
      setGame(await api.game(catchUp.room.gameId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load multiplayer room");
    } finally {
      setBusy(false);
    }
  }

  function applyCatchUp(catchUp: LobbyCatchUp) {
    setRoom(catchUp.room);
    setEvents((current) => {
      const bySequence = new Map(current.map((event) => [event.sequence, event]));
      for (const event of catchUp.events) bySequence.set(event.sequence, event);
      return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
    });
    for (const event of catchUp.events) {
      if (event.game) setGame(event.game);
    }
  }

  async function refresh() {
    const current = room();
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const catchUp = await api.room(current.id, current.sequence);
      applyCatchUp(catchUp);
      if (!catchUp.events.some((event) => event.game)) setGame(await api.game(current.gameId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh room");
    } finally {
      setBusy(false);
    }
  }

  async function lock(play: PlaybookPlay) {
    const current = room();
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      applyCatchUp(await api.lockRoomCall(current.id, play.formation, play.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to lock call");
    } finally {
      setBusy(false);
    }
  }

  async function forfeit() {
    const current = room();
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      applyCatchUp(await api.forfeitRoom(current.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to forfeit room");
    } finally {
      setBusy(false);
    }
  }

  void bootstrap();

  const side = () => session()?.id === room()?.ownerUserId ? "x" : "o";
  const myTeam = () => side() === "x" ? "TEAM X" : "TEAM O";
  const myLocked = () => side() === "x" ? room()?.round.xLocked : room()?.round.oLocked;
  const isOffense = () => {
    const current = game()?.state;
    if (!current) return false;
    return side() === "x" ? current.possession === current.homeId : current.possession === current.awayId;
  };
  const plays = () => isOffense() ? offensePlays() : defensePlays();
  const roomOpen = () => room()?.status === "ready" || room()?.status === "active";

  return (
    <>
      <PageNav />
      <main {...stylex.attrs(s.shell)}>
        <div {...stylex.attrs(s.score)}>
          <div>
            <div {...stylex.attrs(s.team)}>{myTeam()}</div>
            <div {...stylex.attrs(s.muted)}>{isOffense() ? "OFFENSE" : "DEFENSE"} · {myLocked() ? "CALL LOCKED" : "CALL OPEN"}</div>
          </div>
          <div {...stylex.attrs(s.center)}>
            <strong>{game()?.state.homeScore ?? 0} — {game()?.state.awayScore ?? 0}</strong>
            <div {...stylex.attrs(s.muted)}>
              <Show when={game()} fallback="LOADING ROOM">
                Q{game()!.state.quarter} · {game()!.state.down}&{game()!.state.distance} · Round {room()?.round.round ?? 0}
              </Show>
            </div>
          </div>
          <div style={{ "text-align": "right" }}>
            <div {...stylex.attrs(s.team)}>{room()?.status?.toUpperCase() ?? "ROOM"}</div>
            <div {...stylex.attrs(s.muted)}>SEQ {room()?.sequence ?? 0}</div>
          </div>
        </div>

        <Show when={error()}><div {...stylex.attrs(s.card)} style={{ "margin-bottom": "16px", color: colors.danger }}>{error()}</div></Show>
        <Show when={room()?.status === "waiting"}>
          <div {...stylex.attrs(s.card)} style={{ "margin-bottom": "16px" }}>Waiting for the Team O coach to join with the invite code.</div>
        </Show>

        <div {...stylex.attrs(s.grid)}>
          <section {...stylex.attrs(s.card)}>
            <div {...stylex.attrs(s.kicker)}>{isOffense() ? "OFFENSIVE CALL" : "DEFENSIVE CALL"}</div>
            <p {...stylex.attrs(s.muted)}>Your play remains private until both teams lock this round.</p>
            <div {...stylex.attrs(s.actions)}>
              <For each={plays()}>
                {(play) => <button type="button" {...stylex.attrs(s.button, s.ghost)} disabled={busy() || !roomOpen() || Boolean(myLocked())} onClick={() => void lock(play)}>{play.name}</button>}
              </For>
            </div>
            <Show when={isOffense()}>
              <div {...stylex.attrs(s.actions)} style={{ "margin-top": "12px" }}>
                <For each={[
                  specialPlay("special-punt", "Punt"),
                  specialPlay("special-field-goal", "Field goal"),
                  specialPlay("special-kneel", "Kneel"),
                  specialPlay("special-spike", "Spike"),
                ]}>
                  {(play) => <button type="button" {...stylex.attrs(s.button, s.ghost)} disabled={busy() || !roomOpen() || Boolean(myLocked())} onClick={() => void lock(play)}>{play.name}</button>}
                </For>
              </div>
            </Show>
            <div {...stylex.attrs(s.actions)} style={{ "margin-top": "16px" }}>
              <button type="button" {...stylex.attrs(s.button)} disabled={busy()} onClick={() => void refresh()}>Refresh / catch up</button>
              <button type="button" {...stylex.attrs(s.button, s.ghost)} disabled={busy() || room()?.status === "final" || room()?.status === "forfeited"} onClick={() => void forfeit()}>Forfeit</button>
            </div>
          </section>

          <aside {...stylex.attrs(s.card)}>
            <div {...stylex.attrs(s.kicker)}>ROOM EVENTS</div>
            <For each={events().slice().reverse()}>
              {(event) => (
                <div {...stylex.attrs(s.play)}>
                  <strong>#{event.sequence} {event.kind.replaceAll("_", " ").toUpperCase()}</strong><br />
                  <span {...stylex.attrs(s.muted)}>{event.message}</span>
                  <Show when={event.resolution}>
                    <div {...stylex.attrs(s.muted)}>X: {event.resolution!.x.playId} · O: {event.resolution!.o.playId}</div>
                  </Show>
                </div>
              )}
            </For>
          </aside>
        </div>
      </main>
    </>
  );
}
