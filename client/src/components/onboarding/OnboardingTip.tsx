import { useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OnboardingTipProps {
  storageKey: string;
  title: string;
  description: string;
  next?: string;
}

function readVisible(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(`ai-novel.guide-tip.${storageKey}`) !== "dismissed";
  } catch {
    return true;
  }
}

export default function OnboardingTip({
  storageKey,
  title,
  description,
  next,
}: OnboardingTipProps) {
  const [visible, setVisible] = useState(() => readVisible(storageKey));
  if (!visible) {
    return null;
  }
  const dismiss = () => {
    try {
      window.localStorage.setItem(`ai-novel.guide-tip.${storageKey}`, "dismissed");
    } catch {
      // Storage can be unavailable in privacy mode; hiding for this session is enough.
    }
    setVisible(false);
  };
  return (
    <aside className="flex items-start gap-3 rounded-xl border border-sky-200/80 bg-sky-50/70 px-4 py-3 text-sky-950">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100">
        <Lightbulb className="h-4 w-4 text-sky-700" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-1 text-xs leading-5 text-sky-900/75">{description}</p>
        {next ? <p className="mt-1 text-xs font-medium text-sky-800">接下来：{next}</p> : null}
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-sky-800 hover:bg-sky-100" onClick={dismiss} aria-label="关闭此条引导">
        <X className="h-3.5 w-3.5" />
      </Button>
    </aside>
  );
}
