// Pure game state and rules --- no DOM here, so vitest can exercise a round's
// rules (movement, timing, collision) directly. `render.ts` is the only part
// of the game that touches the document.
import {
  cellId,
  safeCellsForDirection,
  safeCellsForDirections,
  type Direction,
  type Wall,
} from "./safe-cells.ts";

export type Phase = "warning" | "attack" | "retract" | "buffer" | "gameOver";

export interface Position {
  col: number;
  row: number;
}

export interface GameState {
  round: number;
  directions: Direction[];
  phase: Phase;
  phaseStartedAt: number;
  roundStartedAt: number;
  player: Position;
  walls: Wall[];
  n: number;
  pickDirections: (round: number, walls: Wall[], n: number) => Direction[];
  pickWalls: (exclude: Position, n: number) => Wall[];
}

export const WARNING_MS = 5000;
export const ATTACK_MS = 1000;
export const RETRACT_MS = 2000;
export const BUFFER_MS = 2000;
export const ROUND_MS = WARNING_MS + ATTACK_MS + RETRACT_MS + BUFFER_MS;

// From round 7, rounds speed up: less time to read the warning, a snappier
// retract --- attack and buffer stay the same length.
const FAST_ROUND_START = 7;
const FAST_WARNING_MS = 3000;
const FAST_RETRACT_MS = 1000;
export const FLASH_WINDOW_MS = 2000;
const FAST_FLASH_WINDOW_MS = 1500;

function isFastRound(round: number): boolean {
  return round >= FAST_ROUND_START;
}

function phaseDurationsForRound(round: number): Record<Exclude<Phase, "gameOver">, number> {
  return isFastRound(round)
    ? { warning: FAST_WARNING_MS, attack: ATTACK_MS, retract: FAST_RETRACT_MS, buffer: BUFFER_MS }
    : { warning: WARNING_MS, attack: ATTACK_MS, retract: RETRACT_MS, buffer: BUFFER_MS };
}

export function warningMsForRound(round: number): number {
  return phaseDurationsForRound(round).warning;
}

export function flashWindowMsForRound(round: number): number {
  return isFastRound(round) ? FAST_FLASH_WINDOW_MS : FLASH_WINDOW_MS;
}

export function roundDurationForRound(round: number): number {
  const d = phaseDurationsForRound(round);
  return d.warning + d.attack + d.retract + d.buffer;
}

// Walls regenerate every 5 rounds through round 10 for variety; after round
// 10 every single round gets a fresh layout, so the board itself keeps
// players from settling into a memorised safe route late-game.
const WALL_CHURN_START = 11;

function shouldRegenerateWalls(round: number): boolean {
  return round >= WALL_CHURN_START || (round - 1) % 5 === 0;
}

const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

// Rounds 1-4 attack from 1 direction; round 5 onward attacks from 2,
// capped there --- guaranteeing a hiding spot against 3 simultaneous
// directions needs a wall "sandwich" on both axes at once, which general
// position across all the walls never produces, so the escalation stops
// at 2.
export function directionCountForRound(round: number): number {
  if (round >= 5) return 2;
  return 1;
}

// A second attack direction must come off the other axis --- an up/down
// attack can only gain left/right, never the opposite direction on its own
// axis (up+down or left+right never attack together).
const PERPENDICULAR: Record<Direction, Direction[]> = {
  up: ["left", "right"],
  down: ["left", "right"],
  left: ["up", "down"],
  right: ["up", "down"],
};

const PERPENDICULAR_PAIRS: [Direction, Direction][] = [
  ["up", "left"],
  ["up", "right"],
  ["down", "left"],
  ["down", "right"],
];

// Which perpendicular pairs still leave at least one cell safe against both
// directions at once, for the given walls --- so a 2-direction round only
// ever picks from a pair players can actually hide from.
export function solvablePairs(walls: Wall[], n = 5): [Direction, Direction][] {
  return PERPENDICULAR_PAIRS.filter(
    ([a, b]) => safeCellsForDirections([a, b], walls, n).size > 0,
  );
}

function pick<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

