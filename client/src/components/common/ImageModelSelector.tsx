import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon } from "lucide-react";
import { getAPIKeySettings } from "@/api/settings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ImageModelSelectorProps {
  compact?: boolean;
  className?: string;
}

export const PREFERRED_IMAGE_PROVIDER_KEY = "comic.preferredImageProvider";

export function getStoredImageProvider(): string {
  try {
    return localStorage.getItem(PREFERRED_IMAGE_PROVIDER_KEY) ?? "comfyui";
  } catch {
    return "comfyui";
  }
}

export function setStoredImageProvider(provider: string): void {
  try {
    localStorage.setItem(PREFERRED_IMAGE_PROVIDER_KEY, provider);
    window.dispatchEvent(new CustomEvent("comic-image-provider-changed", { detail: provider }));
  } catch { /* ignore */ }
}

export default function ImageModelSelector({ compact = true, className }: ImageModelSelectorProps) {
  const [selectedProvider, setSelectedProvider] = useState<string>(getStoredImageProvider);

  const { data: apiKeysRes } = useQuery({
    queryKey: ["settings", "api-keys"],
    queryFn: getAPIKeySettings,
  });

  const providerOptions = useMemo(() => {
    const list = (apiKeysRes?.data ?? [])
      .filter((p) => p.supportsImageGeneration && p.isConfigured)
      .map((p) => ({ value: p.provider, label: p.displayName ?? p.name }));

    if (!list.some((p) => p.value === "comfyui")) {
      list.unshift({ value: "comfyui", label: "ComfyUI 引擎 (FLUX.1 本地模型)" });
    }
    if (!list.some((p) => p.value === "sensenova")) {
      list.push({ value: "sensenova", label: "SenseNova (离线引擎)" });
    }
    return list;
  }, [apiKeysRes]);

  const resolvedValue = useMemo(() => {
    if (selectedProvider && providerOptions.some((p) => p.value === selectedProvider)) {
      return selectedProvider;
    }
    return providerOptions[0]?.value ?? "comfyui";
  }, [selectedProvider, providerOptions]);

  const handleSelect = (val: string) => {
    setSelectedProvider(val);
    setStoredImageProvider(val);
  };

  useEffect(() => {
    const handleStorage = (e: Event) => {
      if (e instanceof CustomEvent && e.detail) {
        setSelectedProvider(e.detail);
      } else {
        setSelectedProvider(getStoredImageProvider());
      }
    };
    window.addEventListener("comic-image-provider-changed", handleStorage);
    return () => window.removeEventListener("comic-image-provider-changed", handleStorage);
  }, []);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Select value={resolvedValue} onValueChange={handleSelect}>
        <SelectTrigger className={cn("h-9 border-input bg-background font-normal text-xs gap-1.5", compact && "w-[170px]")}>
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <SelectValue placeholder="选择文生图模型" />
        </SelectTrigger>
        <SelectContent align="end">
          {providerOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
