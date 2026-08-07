import type { WorldPropertyOption } from "@ai-novel/shared/types/worldWizard";

interface WorldPropertyOptionSelectorProps {
  options: WorldPropertyOption[];
  selectedIds: string[];
  details: Record<string, string>;
  selectedChoiceIds: Record<string, string>;
  onToggle: (optionId: string, checked: boolean) => void;
  onChoiceSelect: (optionId: string, choiceId: string) => void;
  onDetailChange: (optionId: string, detail: string) => void;
}

const WORLD_LAYER_LABELS: Record<WorldPropertyOption["targetLayer"], string> = { foundation: "foundation layer", power: "power layer", society: "society layer", culture: "culture layer", history: "history layer", conflict: "conflict layer", }; export default function WorldPropertyOptionSelector({ options, selectedIds, details, selectedChoiceIds, onToggle, onChoiceSelect, onDetailChange, }: WorldPropertyOptionSelectorProps) { if (options.length === 0) { return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        There are currently no available key directions. It usually means that the previous step of analysis failed, and you can return to step 1 to regenerate.
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
                    {option.source === "library" ? "Material library" : "System recommendations"}
                  </span>
                </div>
                <div className="text-muted-foreground">{option.description}</div>
                {option.reason ? (
                  <div className="text-xs text-muted-foreground">
                    Why is it recommended to set it first:{option.reason}
                  </div>
                ) : null}
              </div>
            </label>

            {checked ? (
              <div className="space-y-3">
                {option.choices && option.choices.length > 0 ? (
                  <div className="space-y-2 rounded-md border border-dashed p-3">
                    <div className="text-xs font-medium text-muted-foreground">Choose a direction first</div>
                    <div className="space-y-2">
                      {option.choices.map((choice) => {
                        const selected = selectedChoiceIds[option.id] === choice.id;
                        return (
                          <label key={choice.id} className="flex items-start gap-3 rounded-md border p-3">
                            <input
                              type="radio"
                              name={`world-option-choice-${option.id}`}
                              className="mt-1"
                              checked={selected}
                              onChange={() => onChoiceSelect(option.id, choice.id)}
                            />
                            <div className="space-y-1">
                              <div className="font-medium">{choice.label}</div>
                              <div className="text-xs text-muted-foreground">{choice.summary}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <textarea
                  className="min-h-[88px] w-full rounded-md border p-2 text-sm"
                  placeholder="Optional: Add your preferences, such as what you want to keep, amplify, and limit."
                  value={details[option.id] ?? ""}
                  onChange={(event) => onDetailChange(option.id, event.target.value)}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
