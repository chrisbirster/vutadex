export type GameEvent = { sequence:number; type:string; quarter:number; clock:number; description:string; yards?:number; scoring?:boolean };
export type GameState = { id:string; seed:number; homeId:string; awayId:string; possession:string; quarter:number; clock:number; down:number; distance:number; ball:number; homeScore:number; awayScore:number; playNumber:number; finished:boolean };
export type Simulation = { state: GameState; events: GameEvent[] };

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, headers: { "Content-Type":"application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) { const body = await response.json().catch(() => ({error: response.statusText})); throw new Error(body.error ?? response.statusText); }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const api = {
  simulate: (seed:number) => request<Simulation>(`/api/v1/demo/simulate?seed=${seed}`, {method:"POST"}),
  magicLink: (email:string) => request<{sent:boolean}>("/api/v1/auth/magic-link", {method:"POST",body:JSON.stringify({email})}),
  verify: (token:string) => request<{id:string;email:string}>("/api/v1/auth/verify", {method:"POST",body:JSON.stringify({token})}),
};
