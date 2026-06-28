import advancedIntroduction from "../../docs/public/advanced-introduction.md?raw";
import basicIntroduction from "../../docs/public/basic-introduction.md?raw";
import developmentRoadmap from "../../docs/public/development-roadmap.md?raw";
import antiAiRules from "../../docs/public/modules/anti-ai-rules.md?raw";
import bookAnalysis from "../../docs/public/modules/book-analysis.md?raw";
import characterLibrary from "../../docs/public/modules/character-library.md?raw";
import comicWorkspace from "../../docs/public/modules/comic-workspace.md?raw";
import creativeHub from "../../docs/public/modules/creative-hub.md?raw";
import directorFollowUp from "../../docs/public/modules/director-follow-up.md?raw";
import genreBaseLibrary from "../../docs/public/modules/genre-base-library.md?raw";
import home from "../../docs/public/modules/home.md?raw";
import knowledgeBase from "../../docs/public/modules/knowledge-base.md?raw";
import modelRouting from "../../docs/public/modules/model-routing.md?raw";
import novels from "../../docs/public/modules/novels.md?raw";
import onboarding from "../../docs/public/modules/onboarding.md?raw";
import progressionModeLibrary from "../../docs/public/modules/progression-mode-library.md?raw";
import promptManagement from "../../docs/public/modules/prompt-management.md?raw";
import shortDramaWorkspace from "../../docs/public/modules/short-drama-workspace.md?raw";
import styleEngine from "../../docs/public/modules/style-engine.md?raw";
import systemSettings from "../../docs/public/modules/system-settings.md?raw";
import taskCenter from "../../docs/public/modules/task-center.md?raw";
import titleWorkshop from "../../docs/public/modules/title-workshop.md?raw";
import worldSampleLibrary from "../../docs/public/modules/world-sample-library.md?raw";
import usageGuide from "../../docs/public/usage-guide.md?raw";
import releaseNotes from "../../docs/releases/release-notes.md?raw";

const docModules: Record<string, string> = {
  "../../docs/public/advanced-introduction.md": advancedIntroduction,
  "../../docs/public/basic-introduction.md": basicIntroduction,
  "../../docs/public/development-roadmap.md": developmentRoadmap,
  "../../docs/public/modules/anti-ai-rules.md": antiAiRules,
  "../../docs/public/modules/book-analysis.md": bookAnalysis,
  "../../docs/public/modules/character-library.md": characterLibrary,
  "../../docs/public/modules/comic-workspace.md": comicWorkspace,
  "../../docs/public/modules/creative-hub.md": creativeHub,
  "../../docs/public/modules/director-follow-up.md": directorFollowUp,
  "../../docs/public/modules/genre-base-library.md": genreBaseLibrary,
  "../../docs/public/modules/home.md": home,
  "../../docs/public/modules/knowledge-base.md": knowledgeBase,
  "../../docs/public/modules/model-routing.md": modelRouting,
  "../../docs/public/modules/novels.md": novels,
  "../../docs/public/modules/onboarding.md": onboarding,
  "../../docs/public/modules/progression-mode-library.md": progressionModeLibrary,
  "../../docs/public/modules/prompt-management.md": promptManagement,
  "../../docs/public/modules/short-drama-workspace.md": shortDramaWorkspace,
  "../../docs/public/modules/style-engine.md": styleEngine,
  "../../docs/public/modules/system-settings.md": systemSettings,
  "../../docs/public/modules/task-center.md": taskCenter,
  "../../docs/public/modules/title-workshop.md": titleWorkshop,
  "../../docs/public/modules/world-sample-library.md": worldSampleLibrary,
  "../../docs/public/usage-guide.md": usageGuide,
  "../../docs/releases/release-notes.md": releaseNotes,
};

export function getDocContent(sourcePath: string): string | undefined {
  return docModules[sourcePath];
}
