// Wiring only: build the initial state, hook up input, run the render loop.
// All rules live in game-logic.ts; all DOM writes live in render.ts.
import { advancePhase, checkCollision, createInitialState, movePlayer, restart } from "./game-logic.ts";
import { initUI, render } from "./render.ts";
import { setIntensity, startMusic, toggleMute } from "./audio.ts";

let state = createInitialState({ now: performance.now() });
let started = false;
let lastMusicRound = state.round;

const arenaEl = document.querySelector<HTMLElement>("#arena")!;
const startScreenEl = document.querySelector<HTMLElement>("#start-screen")!;
const muteButtonEl = document.querySelector<HTMLButtonElement>("#mute-button")!;

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
  startMusic();
  lastMusicRound = state.round;
  setIntensity(state.round);
  render(state, performance.now());
});

document.querySelector<HTMLButtonElement>("#restart")!.addEventListener("click", () => {
  state = restart(state, performance.now());
  render(state, performance.now());
});

muteButtonEl.addEventListener("click", () => {
  const muted = toggleMute();
  muteButtonEl.textContent = muted ? "🔇" : "🔊";
  muteButtonEl.setAttribute("aria-pressed", String(muted));
});

function tick(now: number): void {
  if (started) {
    state = advancePhase(state, now);
    state = checkCollision(state, now);
    if (state.round !== lastMusicRound) {
      lastMusicRound = state.round;
      setIntensity(state.round);
    }
    render(state, now);
  }
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
