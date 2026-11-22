import type { DirectorIdeaConstellationCategory, DirectorIdeaConstellationOption, DirectorIdeaConstellationSelection } from "@ai-novel/shared/types/novelDirector";
import { CONSTELLATION_FIGURES } from "./constellationLayout";
import { IDEA_CONSTELLATION_CATEGORY_LABELS } from "./ideaConstellationState";

type Category = DirectorIdeaConstellationCategory;

export function StarFigure({ category, selectedIndex = -1 }: { category: Category; selectedIndex?: number }) {
  const { stars } = CONSTELLATION_FIGURES[category];
  return (
    <g className="atlas-figure">
      <polyline points={stars.map(([x, y]) => [x, y].join(",")).join(" ")} fill="none" stroke="currentColor" strokeOpacity=".68" strokeWidth="1.1" />
      {stars.map(([x, y], index) => index === selectedIndex ? (
        <g key={index} transform={`translate(${x} ${y})`} className="atlas-lit-star">
          <circle r="10" fill="none" stroke="currentColor" strokeWidth=".8" opacity=".65" />
          <path d="M0 -7 L1.8 -1.8 7 0 1.8 1.8 0 7 -1.8 1.8 -7 0 -1.8 -1.8Z" fill="currentColor" />
        </g>
      ) : <circle key={index} cx={x} cy={y} r={index === 1 ? 3.2 : 2.2} fill="currentColor" />)}
    </g>
  );
}

// A fixed sky keeps the chart still as choices change.
function ChartGrid() {
  return (
    <g aria-hidden="true">
      {Array.from({ length: 150 }, (_, index) => {
        const angle = index * 2.399963;
        const radius = Math.sqrt((index + .5) / 150) * 235;
        return <circle key={index} cx={240 + Math.cos(angle) * radius} cy={240 + Math.sin(angle) * radius}
          r={index % 7 === 0 ? 1.15 : .65} fill="currentColor" opacity={index % 3 === 0 ? .65 : .35} />;
      })}
      <g className="atlas-graticule" fill="none" stroke="currentColor" strokeWidth=".75">
        <circle cx="240" cy="240" r="208" /><circle cx="240" cy="240" r="198" />
        <circle cx="240" cy="240" r="148" strokeDasharray="2 5" />
        <circle cx="240" cy="240" r="90" strokeDasharray="2 5" />
        <g transform="rotate(-26 240 240)" opacity=".58">
          <ellipse cx="240" cy="240" rx="198" ry="75" />
          <ellipse cx="240" cy="240" rx="86" ry="198" />
          <path d="M42 240H438M240 42V438" strokeDasharray="2 5" />
        </g>
        {Array.from({ length: 120 }, (_, tick) => (
          <path key={tick} d={tick % 10 === 0 ? "M240 31v10" : "M240 32v3.5"} transform={`rotate(${tick * 3} 240 240)`} />
        ))}
      </g>
      <path className="atlas-pole" d="m240 21 -3.5 7h7z" fill="currentColor" />
    </g>
  );
}

interface StoryStarChartProps {
  groups: { category: Category; options: DirectorIdeaConstellationOption[] }[];
  current: Category;
  selected: DirectorIdeaConstellationSelection[];
  onNavigate: (category: Category) => void;
  disabled: boolean;
}

export default function StoryStarChart({ groups, current, selected, onNavigate, disabled }: StoryStarChartProps) {
  return (
    <nav className="atlas-chart" aria-label="按星座浏览开书素材">
      <svg viewBox="0 0 480 480" aria-hidden="true" className="atlas-chart-plate">
        <ChartGrid />
        {groups.map(({ category, options }) => {
          const { center: [x, y] } = CONSTELLATION_FIGURES[category];
          const chosen = selected.find((item) => item.category === category);
          return (
            <g key={category} transform={`translate(${x} ${y})`}
              className="atlas-asterism" data-active={current === category} data-lit={Boolean(chosen)}>
              <StarFigure category={category} selectedIndex={options.findIndex((item) => item.id === chosen?.id)} />
            </g>
          );
        })}
      </svg>
      {groups.map(({ category, options }) => {
        const { center: [x, y] } = CONSTELLATION_FIGURES[category];
        const chosen = selected.find((item) => item.category === category);
        const label = IDEA_CONSTELLATION_CATEGORY_LABELS[category];
        return (
          <button key={category} type="button" className="atlas-star-link"
            style={{ left: `${x / 4.8}%`, top: `${(y + 8) / 4.8}%` }}
            disabled={disabled || !options.length} aria-current={current === category ? "location" : undefined}
            aria-label={`浏览${label}${chosen ? `，已选${chosen.label}` : ""}`} data-lit={Boolean(chosen)}
            onClick={() => onNavigate(category)}>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
