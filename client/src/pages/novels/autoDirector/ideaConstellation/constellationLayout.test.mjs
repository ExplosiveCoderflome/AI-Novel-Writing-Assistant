import assert from "node:assert/strict";
import test from "node:test";
import { layOutInspirationStars } from "./constellationLayout.ts";
import { DIRECTOR_IDEA_CONSTELLATION_CATEGORIES } from "@ai-novel/shared/types/novelDirector";

const options = DIRECTOR_IDEA_CONSTELLATION_CATEGORIES.flatMap((category) =>
  Array.from({ length: 5 }, (_, i) => ({
    id: category + i, category, label: "一封没有收件人的信".repeat(3), hint: "故事里的一条线索", relevance: i ? "medium" : "high",
  })),
);

for (const [width, height] of [[300, 410], [760, 225], [1340, 480]]) {
  test(`every idea owns a reachable 44px star at ${width} × ${height}`, () => {
    const stars = layOutInspirationStars(options, width, height);
    assert.deepEqual(stars, layOutInspirationStars([...options].reverse(), width, height));
    assert.equal(new Set(stars.map((star) => star.option.id)).size, options.length);
    for (const [index, star] of stars.entries()) {
      assert.ok(star.x >= 22 && star.x <= width - 22 && star.y >= 22 && star.y <= height - 22);
      for (const other of stars.slice(index + 1)) {
        assert.ok(Math.abs(star.x - other.x) >= 44 || Math.abs(star.y - other.y) >= 44);
      }
      if (!star.label) continue;
      assert.ok(star.label.x >= star.label.width / 2 && star.label.x + star.label.width / 2 <= width);
      for (const other of stars.filter((point) => point !== star)) {
        assert.ok(Math.abs(star.label.x - other.x) >= star.label.width / 2 + 22 || Math.abs(star.label.y - other.y) >= 32);
      }
    }
  });
}
