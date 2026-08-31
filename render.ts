// The only module that touches the DOM: reads a GameState and writes it out.
// Never mutates state --- game-logic.ts owns that.
import { travelDistance, type Direction, type Wall } from "./safe-cells.ts";
import { ROUND_MS, WARNING_MS, type GameState } from "./game-logic.ts";

const N = 5;
const CELL_PCT = 100 / N;
const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];
const FLASH_WINDOW_MS = 2000;

let boardEl: HTMLElement;
let playerEl: HTMLElement;
let roundEl: HTMLElement;
let roundTimerEl: HTMLElement;
let gameOverEl: HTMLElement;
let roundsSurvivedEl: HTMLElement;
const arrowEls = new Map<Direction, HTMLElement>();
const pillarEls = new Map<Direction, HTMLElement[]>();
const cellEls = new Map<string, HTMLElement>();

export function initUI(walls: Wall[]): void {
  boardEl = document.querySelector<HTMLElement>("#board")!;
  roundEl = document.querySelector<HTMLElement>("#round")!;
  roundTimerEl = document.querySelector<HTMLElement>("#round-timer")!;
  gameOverEl = document.querySelector<HTMLElement>("#game-over")!;
  roundsSurvivedEl = document.querySelector<HTMLElement>("#rounds-survived")!;

  for (const direction of DIRECTIONS) {
    arrowEls.set(
      direction,
      document.querySelector<HTMLElement>(`[data-direction="${direction}"]`)!,
    );
  }

  for (let row = 1; row <= N; row++) {
    for (let col = 1; col <= N; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      if (walls.some((w) => w.col === col && w.row === row)) cell.classList.add("wall");
      boardEl.append(cell);
      cellEls.set(`${col},${row}`, cell);
    }
  }

  const pillarsWrap = document.createElement("div");
  pillarsWrap.className = "pillars";
  boardEl.append(pillarsWrap);

  for (const direction of DIRECTIONS) {
    const els: HTMLElement[] = [];
    for (let lane = 1; lane <= N; lane++) {
      const pillar = document.createElement("div");
      pillar.className = `pillar pillar-${direction}`;
      if (direction === "up" || direction === "down") {
        pillar.style.left = `${(lane - 1) * CELL_PCT}%`;
        pillar.style.width = `${CELL_PCT}%`;
        pillar.style[direction === "up" ? "top" : "bottom"] = "0";
      } else {
        pillar.style.top = `${(lane - 1) * CELL_PCT}%`;
        pillar.style.height = `${CELL_PCT}%`;
        pillar.style[direction === "left" ? "left" : "right"] = "0";
      }
      pillarsWrap.append(pillar);
      els.push(pillar);
    }
    pillarEls.set(direction, els);
  }

  playerEl = document.createElement("div");
  playerEl.className = "player";
  boardEl.append(playerEl);
}

export function render(state: GameState, now: number): void {
  playerEl.style.left = `${(state.player.col - 1) * CELL_PCT + CELL_PCT / 2}%`;
  playerEl.style.top = `${(state.player.row - 1) * CELL_PCT + CELL_PCT / 2}%`;

  for (const [key, cell] of cellEls) {
    const [col, row] = key.split(",").map(Number);
    cell.classList.toggle("wall", state.walls.some((w) => w.col === col && w.row === row));
  }

  const warningThroughRetract =
    state.phase === "warning" || state.phase === "attack" || state.phase === "retract";
  const flashing =
    state.phase === "attack" ||
    (state.phase === "warning" && WARNING_MS - (now - state.phaseStartedAt) <= FLASH_WINDOW_MS);
  for (const direction of DIRECTIONS) {
    const active = warningThroughRetract && state.directions.includes(direction);
    const el = arrowEls.get(direction)!;
    el.classList.toggle("active", active);
    el.classList.toggle("flashing", active && flashing);
  }

  for (const direction of DIRECTIONS) {
    const extending = state.phase === "attack" && state.directions.includes(direction);
    const sizeProp = direction === "up" || direction === "down" ? "height" : "width";
    pillarEls.get(direction)!.forEach((el, i) => {
      const distance = travelDistance(direction, i + 1, state.walls, state.n);
      el.style.transitionDuration = extending ? "1s" : "2s";
      el.style[sizeProp] = `${extending ? distance * CELL_PCT : 0}%`;
    });
  }

  roundEl.textContent = `Round ${state.round}`;
  const seconds =
    state.phase === "gameOver"
      ? 0
      : Math.min(Math.floor((now - state.roundStartedAt) / 1000), ROUND_MS / 1000 - 1);
  roundTimerEl.textContent = `${seconds}s`;

  gameOverEl.hidden = state.phase !== "gameOver";
  if (state.phase === "gameOver") {
    const survived = state.round - 1;
    roundsSurvivedEl.textContent = `Survived ${survived} round${survived === 1 ? "" : "s"}`;
  }
}
