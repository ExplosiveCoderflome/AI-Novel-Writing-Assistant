import { useEffect, useRef } from "react";

// Original line work: an open novel, a chapter heading, and a scene on the coast.
// Each path is one pen movement; DOM order is also the drawing order.
const chapterHeading = [
  "M6 0 2 8", "M5 4 17 4", "M10 5 13 10",
  "M25 0 21 8", "M24 4 36 4", "M29 5 32 10",
  "M5 14 32 14 30 22 6 22", "M6 22 4 29 32 29 30 37 25 36",
  "M18 14 18 41", "M16 29 Q10 36 0 39",
  "M48 22 Q63 20 80 20",
  "M108 0 110 5", "M95 7 123 7", "M100 9 103 15", "M118 9 115 15",
  "M93 16 126 16", "M99 21 121 21 121 32 99 32Z", "M100 26 120 26",
  "M93 37 127 37", "M110 32 110 44",
];

const leftProse = [
  { y: 116, indent: 12, words: [32, 41, 34, 24] },
  { y: 135, indent: 0, words: [39, 38, 38, 20] },
  { y: 154, indent: 0, words: [32, 40, 36, 19] },
  { y: 173, indent: 0, words: [38, 42, 20] },
  { y: 205, indent: 12, words: [34, 39, 40] },
  { y: 224, indent: 0, words: [37, 36, 40, 22] },
  { y: 243, indent: 0, words: [38, 36, 32] },
  { y: 262, indent: 0, words: [33, 42] },
];

const coastalScene = [
  // Distant island, lighthouse, and the sea.
  "M0 95 Q18 92 32 96 M4 102 51 102 M9 111 36 111 M139 102 192 102",
  "M128 88 137 80 146 82 154 73 162 77 176 74 193 87",
  "M150 76 154 26 170 26 176 75 M152 34 171 34 M153 39 172 39",
  "M150 25 150 18 173 18 173 25Z M148 17 161 7 176 17 M161 7 161 2",
  "M157 20 157 25 M166 20 166 25 M160 48 165 48 166 58 159 58Z",
  "M153 67 157 66 M168 70 173 69 M151 72 157 71",
  "M140 31 113 39 M180 29 194 32",
  "M4 57 q5 -5 10 0 q5 -5 10 0 M37 43 q4 -4 8 0 q4 -4 8 0",
  // A character looking toward the lighthouse.
  "M81 62 C77 55 80 46 87 45 C95 44 99 52 94 60 L92 66",
  "M80 56 Q85 59 92 56 M80 50 Q84 41 93 46 L97 51",
  "M81 63 75 71 72 98 63 132 Q81 139 103 130 L98 97 95 72 91 64",
  "M78 74 81 99 75 121 M93 77 90 99 96 124 M81 99 90 99",
  "M75 77 67 98 74 105 M96 78 103 98 98 107",
  "M74 136 74 155 68 160 82 160 85 139 M91 136 95 153 103 157 91 159 85 143",
  "M62 165 Q82 161 108 166 M40 171 Q57 168 68 170 M119 168 143 168",
  "M44 130 q-4 -12 -2 -19 M44 130 q3 -12 8 -14 M121 149 q-2 -10 2 -16",
];

const rightProse = [
  { y: 195, indent: 0, words: [36, 40, 36, 17] },
  { y: 214, indent: 0, words: [35, 40, 35, 20] },
  { y: 233, indent: 0, words: [40, 38, 34] },
  { y: 252, indent: 0, words: [35, 34] },
];

function Ink({ d }: { d: string }) {
  // Dashes restart at every SVG subpath. Separate pen lifts so the reveal and
  // moving nib stay in sync rather than drawing disconnected marks together.
  return <>{d.split(/(?=M)/).map((stroke) => (
    <path key={stroke} className="manuscript-stroke" d={stroke} pathLength={1} />
  ))}</>;
}

function Prose({ lines }: { lines: typeof leftProse }) {
  return (
    <g className="manuscript-prose">
      {lines.flatMap(({ y, indent, words }) => {
        let x = indent;
        return words.map((width, index) => {
          const d = `M${x} ${y} q${width / 4} -2 ${width / 2} 0 t${width / 2} 0`;
          x += width + 8;
          return <Ink key={`${y}-${index}`} d={d} />;
        });
      })}
    </g>
  );
}

