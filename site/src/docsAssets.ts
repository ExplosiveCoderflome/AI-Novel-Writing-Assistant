const docAssetModules = import.meta.glob("../../docs/public/flow/diagrams/*.{svg,png}", {
  eager: true,
  import: "default",
  query: "?url",
});

const docAssets = docAssetModules as Record<string, string>;

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
