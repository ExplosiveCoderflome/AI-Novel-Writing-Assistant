import advancedIntroduction from "../../docs/public/advanced-introduction.md?raw";
import basicIntroduction from "../../docs/public/basic-introduction.md?raw";
import developmentRoadmap from "../../docs/public/development-roadmap.md?raw";
import usageGuide from "../../docs/public/usage-guide.md?raw";
import releaseNotes from "../../docs/releases/release-notes.md?raw";

const docModules: Record<string, string> = {
  "../../docs/public/advanced-introduction.md": advancedIntroduction,
  "../../docs/public/basic-introduction.md": basicIntroduction,
  "../../docs/public/development-roadmap.md": developmentRoadmap,
  "../../docs/public/usage-guide.md": usageGuide,
  "../../docs/releases/release-notes.md": releaseNotes,
};

export function getDocContent(sourcePath: string): string | undefined {
  return docModules[sourcePath];
}
