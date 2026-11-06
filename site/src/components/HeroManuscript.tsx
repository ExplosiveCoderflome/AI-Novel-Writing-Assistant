import { useEffect, useRef } from "react";
import ink from "./manuscript/ink.generated.json";

const paper = "M368 170 C290 117 196 101 100 132 L66 432 C168 403 279 434 365 492 C454 433 571 399 690 427 L646 134 C558 112 452 116 368 170Z";

function Ink({ strokes }: { strokes: string[] }) {
  return <>{strokes.map((d, index) => (
    <path key={index} className="manuscript-stroke" d={d} pathLength={1} />
  ))}</>;
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
    let frame = 0;

    // Leave the outline visible. Fill the right page by 1.4s, then write the left.
    const rootInverse = art.getCTM()!.inverse();
    let elapsedBefore = 120;
    const strokes = [
      { selector: ".manuscript-planning .manuscript-stroke", duration: 1280 },
      { selector: ".manuscript-writing .manuscript-stroke", duration: 3800 },
    ].flatMap(({ selector, duration }) => {
      const group = [...art.querySelectorAll<SVGPathElement>(selector)].map((path) => {
        const length = path.getTotalLength();
        return { path, length, matrix: rootInverse.multiply(path.getCTM()!), weight: Math.min(180, Math.max(20, length)) };
      });
      const totalWeight = group.reduce((sum, stroke) => sum + stroke.weight, 0);
      return group.map((stroke) => {
        const start = elapsedBefore;
        const time = duration * stroke.weight / totalWeight;
        elapsedBefore += time;
        return { ...stroke, start, duration: time };
      });
    });

    function resetPointer() {
      art.style.removeProperty("--book-rx");
      art.style.removeProperty("--book-ry");
    }

    function finish() {
      cancelAnimationFrame(frame);
      delete art.dataset.drawing;
      strokes.forEach(({ path }) => { path.style.strokeDashoffset = "0"; });
      resetPointer();
    }

    function draw() {
      finish();
      if (reducedMotion.matches) return;

      strokes.forEach(({ path }) => { path.style.strokeDashoffset = "1"; });
      let index = 0;
      const startedAt = performance.now();

      function tick(now: number) {
        const elapsed = now - startedAt;
        while (index < strokes.length && elapsed >= strokes[index].start + strokes[index].duration) {
          strokes[index].path.style.strokeDashoffset = "0";
          index++;
        }
        if (index === strokes.length) {
          finish();
          return;
        }
        const stroke = strokes[index];
        if (elapsed >= stroke.start) {
          const progress = (elapsed - stroke.start) / stroke.duration;
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
          <linearGradient id="manuscript-paper" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#fffaf0" />
            <stop offset="1" stopColor="#f3ecdd" />
          </linearGradient>
          <pattern id="manuscript-grain" width="47" height="43" patternUnits="userSpaceOnUse">
            <g fill="#a78d64" opacity="0.16">
              <circle cx="3" cy="8" r="0.6" /><circle cx="31" cy="27" r="0.5" />
              <circle cx="17" cy="38" r="0.7" /><circle cx="43" cy="11" r="0.4" />
            </g>
            <path d="m11 17 2 .4 m24 21 3 -.5 M7 32l1 -.5" stroke="#b29c7c" strokeWidth="0.5" opacity="0.14" />
          </pattern>
          <linearGradient id="manuscript-fold" x1="0" x2="1">
            <stop offset="0" stopColor="#9b8260" stopOpacity="0" />
            <stop offset="0.5" stopColor="#9b8260" stopOpacity="0.13" />
            <stop offset="1" stopColor="#9b8260" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path className="manuscript-cover" d="M90 143 50 451 Q210 412 363 514 Q520 418 706 446 L658 147 368 174Z" />
        <path fill="url(#manuscript-paper)" d={paper} />
        <path fill="url(#manuscript-grain)" d={paper} />
        <path fill="url(#manuscript-fold)" d="M345 155 Q352 325 343 479 L365 492 388 477 Q374 325 387 158 L368 170Z" />
        <g className="manuscript-binding"><Ink strokes={ink.binding} /></g>
        <Ink strokes={ink.book} />

        <g className="manuscript-writing" transform="matrix(.94 .14 -.12 .84 126 159)">
          <g className="manuscript-heading" transform="translate(19 7) scale(.73)">
            <Ink strokes={ink.heading} />
          </g>
          <text className="manuscript-type" x="18" y="80">风从海上来</text>
          <g className="manuscript-prose"><Ink strokes={ink.prose} /></g>
          <text className="manuscript-margin" x="78" y="285">— 001 —</text>
        </g>

        <g className="manuscript-planning" transform="matrix(.94 -.14 .12 .95 410 182)">
          <text className="manuscript-label" x="0" y="0">人物 / 林舟</text>
          <g className="manuscript-sketch"><Ink strokes={ink.character} /></g>
          <text className="manuscript-annotation" x="99" y="47">想离开小镇</text>
          <text className="manuscript-annotation" x="99" y="74">却为一封信留下</text>
          <text className="manuscript-label" x="0" y="150">故事走向</text>
          <g className="manuscript-timeline"><Ink strokes={ink.timeline} /></g>
          <text className="manuscript-annotation" x="5" y="235">来信</text>
          <text className="manuscript-annotation" x="94" y="235">离岸</text>
          <text className="manuscript-annotation" x="182" y="235">归来</text>
          <g className="manuscript-accent"><Ink strokes={ink.accent} /></g>
          <text className="manuscript-margin" x="82" y="276">— 002 —</text>
        </g>

        <g ref={penRef} className="manuscript-pen">
          <path d="M0 0 5 -24 16 -16Z" fill="#fffaf0" stroke="#101417" strokeWidth="1.2" />
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
