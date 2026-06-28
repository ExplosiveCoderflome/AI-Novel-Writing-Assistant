import modelSelection from "../../docs/wiki/architecture/model-selection.md?raw";
import moduleBoundaries from "../../docs/wiki/architecture/module-boundaries.md?raw";
import configurationConventions from "../../docs/wiki/architecture/configuration-conventions.md?raw";
import imageGenerationProviders from "../../docs/wiki/architecture/image-generation-providers.md?raw";
import beginnerFirstNovelCompletion from "../../docs/wiki/product/beginner-first-novel-completion.md?raw";
import githubIntroSite from "../../docs/wiki/product/github-intro-site.md?raw";
import promptRegistryAndStructuredOutput from "../../docs/wiki/prompts/prompt-registry-and-structured-output.md?raw";
import knowledgeAndContextAssembly from "../../docs/wiki/rag/knowledge-and-context-assembly.md?raw";
import releaseNotes from "../../docs/releases/release-notes.md?raw";
import autoDirectorRuntime from "../../docs/wiki/workflows/auto-director-runtime.md?raw";
import bookAnalysisWorkflow from "../../docs/wiki/workflows/book-analysis-workflow.md?raw";
import chapterProductionChain from "../../docs/wiki/workflows/chapter-production-chain.md?raw";
import creativeHubBoundary from "../../docs/wiki/workflows/creative-hub-boundary.md?raw";
import imageGenerationConfirmationRuntime from "../../docs/wiki/workflows/image-generation-confirmation-runtime.md?raw";

const docModules: Record<string, string> = {
  "../../docs/wiki/architecture/configuration-conventions.md": configurationConventions,
  "../../docs/wiki/architecture/image-generation-providers.md": imageGenerationProviders,
  "../../docs/wiki/architecture/model-selection.md": modelSelection,
  "../../docs/wiki/architecture/module-boundaries.md": moduleBoundaries,
  "../../docs/wiki/product/beginner-first-novel-completion.md": beginnerFirstNovelCompletion,
  "../../docs/wiki/product/github-intro-site.md": githubIntroSite,
  "../../docs/wiki/prompts/prompt-registry-and-structured-output.md": promptRegistryAndStructuredOutput,
  "../../docs/wiki/rag/knowledge-and-context-assembly.md": knowledgeAndContextAssembly,
  "../../docs/releases/release-notes.md": releaseNotes,
  "../../docs/wiki/workflows/auto-director-runtime.md": autoDirectorRuntime,
  "../../docs/wiki/workflows/book-analysis-workflow.md": bookAnalysisWorkflow,
  "../../docs/wiki/workflows/chapter-production-chain.md": chapterProductionChain,
  "../../docs/wiki/workflows/creative-hub-boundary.md": creativeHubBoundary,
  "../../docs/wiki/workflows/image-generation-confirmation-runtime.md": imageGenerationConfirmationRuntime,
};

export function getDocContent(sourcePath: string): string | undefined {
  return docModules[sourcePath];
}
