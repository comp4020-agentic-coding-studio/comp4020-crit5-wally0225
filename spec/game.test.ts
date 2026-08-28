import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

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
