import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DirectorIdeaConstellationCategory, DirectorIdeaConstellationOption, DirectorIdeaConstellationSelection,
} from "@ai-novel/shared/types/novelDirector";
import { ArrowRight, Check, ChevronDown, ChevronUp, Compass, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import {
  IDEA_CONSTELLATION_CATEGORY_LABELS, groupIdeaConstellationOptions,
  selectRotatingFoundationOptions, toggleIdeaConstellationSelection,
  type FoundationConstellationOption,
} from "./ideaConstellationState";
import StoryStarChart, { StarFigure } from "./StoryStarChart";
import "./storyAtlas.css";

type Category = DirectorIdeaConstellationCategory;

interface StoryConstellationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: DirectorIdeaConstellationOption[];
  genreOptions: FoundationConstellationOption[];
  storyModeOptions: FoundationConstellationOption[];
  selectedGenreId: string;
  selectedStoryModeId: string;
  isUpdatingFoundation: boolean;
  isGenerating: boolean;
  isComposing: boolean;
  onGenerate: () => void;
  onSelectGenre: (genreId: string) => Promise<boolean>;
  onSelectStoryMode: (storyModeId: string) => Promise<boolean>;
  onCompose: (selected: DirectorIdeaConstellationSelection[]) => Promise<string>;
  onUseIdea: (idea: string) => void;
}

function DirectionField({ label, choices, value, disabled, onChange }: {
  label: string; choices: FoundationConstellationOption[]; value: string; disabled: boolean;
  onChange: (id: string) => Promise<boolean>;
}) {
  const choice = choices.find((item) => item.id === value);
  return (
    <label className="atlas-direction">
      <span>{label}</span>
      <span className="atlas-select">
        <select value={value} disabled={disabled || !choices.length} title={choice?.hint}
          onChange={(event) => void onChange(event.target.value)}>
          <option value="">AI 自动搭配</option>
          {choices.map((item) => <option key={item.id} value={item.id} title={item.hint}>{item.label}</option>)}
        </select>
        <ChevronDown size={15} aria-hidden="true" />
      </span>
    </label>
  );
}

