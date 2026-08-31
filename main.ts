// Wiring only: build the initial state, hook up input, run the render loop.
// All rules live in game-logic.ts; all DOM writes live in render.ts.
import { advancePhase, checkCollision, createInitialState, movePlayer, restart } from "./game-logic.ts";
import { initUI, render } from "./render.ts";

let state = createInitialState({ now: performance.now() });
let started = false;

const arenaEl = document.querySelector<HTMLElement>("#arena")!;
const startScreenEl = document.querySelector<HTMLElement>("#start-screen")!;

initUI(state.walls);
render(state, performance.now());

const KEY_DELTAS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

window.addEventListener("keydown", (event) => {
  if (!started) return;
  const delta = KEY_DELTAS[event.key];
  if (!delta) return;
  event.preventDefault();
  state = movePlayer(state, delta[0], delta[1]);
  render(state, performance.now());
});

document.querySelector<HTMLButtonElement>("#start-button")!.addEventListener("click", () => {
  started = true;
  state = restart(state, performance.now());
  startScreenEl.hidden = true;
  arenaEl.hidden = false;
  render(state, performance.now());
});

document.querySelector<HTMLButtonElement>("#restart")!.addEventListener("click", () => {
  state = restart(state, performance.now());
  render(state, performance.now());
});

function tick(now: number): void {
  if (started) {
    state = advancePhase(state, now);
    state = checkCollision(state, now);
    render(state, now);
  }
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
