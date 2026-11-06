import { mkdirSync, writeFileSync } from "node:fs";
import rough from "roughjs/bundled/rough.cjs.js";

// Author the illustration as pen movements, then bake Rough.js into SVG data.
// Stable seeds keep prerender, hydration and subsequent builds identical.
const heading = [
  "M6 0 2 8", "M5 4 17 4", "M10 5 13 10",
  "M25 0 21 8", "M24 4 36 4", "M29 5 32 10",
  "M5 14 32 14 30 22 6 22", "M6 22 4 29 32 29 30 37 25 36",
  "M18 14 18 41", "M16 29 Q10 36 0 39", "M48 22 Q63 20 80 20",
  "M108 0 110 5", "M95 7 123 7", "M100 9 103 15", "M118 9 115 15",
  "M93 16 126 16", "M99 21 121 21 121 32 99 32Z", "M100 26 120 26",
  "M93 37 127 37", "M110 32 110 44",
];

const proseLines = [
  { y: 116, indent: 12, words: [32, 41, 34, 24] },
  { y: 135, indent: 0, words: [39, 38, 38, 20] },
  { y: 154, indent: 0, words: [32, 40, 36, 19] },
  { y: 173, indent: 0, words: [38, 42, 20] },
  { y: 205, indent: 12, words: [34, 39, 40] },
  { y: 224, indent: 0, words: [37, 36, 40, 22] },
  { y: 243, indent: 0, words: [38, 36, 32] },
  { y: 262, indent: 0, words: [33, 42] },
];

const drawings = {
  binding: [
    "M90 143 50 451 Q210 412 363 514 Q520 418 706 446 L658 147",
    "M63 441 Q206 408 365 502 Q522 413 694 436",
    "M59 446 Q207 414 364 507 Q524 417 699 441",
    "M364 505 Q359 520 348 537 L361 532 370 539 376 504",
  ],
  book: [
    "M365 492 C279 434 168 403 66 432 L100 132 C196 101 290 117 368 170 C452 116 558 112 646 134 L690 427 C571 399 454 433 365 492Z",
    "M368 170 C359 273 356 387 365 492",
  ],
  character: [
    // Open corners suggest a pencilled character study, rather than a UI card.
    "M0 31 0 15 22 15 M197 15 215 15 215 32 M0 102 0 120 22 120 M196 120 215 120 215 102",
    "M27 58 C19 43 26 26 42 25 C58 24 67 40 59 54",
    "M28 43 C30 29 48 29 55 40 L60 54 55 68 Q43 80 31 65Z",
    "M28 44 Q26 62 22 69 L33 67 M53 34 Q55 48 64 57 L59 67",
    "M33 49 37 49 M48 49 52 48 M43 49 41 58 45 59 M39 65 Q44 67 48 64",
    "M35 73 34 80 44 87 54 79 51 72",
    "M34 80 18 86 11 109 M54 79 70 87 78 109 M23 90 26 109 M65 91 62 109",
    "M34 82 42 94 54 81 M42 94 45 110 M13 110 Q44 114 78 109",
    "M99 31 Q128 29 161 31 M99 57 Q132 55 196 57 M100 81 Q130 79 166 81",
    // A miniature coastal setting carries the scene from the first iteration.
    "M102 111 Q118 106 134 109 M153 110 Q179 104 205 111",
    "M169 106 173 88 181 88 184 106 M171 88 177 83 183 88 M174 94 180 94",
    "M189 91 202 94 M165 91 153 95 M111 99 q4 -4 8 0 q4 -4 8 0",
  ],
  timeline: [
    "M0 162 Q57 159 109 162",
    "M9 206 C34 207 55 179 103 185 S157 220 201 192",
    "M194 189 203 192 200 201",
    "M15 202 C22 201 24 211 18 213 C10 216 8 205 15 202",
    "M101 181 C109 177 114 189 106 192 C98 194 95 184 101 181",
    "M191 194 C197 189 204 198 199 203 C193 209 185 200 191 194",
    "M17 215 17 225 M105 194 105 225 M195 206 195 225",
    "M0 251 Q57 248 101 251 M111 251 Q154 250 212 251",
  ],
  accent: [
    "M29 80 Q42 86 54 80 Q76 73 88 81 Q74 79 65 89 Q52 97 44 87",
    "M97 62 Q150 60 199 62",
    "M5 237 Q24 235 43 237 M92 237 Q110 235 130 237 M180 237 Q198 235 215 237",
  ],
  heading,
  prose: proseLines.flatMap(({ y, indent, words }) => {
    let x = indent;
    return words.map((width) => {
      const d = `M${x} ${y} q${width / 4} -2 ${width / 2} 0 t${width / 2} 0`;
      x += width + 8;
      return d;
    });
  }),
};

const generator = rough.generator();
let seed = 24;
const ink = Object.fromEntries(Object.entries(drawings).map(([name, paths]) => [
  name,
  paths.flatMap((d) => d.split(/(?=M)/).flatMap((stroke) => {
    const shape = generator.path(stroke, {
      seed: seed++,
      roughness: name === "heading" ? 0.45 : 0.85,
      maxRandomnessOffset: 1.4,
      disableMultiStroke: name !== "book" && name !== "binding",
    });
    return shape.sets.flatMap((set) => generator.opsToPath(set, 2).split(/(?=M)/));
  })),
]));

const directory = new URL("../src/components/manuscript/", import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL("ink.generated.json", directory), `${JSON.stringify(ink, null, 2)}\n`);
