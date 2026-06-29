const publicDocModules = import.meta.glob("../../docs/public/**/*.md", {
  eager: true,
  import: "default",
  query: "?raw",
});

const releaseDocModules = import.meta.glob("../../docs/releases/release-notes.md", {
  eager: true,
  import: "default",
  query: "?raw",
});

const docModules = {
  ...publicDocModules,
  ...releaseDocModules,
} as Record<string, string>;

export function getDocContent(sourcePath: string): string | undefined {
  return docModules[sourcePath];
}