export function defaultPickDirections(round: number, walls: Wall[], n: number): Direction[] {
  if (directionCountForRound(round) === 1) return [pick(DIRECTIONS)];

  const pairs = solvablePairs(walls, n);
  if (pairs.length > 0) return [...pick(pairs)];
  const primary = pick(DIRECTIONS);
  return [primary, pick(PERPENDICULAR[primary])];
}

const WALL_COUNT = 3;

// Every wall lands on a row and column no other wall occupies --- a shared
// row or column collapses both walls' safety onto the same cells (up/down
// safety only exists in a wall's own column, left/right only in its own
// row), so general position is what gives players more places to hide as
// the wall count grows instead of fewer.
export function defaultPickWalls(exclude: Position, n: number): Wall[] {
  let candidates: Position[] = [];
  for (let col = 2; col <= n - 1; col++) {
    for (let row = 2; row <= n - 1; row++) {
      if (col === exclude.col && row === exclude.row) continue;
      candidates.push({ col, row });
    }
  }

  const walls: Wall[] = [];
  for (let i = 0; i < WALL_COUNT; i++) {
    const chosen = pick(candidates);
    walls.push({ col: chosen.col, row: chosen.row });
    candidates = candidates.filter((c) => c.col !== chosen.col && c.row !== chosen.row);
  }
  return walls;
}

const DEFAULT_WALLS: Wall[] = [
  { col: 2, row: 2 }, // b2
  { col: 6, row: 6 }, // f6
  { col: 3, row: 5 }, // c5
];
const DEFAULT_PLAYER: Position = { col: 4, row: 4 }; // d4, exposed under every direction
const DEFAULT_N = 7;

export interface CreateStateOptions {
  pickDirections?: (round: number, walls: Wall[], n: number) => Direction[];
  pickWalls?: (exclude: Position, n: number) => Wall[];
  walls?: Wall[];
  player?: Position;
  n?: number;
  now?: number;
}

export function createInitialState(opts: CreateStateOptions = {}): GameState {
  const pickDirections = opts.pickDirections ?? defaultPickDirections;
  const pickWalls = opts.pickWalls ?? defaultPickWalls;
  const now = opts.now ?? 0;
  const walls = opts.walls ?? DEFAULT_WALLS;
  const n = opts.n ?? DEFAULT_N;
  return {
    round: 1,
    directions: pickDirections(1, walls, n),
    phase: "warning",
    phaseStartedAt: now,
    roundStartedAt: now,
    player: opts.player ?? DEFAULT_PLAYER,
    walls,
    n,
    pickDirections,
    pickWalls,
  };
}

export function restart(state: GameState, now: number): GameState {
  return createInitialState({
    pickDirections: state.pickDirections,
    pickWalls: state.pickWalls,
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
  let directions = state.directions;
  let walls = state.walls;
  let elapsed = now - state.phaseStartedAt;
  let phaseStartedAt = state.phaseStartedAt;
  let roundStartedAt = state.roundStartedAt;

  while (elapsed >= phaseDurationsForRound(round)[phase as Exclude<Phase, "gameOver">]) {
    elapsed -= phaseDurationsForRound(round)[phase as Exclude<Phase, "gameOver">];
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
        if (shouldRegenerateWalls(round)) {
          walls = state.pickWalls(state.player, state.n);
        }
        directions = state.pickDirections(round, walls, state.n);
        roundStartedAt = phaseStartedAt;
        break;
    }
  }

  if (phase === state.phase && phaseStartedAt === state.phaseStartedAt) return state;
  return { ...state, phase, round, directions, walls, phaseStartedAt, roundStartedAt };
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

  const elapsed = Math.min(Math.max(now - state.phaseStartedAt, 0), ATTACK_MS);
  const t = elapsed / ATTACK_MS;
  const playerCell = cellId(state.player.col, state.player.row);

  const hit = state.directions.some((direction) => {
    const safe = safeCellsForDirection(direction, state.walls, state.n);
    if (safe.has(playerCell)) return false;
    const depth = depthOf(direction, state.player, state.n);
    return t * state.n >= depth;
  });

  return hit ? { ...state, phase: "gameOver" } : state;
}
