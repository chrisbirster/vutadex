export type GameEvent = { sequence:number; type:string; quarter:number; clock:number; description:string; yards?:number; scoring?:boolean };
export type GameState = { id:string; seed:number; homeId:string; awayId:string; possession:string; quarter:number; clock:number; down:number; distance:number; ball:number; homeScore:number; awayScore:number; playNumber:number; finished:boolean };
export type FourthDownAdvice = { kind:"go"|"field_goal"|"punt"; label:string; reason:string };
export type CoachingMetrics = {
  fourthDownDecisions:number;
  fourthDownCorrect:number;
  delayOfGames:number;
  clockDecisions:number;
  clockCorrect:number;
  audibles:number;
};
export type CoachingGrade = {
  overall:number;
  decisionMaking:number;
  discipline:number;
  clockManagement:number;
  samples:number;
  summary:string[];
};
export type Simulation = {
  state: GameState;
  events: GameEvent[];
  playDeadline:string;
  playClock:number;
  timeouts:number;
  hurryUp:boolean;
  fourthDown?:FourthDownAdvice;
  metrics:CoachingMetrics;
  grade:CoachingGrade;
};
export type CompleteSimulation = Pick<Simulation, "state" | "events">;
export type PlaybookPlay = { id:string; name:string; side:"offense"|"defense"; formation:string; personnel:string; concept:string };
export type Playbooks = { offense: PlaybookPlay[]; defense: PlaybookPlay[] };
export type AuthSession = { id:string; email:string };
export type MultiplayerSide = "x"|"o";
export type RoundState = { gameId:string; round:number; deadline:string; xLocked:boolean; oLocked:boolean };
export type LobbySnapshot = {
  id:string;
  gameId:string;
  ownerUserId:string;
  guestUserId?:string;
  winnerUserId?:string;
  status:"waiting"|"ready"|"active"|"final"|"forfeited";
  sequence:number;
  round:RoundState;
  createdAt:string;
  updatedAt:string;
};
export type LobbySelection = { side:MultiplayerSide; formation:string; playId:string; lockedAt:string };
export type LobbyResolution = { x:LobbySelection; o:LobbySelection; ready:boolean };
export type LobbyEvent = {
  sequence:number;
  kind:string;
  at:string;
  side?:MultiplayerSide;
  message:string;
  resolution?:LobbyResolution;
  game?:Simulation;
  winnerUserId?:string;
};
export type LobbyCatchUp = { room:LobbySnapshot; events:LobbyEvent[] };
export type LobbyCreate = { room:LobbySnapshot; inviteCode:string };

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, headers: { "Content-Type":"application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? response.statusText);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const api = {
  playbooks: () => request<Playbooks>("/api/v1/playbooks"),
  createGame: (seed:number) => request<Simulation>(`/api/v1/demo/games?seed=${seed}`, { method:"POST" }),
  game: (id:string) => request<Simulation>(`/api/v1/demo/games/${encodeURIComponent(id)}`),
  callPlay: (id:string, playId:string, audibleFrom = "") => request<Simulation>(`/api/v1/demo/games/${encodeURIComponent(id)}/plays`, {
    method:"POST",
    body:JSON.stringify({ playId, audibleFrom: audibleFrom || undefined }),
  }),
  coachingAction: (id:string, action:"timeout"|"hurry_up_on"|"hurry_up_off") => request<Simulation>(`/api/v1/demo/games/${encodeURIComponent(id)}/actions`, {
    method:"POST",
    body:JSON.stringify({ action }),
  }),
  simulate: (seed:number) => request<CompleteSimulation>(`/api/v1/demo/simulate?seed=${seed}`, { method:"POST" }),
  session: () => request<AuthSession>("/api/v1/auth/session"),
  createRoom: (seed:number) => request<LobbyCreate>(`/api/v1/rooms?seed=${seed}`, { method:"POST" }),
  joinRoom: (inviteCode:string) => request<LobbyCatchUp>("/api/v1/rooms/join", { method:"POST", body:JSON.stringify({ inviteCode }) }),
  room: (id:string, since = 0) => request<LobbyCatchUp>(`/api/v1/rooms/${encodeURIComponent(id)}?since=${since}`),
  lockRoomCall: (id:string, formation:string, playId:string) => request<LobbyCatchUp>(`/api/v1/rooms/${encodeURIComponent(id)}/calls`, {
    method:"POST",
    body:JSON.stringify({ formation, playId }),
  }),
  forfeitRoom: (id:string) => request<LobbyCatchUp>(`/api/v1/rooms/${encodeURIComponent(id)}/forfeit`, { method:"POST" }),
  magicLink: (email:string) => request<{sent:boolean}>("/api/v1/auth/magic-link", { method:"POST", body:JSON.stringify({ email }) }),
  verify: (token:string) => request<{id:string;email:string}>("/api/v1/auth/verify", { method:"POST", body:JSON.stringify({ token }) }),
};
