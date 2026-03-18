import type { WorldPropertyOption } from "@ai-novel/shared/types/worldWizard";

interface WorldPropertyOptionSelectorProps {
  options: WorldPropertyOption[];
  selectedIds: string[];
  details: Record<string, string>;
  onToggle: (optionId: string, checked: boolean) => void;
  onDetailChange: (optionId: string, detail: string) => void;
}

const WORLD_LAYER_LABELS: Record<WorldPropertyOption["targetLayer"], string> = {
  foundation: "基础层",
  power: "力量层",
  society: "社会层",
  culture: "文化层",
  history: "历史层",
  conflict: "冲突层",
};

export default function WorldPropertyOptionSelector({
  options,
  selectedIds,
  details,
  onToggle,
  onDetailChange,
}: WorldPropertyOptionSelectorProps) {
  if (options.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        当前没有拿到可用的前置世界属性。这不是理想状态，通常意味着上一步属性生成失败或返回结构异常，应返回阶段 1 重新生成。
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {options.map((option) => {
        const checked = selectedIds.includes(option.id);
        return (
          <div key={option.id} className="rounded-md border p-3 text-sm space-y-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={(event) => onToggle(option.id, event.target.checked)}
              />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{option.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {WORLD_LAYER_LABELS[option.targetLayer]}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                    {option.source === "library" ? "素材库" : "AI 选项"}
                  </span>
                </div>
                <div className="text-muted-foreground">{option.description}</div>
                {option.reason ? (
                  <div className="text-xs text-muted-foreground">
                    优先理由：{option.reason}
                  </div>
                ) : null}
              </div>
            </label>

            {checked ? (
              <textarea
                className="min-h-[88px] w-full rounded-md border p-2 text-sm"
                placeholder="可选：补充你对这个属性的具体偏好，例如规则边界、势力关系、代价机制。"
                value={details[option.id] ?? ""}
                onChange={(event) => onDetailChange(option.id, event.target.value)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
