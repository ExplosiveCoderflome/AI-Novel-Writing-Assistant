import assert from "node:assert/strict";
import test from "node:test";
import { CONSTELLATION_FIGURES } from "./constellationLayout.ts";
import { DIRECTOR_IDEA_CONSTELLATION_CATEGORIES } from "@ai-novel/shared/types/novelDirector";

test("every material category has five distinct stars and its own caption space", () => {
  const centers = [];
  assert.deepEqual(Object.keys(CONSTELLATION_FIGURES).sort(), [...DIRECTOR_IDEA_CONSTELLATION_CATEGORIES].sort());
  for (const { center: [x, y], stars } of Object.values(CONSTELLATION_FIGURES)) {
    assert.equal(new Set(stars.map((point) => point.join(","))).size, 5);
    for (const [dx, dy] of stars) {
      assert.ok(Math.hypot(x + dx - 240, y + dy - 240) < 208);
    }
    for (const [otherX, otherY] of centers) {
      assert.ok(Math.abs(x - otherX) >= 114 || Math.abs(y - otherY) >= 82);
    }
    centers.push([x, y]);
  }
});