export default function StoryConstellationDialog({
  open, onOpenChange, options, genreOptions, storyModeOptions, selectedGenreId, selectedStoryModeId,
  isUpdatingFoundation, isGenerating, isComposing, onGenerate, onSelectGenre, onSelectStoryMode, onCompose, onUseIdea,
}: StoryConstellationDialogProps) {
  const [selected, setSelected] = useState<DirectorIdeaConstellationSelection[]>([]);
  const [current, setCurrent] = useState<Category>("protagonist");
  const [foundationPage, setFoundationPage] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sectionHeadings = useRef<Partial<Record<Category, HTMLHeadingElement | null>>>({});
  const readingRef = useRef<HTMLDivElement>(null);
  const picksRef = useRef<HTMLDetailsElement>(null);
  const groups = useMemo(() => groupIdeaConstellationOptions(options), [options]);
  const busy = isGenerating || isComposing;
  const canBrowse = !isGenerating && options.length > 0;
  const chosenDirectionDisabled = busy || isUpdatingFoundation;

  useEffect(() => {
    setSelected([]);
    setCurrent("protagonist");
    readingRef.current?.scrollTo({ top: 0 });
  }, [options]);

  function navigate(category: Category) {
    const heading = sectionHeadings.current[category];
    if (!heading) return;
    setCurrent(category);
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function followReadingPosition() {
    const pane = readingRef.current;
    if (!pane || pane.clientHeight >= pane.scrollHeight) return;
    const top = pane.getBoundingClientRect().top + 32;
    let visible: Category = "protagonist";
    for (const { category } of groups) {
      const heading = sectionHeadings.current[category];
      if (heading && heading.getBoundingClientRect().top <= top) visible = category;
    }
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2) visible = groups[groups.length - 1].category;
    setCurrent(visible);
  }

  function toggle(option: DirectorIdeaConstellationOption) {
    setSelected((previous) => toggleIdeaConstellationSelection(previous, option));
    setCurrent(option.category);
  }

  async function confirm() {
    if (!selected.length) {
      onOpenChange(false);
      return;
    }
    try {
      const idea = (await onCompose(selected)).trim();
      if (idea) {
        onUseIdea(idea);
        onOpenChange(false);
      }
    } catch {
      // The controller shows the error. Keep the selected materials available for retry.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next || !isComposing) onOpenChange(next); }}>
      <AppDialogContent title="故事星图" description="从七类开书素材中选择灵感，组合成你的故事开局。"
        className="story-atlas" headerClassName="sr-only" bodyClassName="atlas-body"
        onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}
        onEscapeKeyDown={(event) => {
          if (picksRef.current?.open) {
            event.preventDefault();
            picksRef.current.open = false;
            picksRef.current.querySelector("summary")?.focus();
          }
        }}
        footerClassName="atlas-footer" footer={(
          <div className="atlas-actions">
            {selected.length ? (
              <details className="atlas-picks" ref={picksRef}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
                }}>
                <summary className="atlas-selection-count">
                  <span>已选 <strong>{selected.length}</strong> / {groups.length} 类素材</span>
                  <ChevronUp size={14} aria-hidden="true" />
                </summary>
                <ul className="atlas-pick-list" aria-label="已选素材">
                  {selected.map((item) => (
                    <li key={item.id}>
                      <span><small>{IDEA_CONSTELLATION_CATEGORY_LABELS[item.category]}</small>{item.label}</span>
                      <Button variant="ghost" size="icon" disabled={isComposing} aria-label={`移除${item.label}`}
                        onClick={() => setSelected((previous) => previous.filter((choice) => choice.id !== item.id))}>
                        <X size={15} />
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : <span className="atlas-selection-count">已选 0 / {groups.length} 类素材</span>}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" disabled={isComposing} onClick={() => onOpenChange(false)}>取消</Button>
              <Button size="sm" onClick={() => void confirm()} disabled={chosenDirectionDisabled} className="atlas-confirm">
                {isComposing ? "正在组合…" : selected.length ? "组合开书想法" : "返回开书页"}
                {isComposing ? <Loader2 size={15} className="motion-safe:animate-spin" /> : <ArrowRight size={15} />}
              </Button>
            </div>
          </div>
        )}>
        <div className="atlas-spread">
          <aside className="atlas-sky">
            <header className="atlas-sky-title">
              <Compass size={23} strokeWidth={1.25} aria-hidden="true" />
              <h2 ref={titleRef} tabIndex={-1}>故事星图</h2>
              <p>点选星座，浏览对应的开书素材。</p>
            </header>
            <StoryStarChart groups={groups} current={current} selected={selected} disabled={!canBrowse || isComposing} onNavigate={navigate} />
            <div className="atlas-key" aria-hidden="true">
              <span><i />候选素材</span><span><i className="atlas-key-lit" />已选素材</span>
            </div>
          </aside>

          <section className="atlas-reading" aria-label="开书素材">
            <header className="atlas-reading-head">
              <div><h2>开书素材</h2><p>每类最多选一项，选中后可以更换。</p></div>
              <Button type="button" size="sm" variant="ghost" disabled={chosenDirectionDisabled}
                onClick={() => { setFoundationPage((page) => page + 1); onGenerate(); }}>
                {isGenerating ? <Loader2 size={15} className="motion-safe:animate-spin" /> : <RotateCcw size={15} />}换一组
              </Button>
            </header>
            <div className="atlas-catalog" ref={readingRef} onScroll={followReadingPosition}>
              <div className="atlas-directions">
                <DirectionField label="故事类型" choices={selectRotatingFoundationOptions(genreOptions, foundationPage, selectedGenreId, 8)}
                  value={selectedGenreId} disabled={chosenDirectionDisabled} onChange={onSelectGenre} />
                <DirectionField label="推进方式" choices={selectRotatingFoundationOptions(storyModeOptions, foundationPage, selectedStoryModeId, 8)}
                  value={selectedStoryModeId} disabled={chosenDirectionDisabled} onChange={onSelectStoryMode} />
              </div>
              {!canBrowse ? (
                <div className="atlas-message" role="status">
                  {isGenerating ? <Loader2 className="motion-safe:animate-spin" /> : <Compass />}
                  <h3>{isGenerating ? "正在绘制故事星图" : "暂时没有生成素材"}</h3>
                  <p>{isGenerating ? "AI 正在根据你的故事方向挑选素材。" : "可以沿用当前故事方向再试一次。"}</p>
                  {!isGenerating && <Button variant="outline" size="sm" onClick={onGenerate}>重新生成</Button>}
                </div>
              ) : groups.map(({ category, options: candidates }) => (
                <section className="atlas-group" key={category} aria-label={IDEA_CONSTELLATION_CATEGORY_LABELS[category]}>
                  <h3 tabIndex={-1} ref={(element) => { sectionHeadings.current[category] = element; }}>
                    <svg viewBox="-37 -30 74 43" aria-hidden="true"><StarFigure category={category} /></svg>
                    {IDEA_CONSTELLATION_CATEGORY_LABELS[category]}
                  </h3>
                  {candidates.map((option) => {
                    const chosen = selected.some((item) => item.id === option.id);
                    return (
                      <button type="button" key={option.id} className="atlas-option" aria-pressed={chosen}
                        data-relevance={option.relevance} disabled={isComposing} onClick={() => toggle(option)}>
                        <span><span className="atlas-option-label">{option.label}</span>
                          <span className="atlas-option-hint">{option.hint}</span></span>
                        <span className="atlas-option-mark" aria-hidden="true">
                          {chosen ? <Check size={14} /> : <Plus size={14} />}
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          </section>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
