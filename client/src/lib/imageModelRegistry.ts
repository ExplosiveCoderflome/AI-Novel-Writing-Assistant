import i18next from "i18next";

export const PREFERRED_IMAGE_PROVIDER_KEY = "comic.preferredImageProvider";

export interface ImageProviderOption {
  value: string;
  label: string;
}

export interface ConfiguredApiProvider {
  provider: string;
  name: string;
  displayName?: string | null;
  supportsImageGeneration?: boolean;
  isConfigured?: boolean;
}

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
  } catch {
    /* ignore */
  }
}

export function getFallbackImageProviders(): ImageProviderOption[] {
  return [
    {
      value: "comfyui",
      label: i18next.t("common.imageModelSelector.kuc2hs", { defaultValue: "ComfyUI 引擎 (FLUX.1 本地模型)" }),
    },
    {
      value: "sensenova",
      label: i18next.t("common.imageModelSelector.r6zsie", { defaultValue: "SenseNova (离线引擎)" }),
    },
  ];
}

export function resolveImageProviderOptions(
  configuredProviders: ConfiguredApiProvider[] = [],
  currentProvider?: string
): ImageProviderOption[] {
  const list: ImageProviderOption[] = configuredProviders
    .filter((p) => p.supportsImageGeneration && p.isConfigured)
    .map((p) => ({ value: p.provider, label: p.displayName ?? p.name }));

  const fallbacks = getFallbackImageProviders();
  for (const fb of fallbacks) {
    if (!list.some((p) => p.value === fb.value)) {
      if (fb.value === "comfyui") {
        list.unshift(fb);
      } else {
        list.push(fb);
      }
    }
  }

  if (currentProvider && !list.some((p) => p.value === currentProvider)) {
    list.push({ value: currentProvider, label: currentProvider });
  }

  return list;
}
