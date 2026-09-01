// A tiny synthesized background loop --- no external audio file to fetch or
// bundle, so intensity can react to the game's own round number for free.
// Must be started from a real user gesture (the start button click): browsers
// refuse to run an AudioContext until one occurs.
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let timerId: number | null = null;
let step = 0;
let stepMs = 260;
let muted = false;
let currentGain = 0.4;

const BASS_PATTERN = [55, 55, 82.41, 65.41, 55, 55, 73.42, 61.74]; // a minor-ish riff, A1 root

function scheduleNote(freq: number, time: number, duration: number, type: OscillatorType, peak: number): void {
  if (!ctx || !filter) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(peak, time + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(gain);
  gain.connect(filter);
  osc.start(time);
  osc.stop(time + duration + 0.05);
}

function step_(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  const note = BASS_PATTERN[step % BASS_PATTERN.length];
  scheduleNote(note, now, (stepMs / 1000) * 0.85, "sawtooth", 0.5);
  if (step % 2 === 0) scheduleNote(note * 4, now, 0.05, "square", 0.12);
  step += 1;
}

function paramsForRound(round: number): { stepMs: number; filterFreq: number; gain: number } {
  const r = Math.max(1, round) - 1;
  return {
    stepMs: Math.max(150, 260 - r * 6),
    filterFreq: Math.min(2400, 900 + r * 70),
    gain: Math.min(0.6, 0.4 + r * 0.012),
  };
}

export function startMusic(): void {
  if (ctx) return;
  ctx = new AudioContext();
  filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  masterGain = ctx.createGain();
  masterGain.gain.value = 0;
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);
  timerId = window.setInterval(step_, stepMs);
  setIntensity(1);
}

export function setIntensity(round: number): void {
  if (!ctx || !filter || !masterGain) return;
  const params = paramsForRound(round);
  filter.frequency.setTargetAtTime(params.filterFreq, ctx.currentTime, 0.3);
  currentGain = params.gain;
  masterGain.gain.setTargetAtTime(muted ? 0 : currentGain, ctx.currentTime, 0.3);
  if (params.stepMs !== stepMs) {
    stepMs = params.stepMs;
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = window.setInterval(step_, stepMs);
    }
  }
}

export function toggleMute(): boolean {
  muted = !muted;
  if (ctx && masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : currentGain, ctx.currentTime, 0.1);
  return muted;
}

export function isMuted(): boolean {
  return muted;
}
