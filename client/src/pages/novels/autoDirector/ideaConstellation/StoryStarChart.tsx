import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { DirectorIdeaConstellationOption, DirectorIdeaConstellationSelection } from "@ai-novel/shared/types/novelDirector";
import { layOutInspirationStars } from "./constellationLayout";
import { IDEA_CONSTELLATION_CATEGORY_LABELS } from "./ideaConstellationState";

interface Props {
  options: DirectorIdeaConstellationOption[];
  inspectedId?: string;
  selected: DirectorIdeaConstellationSelection[];
  onInspect: (id: string) => void;
  disabled: boolean;
}

export default function StoryStarChart({ options, inspectedId, selected, onInspect, disabled }: Props) {
  const field = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<string>();
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const stars = useMemo(() => layOutInspirationStars(options, size.width, size.height), [options, size]);
  const noted = new Set(selected.map((item) => item.id));
  const hoverStar = stars.find((item) => item.option.id === hovered);
  return (
    <div className="sky-field" ref={field} role="group" aria-label="灵感星空" onPointerLeave={() => setHovered(undefined)}>
      {stars.map(({ option, x, y, label }) => {
        const inspecting = inspectedId === option.id;
        return (
          <button type="button" key={option.id} className="sky-star" style={{
            left: x, top: y, "--caption-x": (label?.x ?? x) - x + "px",
            "--caption-y": (label?.y ?? y) - y + "px", "--caption-width": label?.width + "px",
          } as CSSProperties} data-kind={option.category} data-relevance={option.relevance}
            data-saved={noted.has(option.id)} aria-pressed={inspecting} disabled={disabled}
            aria-label={`${option.label}，${IDEA_CONSTELLATION_CATEGORY_LABELS[option.category]}${noted.has(option.id) ? "，已收下" : ""}`}
            onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(option.id); }}
            onPointerLeave={() => setHovered(undefined)} onFocus={() => onInspect(option.id)}
            onClick={() => { onInspect(option.id); setHovered(undefined); }}>
            <span className="sky-star-glow" aria-hidden="true" /><span className="sky-star-light" aria-hidden="true" />
            {label && <span className="sky-caption" aria-hidden="true">{option.label}</span>}
          </button>
        );
      })}
      {hoverStar && !hoverStar.label && (
        <span className="sky-tooltip" aria-hidden="true" style={{
          left: Math.max(92, Math.min(size.width - 92, hoverStar.x)),
          top: hoverStar.y > 75 ? hoverStar.y - 22 : hoverStar.y + 22,
          transform: hoverStar.y > 75 ? "translate(-50%, -100%)" : "translateX(-50%)",
        }}>{hoverStar.option.label}</span>
      )}
    </div>
  );
}
