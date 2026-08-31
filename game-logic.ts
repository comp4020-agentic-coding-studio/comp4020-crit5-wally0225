// Pure game state and rules --- no DOM here, so vitest can exercise a round's
// rules (movement, timing, collision) directly. `render.ts` is the only part
// of the game that touches the document.
import { cellId, safeCellsForDirection, type Direction, type Wall } from "./safe-cells.ts";

export type Phase = "warning" | "attack" | "retract" | "buffer" | "gameOver";

export interface Position {
  col: number;
  row: number;
}

export interface GameState {
  round: number;
  direction: Direction;
  phase: Phase;
  phaseStartedAt: number;
  player: Position;
  walls: Wall[];
  n: number;
  pickDirection: () => Direction;
}

export const WARNING_MS = 5000;
export const ATTACK_MS = 1000;
export const RETRACT_MS = 2000;
export const BUFFER_MS = 2000;

const PHASE_DURATIONS: Record<Exclude<Phase, "gameOver">, number> = {
  warning: WARNING_MS,
  attack: ATTACK_MS,
  retract: RETRACT_MS,
  buffer: BUFFER_MS,
};

const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

export function randomDirection(): Direction {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
}

const DEFAULT_WALLS: Wall[] = [
  { col: 2, row: 2 }, // b2
  { col: 4, row: 4 }, // d4
];
const DEFAULT_PLAYER: Position = { col: 3, row: 3 }; // c3, exposed under every direction
const DEFAULT_N = 5;

export interface CreateStateOptions {
  pickDirection?: () => Direction;
  walls?: Wall[];
  player?: Position;
  n?: number;
  now?: number;
}

export function createInitialState(opts: CreateStateOptions = {}): GameState {
  const pickDirection = opts.pickDirection ?? randomDirection;
  return {
    round: 1,
    direction: pickDirection(),
    phase: "warning",
    phaseStartedAt: opts.now ?? 0,
    player: opts.player ?? DEFAULT_PLAYER,
    walls: opts.walls ?? DEFAULT_WALLS,
    n: opts.n ?? DEFAULT_N,
    pickDirection,
  };
}

export function restart(state: GameState, now: number): GameState {
  return createInitialState({
    pickDirection: state.pickDirection,
    walls: state.walls,
    n: state.n,
    now,
  });
}

export function movePlayer(state: GameState, dx: number, dy: number): GameState {
  if (state.phase === "gameOver") return state;
  const col = state.player.col + dx;
  const row = state.player.row + dy;
  if (col < 1 || col > state.n || row < 1 || row > state.n) return state;
  if (state.walls.some((w) => w.col === col && w.row === row)) return state;
  return { ...state, player: { col, row } };
}

// Advances phases whose time has elapsed, carrying over any remainder so a
// slow frame can't lose time. A no-op once the game is over.
export function advancePhase(state: GameState, now: number): GameState {
  if (state.phase === "gameOver") return state;

  let phase = state.phase;
  let round = state.round;
  let direction = state.direction;
  let elapsed = now - state.phaseStartedAt;
  let phaseStartedAt = state.phaseStartedAt;

  while (elapsed >= PHASE_DURATIONS[phase as Exclude<Phase, "gameOver">]) {
    elapsed -= PHASE_DURATIONS[phase as Exclude<Phase, "gameOver">];
    phaseStartedAt = now - elapsed;
    switch (phase) {
      case "warning":
        phase = "attack";
        break;
      case "attack":
        phase = "retract";
        break;
      case "retract":
        phase = "buffer";
        break;
      case "buffer":
        phase = "warning";
        round += 1;
        direction = state.pickDirection();
        break;
    }
  }

  if (phase === state.phase && phaseStartedAt === state.phaseStartedAt) return state;
  return { ...state, phase, round, direction, phaseStartedAt };
}

// How far (in cells) the active direction's pillar has to travel from its
// entry edge to reach this position --- row/col 1 is nearest the edge it
// enters from.
function depthOf(direction: Direction, position: Position, n: number): number {
  switch (direction) {
    case "up":
      return position.row;
    case "down":
      return n - position.row + 1;
    case "left":
      return position.col;
    case "right":
      return n - position.col + 1;
  }
}

// A cell that isn't in the safe set is, by construction, always reached by
// the sweep before it could be blocked --- so collision needs no separate
// wall-clamp: just compare elapsed travel to the player's depth.
export function checkCollision(state: GameState, now: number): GameState {
  if (state.phase !== "attack") return state;

  const safe = safeCellsForDirection(state.direction, state.walls, state.n);
  if (safe.has(cellId(state.player.col, state.player.row))) return state;

  const elapsed = Math.min(Math.max(now - state.phaseStartedAt, 0), ATTACK_MS);
  const t = elapsed / ATTACK_MS;
  const depth = depthOf(state.direction, state.player, state.n);

  if (t * state.n >= depth) return { ...state, phase: "gameOver" };
  return state;
}
