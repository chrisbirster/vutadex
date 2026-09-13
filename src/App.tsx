import { createRouter, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { api, type PlaybookPlay, type Simulation } from "./api";
import { colors, s } from "./styles.stylex";

function isGameHost() {
  return location.hostname.startsWith("game.");
}

function Root() {
  return isGameHost() ? <GameHome /> : <Marketing />;
}

function Nav() {
  return (
    <nav {...stylex.attrs(s.nav)}>
      <a href="/" {...stylex.attrs(s.brand)}>VUTADEX</a>
      <div {...stylex.attrs(s.links)}>
        <a href="https://vutadex.com" {...stylex.attrs(s.link)}>About</a>
        <a href="https://game.vutadex.com" {...stylex.attrs(s.button)}>Play</a>
      </div>
    </nav>
  );
}

function Marketing() {
  return (
    <>
      <Nav />
      <main>
        <section {...stylex.attrs(s.hero)}>
          <div>
            <div {...stylex.attrs(s.kicker)}>THE FOOTBALL UNIVERSE YOU CONTROL</div>
            <h1 {...stylex.attrs(s.h1)}>Build it. Call it. Play it.</h1>
            <p {...stylex.attrs(s.lead)}>
              Run the franchise as GM, call every snap as coach, and eventually take direct control on a live X/O field. Every season becomes permanent history in the Dex.
            </p>
            <div {...stylex.attrs(s.actions)}>
              <a href="https://game.vutadex.com" {...stylex.attrs(s.button)}>Enter VutaDex</a>
              <a href="#modes" {...stylex.attrs(s.button, s.ghost)}>How it works</a>
            </div>
          </div>
          <XOField />
        </section>
        <section id="modes" {...stylex.attrs(s.section)}>
          <div {...stylex.attrs(s.three)}>
            <Mode title="GM" body="Scout, draft, trade, sign and construct the organization." />
            <Mode title="COACH" body="Choose personnel, formations, concepts, audibles and situational calls." />
            <Mode title="PLAYER" body="Take direct control after the snap as the real-time engine grows." />
          </div>
        </section>
      </main>
    </>
  );
}

function Mode(props: { title: string; body: string }) {
  return (
    <article {...stylex.attrs(s.card)}>
      <div {...stylex.attrs(s.kicker)}>{props.title}</div>
      <h2>{props.title} MODE</h2>
      <p {...stylex.attrs(s.muted)}>{props.body}</p>
    </article>
  );
}

function XOField() {
  const xs: ReadonlyArray<readonly [number, number]> = [
    [18, 75], [31, 75], [43, 75], [50, 75], [57, 75], [69, 75], [82, 75], [50, 83], [36, 88], [64, 88], [50, 93],
  ];
  const os: ReadonlyArray<readonly [number, number]> = [
    [18, 35], [31, 35], [43, 35], [50, 35], [57, 35], [69, 35], [82, 35], [30, 25], [50, 24], [70, 25], [50, 14],
  ];
  return (
    <div {...stylex.attrs(s.card)}>
      <div {...stylex.attrs(s.field)}>
        <For each={[10, 20, 30, 40, 50, 60, 70, 80, 90]}>
          {(y) => <div {...stylex.attrs(s.yard)} style={{ top: `${y}%` }} />}
        </For>
        <For each={xs}>
          {(point) => <div {...stylex.attrs(s.token, s.x)} style={{ left: `${point[0]}%`, top: `${point[1]}%` }}>X</div>}
        </For>
        <For each={os}>
          {(point) => <div {...stylex.attrs(s.token, s.o)} style={{ left: `${point[0]}%`, top: `${point[1]}%` }}>O</div>}
        </For>
      </div>
    </div>
  );
}

function GameHome() {
  const params = useParams();
  const navigate = useNavigate();
  const [game, setGame] = createSignal<Simulation>();
  const [plays, setPlays] = createSignal<PlaybookPlay[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  async function bootstrap() {
    setBusy(true);
    setError("");
    try {
      const books = await api.playbooks();
      setPlays(books.offense);
      if (params.id) {
        setGame(await api.game(params.id));
      } else {
        await newGame(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Coach Mode");
    } finally {
      setBusy(false);
    }
  }

  async function newGame(showBusy = true) {
    if (showBusy) setBusy(true);
    setError("");
    try {
      const created = await api.createGame(Math.floor(Math.random() * 1_000_000_000));
      setGame(created);
      navigate(`/game/${created.state.id}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start game");
    } finally {
      if (showBusy) setBusy(false);
    }
  }

  async function call(playId: string) {
    const current = game();
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      setGame(await api.callPlay(current.state.id, playId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Play call failed");
    } finally {
      setBusy(false);
    }
  }

  void bootstrap();

  const canCall = () => {
    const state = game()?.state;
    return Boolean(state && !state.finished && state.possession === state.homeId && !busy());
  };

  return (
    <>
      <Nav />
      <main {...stylex.attrs(s.shell)}>
        <div {...stylex.attrs(s.score)}>
          <div>
            <div {...stylex.attrs(s.team)}>TEAM X</div>
            <div {...stylex.attrs(s.muted)}>Coach: You</div>
          </div>
          <div {...stylex.attrs(s.center)}>
            <strong>{game()?.state.homeScore ?? 0} — {game()?.state.awayScore ?? 0}</strong>
            <div {...stylex.attrs(s.muted)}>
              <Show when={game()} fallback="LOADING COACH MODE">
                Q{game()!.state.quarter} {formatClock(game()!.state.clock)} · {downAndDistance(game()!.state.down, game()!.state.distance)} · {fieldPosition(game()!.state.ball)}
              </Show>
            </div>
          </div>
          <div style={{ "text-align": "right" }}>
            <div {...stylex.attrs(s.team)}>TEAM O</div>
            <div {...stylex.attrs(s.muted)}>CPU</div>
          </div>
        </div>

        <Show when={error()}>
          <div {...stylex.attrs(s.card)} style={{ "margin-bottom": "16px", color: colors.danger }}>{error()}</div>
        </Show>

        <div {...stylex.attrs(s.grid)}>
          <div>
            <XOField />
            <section {...stylex.attrs(s.card)} style={{ "margin-top": "18px" }}>
              <div {...stylex.attrs(s.kicker)}>OFFENSIVE PLAY CALL</div>
              <p {...stylex.attrs(s.muted)}>
                Choose a VutaDex concept. When your possession ends, the CPU runs its drive through the same deterministic engine and returns control to Team X.
              </p>
              <div {...stylex.attrs(s.actions)}>
                <For each={plays()}>
                  {(play) => (
                    <button
                      type="button"
                      {...stylex.attrs(s.button, s.ghost)}
                      disabled={!canCall()}
                      onClick={() => call(play.id)}
                      title={`${play.formation} · ${play.personnel} personnel · ${play.concept}`}
                    >
                      {play.name}
                    </button>
                  )}
                </For>
              </div>
              <div {...stylex.attrs(s.actions)} style={{ "margin-top": "12px" }}>
                <button type="button" {...stylex.attrs(s.button)} disabled={!canCall()} onClick={() => call("special-punt")}>Punt</button>
                <button type="button" {...stylex.attrs(s.button)} disabled={!canCall()} onClick={() => call("special-field-goal")}>Field goal</button>
                <button type="button" {...stylex.attrs(s.button, s.ghost)} disabled={busy()} onClick={() => void newGame()}>New game</button>
              </div>
              <Show when={game()?.state.finished}>
                <p><strong>FINAL:</strong> Team X {game()!.state.homeScore}, Team O {game()!.state.awayScore}</p>
              </Show>
            </section>
          </div>

          <aside {...stylex.attrs(s.card)}>
            <div {...stylex.attrs(s.kicker)}>PLAY-BY-PLAY</div>
            <p {...stylex.attrs(s.muted)}>
              Game state is owned by the Go server. Each button advances exactly one human snap; opponent snaps are clearly listed in the same event stream.
            </p>
            <div {...stylex.attrs(s.feed)} style={{ "margin-top": "18px" }}>
              <For each={game()?.events.slice().reverse() ?? []}>
                {(event) => (
                  <div {...stylex.attrs(s.play)}>
                    <strong>Q{event.quarter}</strong> {formatClock(event.clock)}<br />
                    <span {...stylex.attrs(s.muted)}>{event.description}</span>
                  </div>
                )}
              </For>
              <Show when={!game()?.events.length}>
                <div {...stylex.attrs(s.muted)}>Call the first play to begin the drive.</div>
              </Show>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

function Login() {
  const [email, setEmail] = createSignal("");
  const [sent, setSent] = createSignal(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    await api.magicLink(email());
    setSent(true);
  }

  return (
    <>
      <Nav />
      <main {...stylex.attrs(s.section)}>
        <div {...stylex.attrs(s.card)} style={{ "max-width": "600px", margin: "40px auto" }}>
          <div {...stylex.attrs(s.kicker)}>MAGIC LINK</div>
          <h1>Sign in to VutaDex</h1>
          <Show when={!sent()} fallback={<p>Check your email. The link expires in 10 minutes.</p>}>
            <form {...stylex.attrs(s.form)} onSubmit={submit}>
              <input {...stylex.attrs(s.input)} type="email" required placeholder="you@example.com" value={email()} onInput={(event) => setEmail(event.currentTarget.value)} />
              <button {...stylex.attrs(s.button)}>Send link</button>
            </form>
          </Show>
        </div>
      </main>
    </>
  );
}

function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = createSignal("");

  async function verify() {
    try {
      await api.verify(String(params.token ?? ""));
      navigate("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification failed");
    }
  }

  return (
    <>
      <Nav />
      <main {...stylex.attrs(s.section)}>
        <div {...stylex.attrs(s.card)} style={{ "max-width": "600px", margin: "40px auto" }}>
          <div {...stylex.attrs(s.kicker)}>CONFIRM SIGN-IN</div>
          <h1>Finish signing in</h1>
          <p {...stylex.attrs(s.muted)}>For safety, the email link does not consume itself until you confirm here.</p>
          <button {...stylex.attrs(s.button)} onClick={verify}>Confirm sign-in</button>
          <Show when={error()}><p style={{ color: colors.danger }}>{error()}</p></Show>
        </div>
      </main>
    </>
  );
}

function NotFound() {
  return <><Nav /><main {...stylex.attrs(s.section)}><h1>Not found</h1></main></>;
}

const Router = createRouter({
  routes: [
    { path: "/", component: Root },
    { path: "/game", component: GameHome },
    { path: "/game/:id", component: GameHome },
    { path: "/login", component: Login },
    { path: "/login/verify", component: Verify },
    { path: "*404", component: NotFound },
  ],
});

export function App() {
  return <Router />;
}

function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function downAndDistance(down: number, distance: number) {
  const suffix = down === 1 ? "st" : down === 2 ? "nd" : down === 3 ? "rd" : "th";
  return `${down}${suffix} & ${distance}`;
}

function fieldPosition(ball: number) {
  if (ball === 50) return "50";
  return ball < 50 ? `OWN ${ball}` : `OPP ${100 - ball}`;
}
