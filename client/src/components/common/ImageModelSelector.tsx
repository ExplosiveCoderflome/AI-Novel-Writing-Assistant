import i18next from "i18next";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon } from "lucide-react";
import { getAPIKeySettings } from "@/api/settings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getStoredImageProvider,
  setStoredImageProvider,
  resolveImageProviderOptions,
} from "@/lib/imageModelRegistry";

export { getStoredImageProvider, setStoredImageProvider, PREFERRED_IMAGE_PROVIDER_KEY } from "@/lib/imageModelRegistry";

interface ImageModelSelectorProps {
  compact?: boolean;
  className?: string;
}

export default function ImageModelSelector({ compact = true, className }: ImageModelSelectorProps) {
  const [selectedProvider, setSelectedProvider] = useState<string>(getStoredImageProvider);

  const { data: apiKeysRes } = useQuery({
    queryKey: ["settings", "api-keys"],
    queryFn: getAPIKeySettings,
  });

  const providerOptions = useMemo(() => {
    return resolveImageProviderOptions(apiKeysRes?.data ?? [], selectedProvider);
  }, [apiKeysRes, selectedProvider]);

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
          <SelectValue placeholder={i18next.t("common.imageModelSelector.3jnqsw", { defaultValue: "选择文生图模型" })} />
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
