const diagramAssetModules = import.meta.glob(
  "../../docs/public/flow/diagrams/*.{svg,png,jpg,jpeg,webp}",
  { eager: true, import: "default", query: "?url" },
);

const screenshotAssetModules = import.meta.glob(
  "../../docs/public/flow/screenshots/*.{svg,png,jpg,jpeg,webp}",
  { eager: true, import: "default", query: "?url" },
);

const projectModuleImageModules = import.meta.glob(
  "../../images/*.{png,jpg,jpeg,webp,svg,gif}",
  { eager: true, import: "default", query: "?url" },
);

function normalizeDocAssetKey(path: string): string {
  return path
    .split("/")
    .reduce<string[]>((parts, part) => {
      if (!part || part === ".") {
        return parts;
      }
      if (part === "..") {
        parts.pop();
        return parts;
      }
      parts.push(part);
      return parts;
    }, [])
    .join("/");
}

function basenameOf(path: string): string {
  const last = path.split("/").pop();
  return last ?? path;
}

type AssetMaps = {
  byPath: Record<string, string>;
  byBasename: Record<string, string>;
};

function buildAssetMaps(...modulesList: Record<string, string>[]): AssetMaps {
  const byPath: Record<string, string> = {};
  const byBasename: Record<string, string> = {};
  for (const modules of modulesList) {
    for (const [rawPath, url] of Object.entries(modules)) {
      const normalized = normalizeDocAssetKey(rawPath);
      byPath[normalized] = url;
      const base = basenameOf(normalized);
      if (base) {
        byBasename[base] = url;
      }
    }
  }
  return { byPath, byBasename };
}

const { byPath, byBasename } = buildAssetMaps(
  diagramAssetModules as Record<string, string>,
  screenshotAssetModules as Record<string, string>,
  projectModuleImageModules as Record<string, string>,
);

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveDocAssetUrl(
  docSourcePath: string,
  assetPath: string | undefined,
): string | undefined {
  if (!assetPath || /^(https?:)?\/\//.test(assetPath) || assetPath.startsWith("data:")) {
    return assetPath;
  }
  const decodedAsset = safeDecode(assetPath);
  const sourceParts = docSourcePath.split("/");
  sourceParts.pop();
  const combined = `${sourceParts.join("/")}/${decodedAsset}`;
  const normalized = normalizeDocAssetKey(combined);
  if (byPath[normalized]) {
    return byPath[normalized];
  }
  const base = basenameOf(normalizeDocAssetKey(decodedAsset));
  if (base && byBasename[base]) {
    return byBasename[base];
  }
  return assetPath;
}
