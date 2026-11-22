import { useId, type Ref } from "react";
import { ArrowLeft, Feather } from "lucide-react";
import { DIRECTOR_CORRECTION_PRESETS, type DirectorCorrectionPreset } from "@ai-novel/shared/types/novelDirector";
import { Button } from "@/components/ui/button";

export interface NextCandidateRoundProps {
  selectedPresets: DirectorCorrectionPreset[];
  feedback: string;
  onTogglePreset: (preset: DirectorCorrectionPreset) => void;
  onFeedbackChange: (value: string) => void;
  onGenerate: () => void;
}

export function NextCandidateRound({ selectedPresets, feedback, onTogglePreset, onFeedbackChange, onGenerate,
  disabled, headingRef, onBack }: NextCandidateRoundProps & {
    disabled: boolean;
    headingRef: Ref<HTMLHeadingElement>;
    onBack?: () => void;
  }) {
  const feedbackId = useId();
  return <section className="flex min-h-0 flex-1 flex-col" aria-label="生成下一轮方向">
    <header className="agent-heading">
      <span className="agent-mark" aria-hidden="true"><Feather size={20} /></span>
      <div><h3>开书助手</h3></div>
      {onBack && <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={15} />返回方案讨论</Button>}
    </header>
    <form className="min-h-0 space-y-5 overflow-y-auto p-4" onSubmit={event => {
      event.preventDefault();
      if (!disabled) onGenerate();
    }}>
      <div>
        <h4 ref={headingRef} tabIndex={-1} className="font-semibold">生成下一轮方向</h4>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">已有方案会保留，你可以把新一轮和前几轮放在一起比较。</p>
      </div>
      <fieldset disabled={disabled}>
        <legend className="text-sm font-medium">下一轮想尝试哪些变化？</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIRECTOR_CORRECTION_PRESETS.map(preset => (
            <Button key={preset.value} type="button" size="sm" className="rounded-full"
              aria-pressed={selectedPresets.includes(preset.value)} variant={selectedPresets.includes(preset.value) ? "default" : "secondary"}
              onClick={() => onTogglePreset(preset.value)}>{preset.label}</Button>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <label htmlFor={feedbackId} className="block text-sm font-medium">给新一轮的要求（选填）</label>
        <textarea id={feedbackId} rows={3} maxLength={500} value={feedback} disabled={disabled}
          onChange={event => onFeedbackChange(event.target.value)}
          placeholder="比如，让主角在第一章就面临一个两难的选择。"
          className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <Button type="submit" disabled={disabled}>生成新一轮</Button>
    </form>
  </section>;
}
