import { createRouter, useNavigate, useSearchParams } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { api, type Simulation } from "./api";
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
  const [sim, setSim] = createSignal<Simulation>();
  const [busy, setBusy] = createSignal(false);

  async function run() {
    setBusy(true);
    try {
      setSim(await api.simulate(Math.floor(Math.random() * 1_000_000)));
    } finally {
      setBusy(false);
    }
  }

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
            <strong>{sim()?.state.homeScore ?? 0} — {sim()?.state.awayScore ?? 0}</strong>
            <div {...stylex.attrs(s.muted)}>X/O COACH MODE</div>
          </div>
          <div style={{ "text-align": "right" }}>
            <div {...stylex.attrs(s.team)}>TEAM O</div>
            <div {...stylex.attrs(s.muted)}>CPU</div>
          </div>
        </div>
        <div {...stylex.attrs(s.grid)}>
          <XOField />
          <aside {...stylex.attrs(s.card)}>
            <div {...stylex.attrs(s.kicker)}>PLAY-BY-PLAY</div>
            <p {...stylex.attrs(s.muted)}>
              The Go engine is deterministic and authoritative. This button runs a complete seeded game while M6 evolves into snap-by-snap coach mode.
            </p>
            <button {...stylex.attrs(s.button)} disabled={busy()} onClick={run}>{busy() ? "Simulating…" : "Simulate game"}</button>
            <div {...stylex.attrs(s.feed)} style={{ "margin-top": "18px" }}>
              <For each={sim()?.events.slice(-18).reverse() ?? []}>
                {(event) => (
                  <div {...stylex.attrs(s.play)}>
                    <strong>Q{event.quarter}</strong> {formatClock(event.clock)}<br />
                    <span {...stylex.attrs(s.muted)}>{event.description}</span>
                  </div>
                )}
              </For>
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
