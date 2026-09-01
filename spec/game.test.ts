import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  advancePhase,
  ATTACK_MS,
  checkCollision,
  createInitialState,
  defaultPickDirections,
  defaultPickWalls,
  directionCountForRound,
  flashWindowMsForRound,
  roundDurationForRound,
  ROUND_MS,
  solvablePairs,
  warningMsForRound,
} from "../game-logic.ts";
import { safeCellsForDirection, safeCellsForDirections, travelDistance, type Wall } from "../safe-cells.ts";

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
    const state = createInitialState({ pickDirections: () => ["up"], now: 0 });
    const midRetract = advancePhase(state, 5000 + 1000 + 500); // into retract
    expect(midRetract.roundStartedAt).toBe(0);
  });

  it("resets roundStartedAt when a new round begins", () => {
    const state = createInitialState({ pickDirections: () => ["up"], now: 0 });
    const roundTwo = advancePhase(state, 5000 + 1000 + 2000 + 2000); // full cycle -> round 2
    expect(roundTwo.round).toBe(2);
    expect(roundTwo.roundStartedAt).toBe(10000);
  });
});

describe("pillar collision -> game over", () => {
  it("kills the player when the sweep reaches an unsafe cell", () => {
    const state = createInitialState({
      pickDirections: () => ["up"],
      player: { col: 1, row: 1 }, // a1: column a has no wall, fully unsafe under "up"
      now: 0,
    });
    const attacking = { ...state, phase: "attack" as const, phaseStartedAt: 0 };

    expect(checkCollision(attacking, ATTACK_MS).phase).toBe("gameOver");
  });

  it("does not kill the player standing on a safe cell", () => {
    const state = createInitialState({
      pickDirections: () => ["up"],
      player: { col: 2, row: 5 }, // b5: safe under "up"
      now: 0,
    });
    const attacking = { ...state, phase: "attack" as const, phaseStartedAt: 0 };

    expect(checkCollision(attacking, ATTACK_MS).phase).not.toBe("gameOver");
  });

  it("kills the player when any one of several simultaneous directions reaches them", () => {
    const state = createInitialState({
      pickDirections: () => ["up", "right"],
      player: { col: 1, row: 1 }, // a1: unsafe under "up" (no wall in col a), safe under "right"
      now: 0,
    });
    const attacking = { ...state, phase: "attack" as const, phaseStartedAt: 0 };

    expect(checkCollision(attacking, ATTACK_MS).phase).toBe("gameOver");
  });

  it("survives a multi-direction attack when safe under every active direction", () => {
    const state = createInitialState({
      pickDirections: () => ["up", "right"],
      player: { col: 2, row: 6 }, // b6: safe under both "up" and "right" (up∩right = {b6})
      now: 0,
    });
    const attacking = { ...state, phase: "attack" as const, phaseStartedAt: 0 };

    expect(checkCollision(attacking, ATTACK_MS).phase).not.toBe("gameOver");
  });
});

describe("directionCountForRound", () => {
  it("attacks from 1 direction through round 4", () => {
    expect(directionCountForRound(1)).toBe(1);
    expect(directionCountForRound(4)).toBe(1);
  });

  it("escalates to 2 directions from round 5 onward, and stays capped there", () => {
    expect(directionCountForRound(5)).toBe(2);
    expect(directionCountForRound(8)).toBe(2);
    expect(directionCountForRound(9)).toBe(2);
    expect(directionCountForRound(100)).toBe(2);
  });
});

describe("safeCellsForDirections", () => {
  const walls: Wall[] = [
    { col: 2, row: 2 },
    { col: 4, row: 4 },
  ];

  it("intersects safe cells across all given directions", () => {
    expect(safeCellsForDirections(["up", "right"], walls)).toEqual(new Set(["b4"]));
    expect(safeCellsForDirections(["down", "left"], walls)).toEqual(new Set(["d2"]));
  });
});

describe("solvablePairs", () => {
  it("finds exactly the perpendicular pairs with a shared safe cell for b2/d4", () => {
    const walls: Wall[] = [
      { col: 2, row: 2 },
      { col: 4, row: 4 },
    ];
    expect(solvablePairs(walls)).toEqual(
      expect.arrayContaining([
        ["up", "right"],
        ["down", "left"],
      ]),
    );
    expect(solvablePairs(walls)).toHaveLength(2);
  });

  it("finds none of the pairs when the walls share a row or column", () => {
    expect(
      solvablePairs([
        { col: 2, row: 2 },
        { col: 2, row: 4 },
      ]),
    ).toEqual([]);
  });
});