export default function HeroManuscript() {
  const artRef = useRef<SVGSVGElement>(null);
  const penRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const art = artRef.current!;
    const pen = penRef.current!;
    const surface = art.parentElement!;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const paths = [...art.querySelectorAll<SVGPathElement>(".manuscript-stroke")];
    let frame = 0;

    function finish() {
      cancelAnimationFrame(frame);
      delete art.dataset.drawing;
      paths.forEach((path) => { path.style.strokeDashoffset = "0"; });
      art.style.removeProperty("--book-rx");
      art.style.removeProperty("--book-ry");
    }

    function draw() {
      finish();
      if (reducedMotion.matches) return;

      // Cache geometry once. The pen is in the root SVG's coordinates, while
      // the chapter and illustration have their own page perspective matrices.
      const rootInverse = art.getCTM()!.inverse();
      const strokes = paths.map((path) => {
        const length = path.getTotalLength();
        return {
          path,
          length,
          matrix: rootInverse.multiply(path.getCTM()!),
          duration: Math.max(45, Math.min(620, length * 2.2)),
        };
      });
      const duration = strokes.reduce((sum, stroke) => sum + stroke.duration, 0);
      const pace = 9000 / duration;
      paths.forEach((path) => { path.style.strokeDashoffset = "1"; });
      let index = 0;
      let elapsedBefore = 0;
      const startedAt = performance.now() + 240;

      function tick(now: number) {
        const elapsed = (now - startedAt) / pace;
        if (elapsed >= 0) {
          while (index < strokes.length && elapsed >= elapsedBefore + strokes[index].duration) {
            strokes[index].path.style.strokeDashoffset = "0";
            elapsedBefore += strokes[index].duration;
            index++;
          }
          if (index === strokes.length) {
            finish();
            return;
          }
          const stroke = strokes[index];
          const progress = (elapsed - elapsedBefore) / stroke.duration;
          stroke.path.style.strokeDashoffset = String(1 - progress);
          const local = stroke.path.getPointAtLength(stroke.length * progress);
          const point = new DOMPoint(local.x, local.y).matrixTransform(stroke.matrix);
          pen.setAttribute("transform", `translate(${point.x} ${point.y})`);
          art.dataset.drawing = "true";
        }
        frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    }

    function followPointer(event: PointerEvent) {
      if (reducedMotion.matches || !finePointer.matches || event.pointerType === "touch") return;
      const bounds = surface.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      art.style.setProperty("--book-rx", `${-y * 4}deg`);
      art.style.setProperty("--book-ry", `${x * 6}deg`);
    }

    function resetPointer() {
      art.style.removeProperty("--book-rx");
      art.style.removeProperty("--book-ry");
    }

    draw();
    reducedMotion.addEventListener("change", draw);
    surface.addEventListener("pointermove", followPointer);
    surface.addEventListener("pointerleave", resetPointer);
    return () => {
      finish();
      reducedMotion.removeEventListener("change", draw);
      surface.removeEventListener("pointermove", followPointer);
      surface.removeEventListener("pointerleave", resetPointer);
    };
  }, []);

  return (
    <figure className="manuscript">
      <svg ref={artRef} className="manuscript-art" viewBox="0 0 760 590" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="manuscript-fold" x1="0" x2="1">
            <stop offset="0" stopColor="#84948e" stopOpacity="0" />
            <stop offset="0.5" stopColor="#84948e" stopOpacity="0.12" />
            <stop offset="1" stopColor="#84948e" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path className="manuscript-cover" d="M90 143 50 451 Q210 412 363 514 Q520 418 706 446 L658 147 368 174Z" />
        <path className="manuscript-paper" d="M368 170 C290 117 196 101 100 132 L66 432 C168 403 279 434 365 492 C454 433 571 399 690 427 L646 134 C558 112 452 116 368 170Z" />
        <path fill="url(#manuscript-fold)" d="M345 155 Q352 325 343 479 L365 492 388 477 Q374 325 387 158 L368 170Z" />

        <g className="manuscript-binding">
          <Ink d="M90 143 50 451 Q210 412 363 514 Q520 418 706 446 L658 147" />
          <Ink d="M63 441 Q206 408 365 502 Q522 413 694 436" />
          <Ink d="M59 446 Q207 414 364 507 Q524 417 699 441" />
        </g>
        <Ink d="M365 492 C279 434 168 403 66 432 L100 132 C196 101 290 117 368 170 C452 116 558 112 646 134 L690 427 C571 399 454 433 365 492Z" />
        <Ink d="M368 170 C359 273 356 387 365 492" />

        <g transform="matrix(.94 .14 -.12 .84 126 159)">
          <g className="manuscript-heading" transform="translate(19 7) scale(.73)">
            {chapterHeading.map((d) => <Ink key={d} d={d} />)}
          </g>
          <text className="manuscript-type" x="18" y="80">风从海上来</text>
          <Prose lines={leftProse} />
          <text className="manuscript-margin" x="78" y="285">— 001 —</text>
        </g>

        <g transform="matrix(.94 -.14 .12 .95 410 182)">
          <g className="manuscript-scene">
            {coastalScene.map((d) => <Ink key={d} d={d} />)}
          </g>
          <g className="manuscript-accent">
            <Ink d="M79 64 Q87 69 96 64 Q111 56 131 64 Q116 63 108 72 Q98 78 91 69" />
          </g>
          <Prose lines={rightProse} />
          <g className="manuscript-accent">
            <Ink d="M2 264 Q42 260 79 264" />
          </g>
          <text className="manuscript-margin" x="78" y="266">— 002 —</text>
        </g>

        <g className="manuscript-binding">
          <Ink d="M364 505 Q359 520 348 537 L361 532 370 539 376 504" />
        </g>
        <g ref={penRef} className="manuscript-pen">
          <path d="M0 0 5 -24 16 -16Z" fill="#f7f9f8" stroke="#101417" strokeWidth="1.2" />
          <path d="M5 -24 51 -88 Q55 -95 62 -91 Q68 -87 63 -80 L16 -16Z" fill="#101417" />
          <path d="M10 -22 57 -86" fill="none" stroke="#8da9a5" strokeWidth="1.2" />
          <path d="M0 0 9 -18 M49 -85 60 -78" fill="none" stroke="#147f91" strokeWidth="1.4" />
          <circle cx="9" cy="-18" r="1.7" fill="#147f91" />
        </g>
      </svg>
      <figcaption><span>01 /</span> 每个故事，都从第一笔开始。</figcaption>
    </figure>
  );
}
