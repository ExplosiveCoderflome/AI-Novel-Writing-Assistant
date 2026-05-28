import { useEffect, useState } from "react";
import type { TakeoverChapterTargetViewModel } from "../novelExistingProjectTakeoverViewModel";
import { Input } from "@/components/ui/input";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface TakeoverChapterTargetSelectorProps {
  target: TakeoverChapterTargetViewModel;
  disabled?: boolean;
  onChange: (order: number) => void;
}

export default function TakeoverChapterTargetSelector({
  target,
  disabled = false,
  onChange,
}: TakeoverChapterTargetSelectorProps) {
  const [draftValue, setDraftValue] = useState(() => String(target.selectedOrder));

  useEffect(() => {
    setDraftValue(String(target.selectedOrder));
  }, [target.selectedOrder]);

  const commitDraftValue = () => {
    const parsed = Number.parseInt(draftValue, 10);
    if (!Number.isFinite(parsed)) {
      setDraftValue(String(target.selectedOrder));
      return;
    }
    const clamped = Math.min(Math.max(Math.round(parsed), target.startOrder), target.maxOrder);
    setDraftValue(String(clamped));
    onChange(clamped);
  };

  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-foreground">推进至</div>
        <Input
          className="h-10 sm:w-40"
          type="number"
          min={target.startOrder}
          max={target.maxOrder}
          step={1}
          value={draftValue}
          disabled={disabled}
          onChange={(event) => {
            const nextValue = event.target.value;
            setDraftValue(nextValue);
            const nextOrder = Number.parseInt(event.target.value, 10);
            if (nextOrder >= target.startOrder && nextOrder <= target.maxOrder) {
              onChange(nextOrder);
            }
          }}
          onBlur={commitDraftValue}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitDraftValue();
            }
          }}
          aria-label="推进至章节"
        />
      </div>
      <div className={`mt-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        {target.summary} 可输入范围：第 {target.startOrder}-{target.maxOrder} 章。
      </div>
    </div>
  );
}