describe("defaultPickWalls always lands on distinct rows and columns", () => {
  it("returns 3 walls, no two sharing a row or column, across many random draws", () => {
    for (let i = 0; i < 200; i++) {
      const walls = defaultPickWalls({ col: 3, row: 3 }, 7);
      expect(walls).toHaveLength(3);
      for (let a = 0; a < walls.length; a++) {
        for (let b = a + 1; b < walls.length; b++) {
          expect(walls[a].col).not.toBe(walls[b].col);
          expect(walls[a].row).not.toBe(walls[b].row);
        }
      }
    }
  });
});

describe("round timing speeds up from round 7", () => {
  it("keeps the normal durations through round 6", () => {
    expect(warningMsForRound(1)).toBe(5000);
    expect(warningMsForRound(6)).toBe(5000);
    expect(flashWindowMsForRound(6)).toBe(2000);
    expect(roundDurationForRound(6)).toBe(10000);
  });

  it("shortens warning, flash window, retract, and total round length from round 7 on", () => {
    expect(warningMsForRound(7)).toBe(3000);
    expect(flashWindowMsForRound(7)).toBe(1500);
    expect(roundDurationForRound(7)).toBe(7000);
    expect(warningMsForRound(100)).toBe(3000);
    expect(roundDurationForRound(100)).toBe(7000);
  });

  it("advancePhase actually uses the faster durations once round 7 begins", () => {
    const state = createInitialState({ pickDirections: () => ["up"], now: 0 });

    // Fast-forward through rounds 1-6 at the normal 10s pace to reach round 7.
    let s = state;
    for (let round = 1; round <= 6; round++) {
      s = advancePhase(s, s.roundStartedAt + ROUND_MS);
    }
    expect(s.round).toBe(7);
    expect(s.phase).toBe("warning");
    const round7Start = s.roundStartedAt;

    // Warning now lasts only 3000ms, not 5000ms.
    const stillWarning = advancePhase(s, round7Start + 2999);
    expect(stillWarning.phase).toBe("warning");
    const nowAttack = advancePhase(s, round7Start + 3000);
    expect(nowAttack.phase).toBe("attack");

    // Retract now lasts only 1000ms, not 2000ms, so the whole round is 7000ms.
    const roundEight = advancePhase(s, round7Start + 7000);
    expect(roundEight.round).toBe(8);
  });
});

describe("defaultPickDirections only ever picks a hideable pair for 2-direction rounds", () => {
  it("always returns a pair with a nonempty safe-cell intersection, for whatever walls it's given", () => {
    const walls: Wall[] = [
      { col: 2, row: 2 },
      { col: 4, row: 4 },
    ];
    for (let i = 0; i < 200; i++) {
      const directions = defaultPickDirections(5, walls, 5);
      expect(directions).toHaveLength(2);
      expect(safeCellsForDirections(directions, walls).size).toBeGreaterThan(0);
    }
  });
});

describe("wall regeneration", () => {
  const walls1: Wall[] = [{ col: 2, row: 2 }, { col: 4, row: 4 }];
  const walls2: Wall[] = [{ col: 3, row: 2 }, { col: 2, row: 4 }];

  it("keeps the initial walls through round 5, then regenerates at round 6", () => {
    const state = createInitialState({
      pickDirections: () => ["up"],
      pickWalls: () => walls2,
      walls: walls1,
      now: 0,
    });

    let s = state;
    for (let round = 1; round <= 5; round++) {
      s = advancePhase(s, s.roundStartedAt + ROUND_MS);
      expect(s.round).toBe(round + 1);
      if (round < 5) expect(s.walls).toEqual(walls1);
    }
    expect(s.round).toBe(6);
    expect(s.walls).toEqual(walls2);
  });
});

describe("wall churn after round 10", () => {
  it("regenerates every 5 rounds through round 10, then every single round from 11 on", () => {
    let calls = 0;
    const pickWalls = (): Wall[] => {
      calls += 1;
      return [{ col: 2, row: 2 }, { col: 4, row: 4 }];
    };
    let s = createInitialState({ pickDirections: () => ["up"], pickWalls, now: 0 });

    for (let i = 0; i < 5; i++) s = advancePhase(s, s.roundStartedAt + roundDurationForRound(s.round));
    expect(s.round).toBe(6);
    expect(calls).toBe(1); // regenerated once, entering round 6

    for (let i = 0; i < 4; i++) s = advancePhase(s, s.roundStartedAt + roundDurationForRound(s.round));
    expect(s.round).toBe(10);
    expect(calls).toBe(1); // no further regeneration through round 10

    s = advancePhase(s, s.roundStartedAt + roundDurationForRound(s.round));
    expect(s.round).toBe(11);
    expect(calls).toBe(2); // regenerates entering round 11

    s = advancePhase(s, s.roundStartedAt + roundDurationForRound(s.round));
    expect(s.round).toBe(12);
    expect(calls).toBe(3); // and again entering round 12

    s = advancePhase(s, s.roundStartedAt + roundDurationForRound(s.round));
    expect(s.round).toBe(13);
    expect(calls).toBe(4); // and every round thereafter
  });
});
