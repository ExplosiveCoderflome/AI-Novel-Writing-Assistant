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

const projectModuleImageModules = import.meta.glob(
  [
    "../../images/小说列表.png",
    "../../images/创作中枢.png",
    "../../images/任务中心.png",
    "../../images/知识库.png",
    "../../images/拆书.png",
    "../../images/写法引擎与反AI规则.jpeg",
    "../../images/角色库.png",
    "../../images/类型管理.jpeg",
    "../../images/流派管理.jpeg",
    "../../images/标题工坊.jpeg",
    "../../images/模型配置.png",
    "../../images/世界观.png",
  ],
  {
    eager: true,
    import: "default",
    query: "?url",
  },
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

function buildDocAssetMap(modules: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(modules).map(([path, url]) => [normalizeDocAssetKey(path), url]));
}

const docAssets = {
  ...buildDocAssetMap(diagramAssetModules as Record<string, string>),
  ...buildDocAssetMap(screenshotAssetModules as Record<string, string>),
  ...buildDocAssetMap(projectModuleImageModules as Record<string, string>),
};

export function resolveDocAssetUrl(docSourcePath: string, assetPath: string | undefined): string | undefined {
  if (!assetPath || /^(https?:)?\/\//.test(assetPath) || assetPath.startsWith("data:")) {
    return assetPath;
  }
  const sourceParts = docSourcePath.split("/");
  sourceParts.pop();
  const normalizedParts = normalizeDocAssetKey(`${sourceParts.join("/")}/${assetPath}`);
  return docAssets[normalizedParts] ?? assetPath;
}
