const diagramAssetModules = import.meta.glob("../../docs/public/flow/diagrams/*.{svg,png}", {
  eager: true,
  import: "default",
  query: "?url",
});

const screenshotAssetModules = import.meta.glob("../../docs/public/flow/screenshots/*.{svg,png,jpg,jpeg,webp}", {
  eager: true,
  import: "default",
  query: "?url",
});

const docAssets = {
  ...(diagramAssetModules as Record<string, string>),
  ...(screenshotAssetModules as Record<string, string>),
};

export function resolveDocAssetUrl(docSourcePath: string, assetPath: string | undefined): string | undefined {
  if (!assetPath || /^(https?:)?\/\//.test(assetPath) || assetPath.startsWith("data:")) {
    return assetPath;
  }
  const sourceParts = docSourcePath.split("/");
  sourceParts.pop();
  const normalizedParts = `${sourceParts.join("/")}/${assetPath}`
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
  return docAssets[normalizedParts] ?? assetPath;
}
