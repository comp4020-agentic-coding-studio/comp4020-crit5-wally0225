// Wiring only: build the initial state, hook up input, run the render loop.
// All rules live in game-logic.ts; all DOM writes live in render.ts.
import { advancePhase, checkCollision, createInitialState, movePlayer, restart } from "./game-logic.ts";
import { initUI, render } from "./render.ts";

let state = createInitialState({ now: performance.now() });

initUI(state.walls);
render(state);

const KEY_DELTAS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

window.addEventListener("keydown", (event) => {
  const delta = KEY_DELTAS[event.key];
  if (!delta) return;
  event.preventDefault();
  state = movePlayer(state, delta[0], delta[1]);
  render(state);
});

document.querySelector<HTMLButtonElement>("#restart")!.addEventListener("click", () => {
  state = restart(state, performance.now());
  render(state);
});

function tick(now: number): void {
  state = advancePhase(state, now);
  state = checkCollision(state, now);
  render(state);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
