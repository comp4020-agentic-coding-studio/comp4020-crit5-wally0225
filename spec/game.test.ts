import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { advancePhase, ATTACK_MS, checkCollision, createInitialState } from "../game-logic.ts";
import { safeCellsForDirection, travelDistance, type Wall } from "../safe-cells.ts";

// crit 5 ("A game") spec: no how-to-play modal, no instructions page, nothing
// in the README standing in for either. Whether the opening screen itself
// teaches the game is judged at the crit --- this only checks that no
// instructional stand-in shipped in its place.
const DIST = resolve("dist");
const INSTRUCTION_PAGE = /^(help|instructions|how-?to-?play|tutorial)\.html$/i;
const INSTRUCTION_TEXT = /how\s+to\s+play|instructions?/i;
const INSTRUCTION_MARKER = /modal|dialog|instructions?|how-?to-?play|tutorial|help/i;

const shippedPages = readdirSync(DIST).filter((name) => name.endsWith(".html"));

describe("crit 5: no tutorial", () => {
  it("ships no dedicated instructions/help page", () => {
    const found = shippedPages.filter((name) => INSTRUCTION_PAGE.test(name));
    expect(found, `these read as instructions pages: ${found.join(", ")}`).toEqual([]);
  });

  for (const name of shippedPages) {
    it(`${name} carries no how-to-play modal`, () => {
      const doc = new JSDOM(readFileSync(join(DIST, name), "utf8")).window.document;
      const suspects = [...doc.querySelectorAll("*")].filter(
        (el) =>
          el.tagName === "DIALOG" ||
          INSTRUCTION_MARKER.test(el.id) ||
          INSTRUCTION_MARKER.test(el.className),
      );
      expect(
        suspects.map((el) => el.outerHTML.slice(0, 80)),
        "the opening screen has to teach the game itself, not a modal standing in for it",
      ).toEqual([]);
    });
  }

  it("README doesn't stand in for on-screen instructions", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(
      INSTRUCTION_TEXT.test(readme),
      "how-to-play text belongs on screen, not in a README a player will never open",
    ).toBe(false);
  });
});

describe("safe-cell derivation", () => {
  // walls at b2, d4 --- the worked example from the crit 5 brief
  const walls: Wall[] = [
    { col: 2, row: 2 },
    { col: 4, row: 4 },
  ];

  it("derives UP safe cells", () => {
    expect(safeCellsForDirection("up", walls)).toEqual(new Set(["b3", "b4", "b5", "d5"]));
  });

  it("derives DOWN safe cells", () => {
    expect(safeCellsForDirection("down", walls)).toEqual(new Set(["b1", "d1", "d2", "d3"]));
  });

  it("derives LEFT safe cells", () => {
    expect(safeCellsForDirection("left", walls)).toEqual(new Set(["c2", "d2", "e2", "e4"]));
  });

  it("derives RIGHT safe cells", () => {
    expect(safeCellsForDirection("right", walls)).toEqual(new Set(["a2", "a4", "b4", "c4"]));
  });
});

describe("pillar travel distance stops short of a wall", () => {
  const walls: Wall[] = [
    { col: 2, row: 2 },
    { col: 4, row: 4 },
  ];

  it("stops one cell before the wall it's blocked by, in every direction", () => {
    expect(travelDistance("up", 2, walls)).toBe(1); // b2: wall at row 2 -> only row 1 swept
    expect(travelDistance("down", 4, walls)).toBe(1); // d4: wall at row 4 -> only row 5 swept
    expect(travelDistance("left", 2, walls)).toBe(1); // b2: wall at col 2 -> only col 1 swept
    expect(travelDistance("right", 4, walls)).toBe(1); // d4: wall at col 4 -> only col 5 swept
  });

  it("sweeps the full board in a lane with no wall", () => {
    expect(travelDistance("up", 1, walls)).toBe(5);
    expect(travelDistance("right", 1, walls)).toBe(5);
  });
});

describe("round timer resets at the start of each round", () => {
  it("keeps roundStartedAt fixed across phase changes within a round", () => {
    const state = createInitialState({ pickDirection: () => "up", now: 0 });
    const midRetract = advancePhase(state, 5000 + 1000 + 500); // into retract
    expect(midRetract.roundStartedAt).toBe(0);
  });

  it("resets roundStartedAt when a new round begins", () => {
    const state = createInitialState({ pickDirection: () => "up", now: 0 });
    const roundTwo = advancePhase(state, 5000 + 1000 + 2000 + 2000); // full cycle -> round 2
    expect(roundTwo.round).toBe(2);
    expect(roundTwo.roundStartedAt).toBe(10000);
  });
});

describe("pillar collision -> game over", () => {
  it("kills the player when the sweep reaches an unsafe cell", () => {
    const state = createInitialState({
      pickDirection: () => "up",
      player: { col: 1, row: 1 }, // a1: column a has no wall, fully unsafe under "up"
      now: 0,
    });
    const attacking = { ...state, phase: "attack" as const, phaseStartedAt: 0 };

    expect(checkCollision(attacking, ATTACK_MS).phase).toBe("gameOver");
  });

  it("does not kill the player standing on a safe cell", () => {
    const state = createInitialState({
      pickDirection: () => "up",
      player: { col: 2, row: 5 }, // b5: safe under "up"
      now: 0,
    });
    const attacking = { ...state, phase: "attack" as const, phaseStartedAt: 0 };

    expect(checkCollision(attacking, ATTACK_MS).phase).not.toBe("gameOver");
  });
});
