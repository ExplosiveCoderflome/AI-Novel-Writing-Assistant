import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import { Navigate, useRoutes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { featureFlags } from "@/config/featureFlags";

const Home = lazy(() => import("@/pages/Home"));
const HelpPage = lazy(() => import("@/pages/help/HelpPage"));
const NovelList = lazy(() => import("@/pages/novels/NovelList"));
const NovelCreate = lazy(() => import("@/pages/novels/NovelCreate"));
const CreationStudioPage = lazy(() => import("@/pages/creationStudio/CreationStudioPage"));
const ShortStoryStudioPage = lazy(() => import("@/pages/shortStory/ShortStoryStudioPage"));
const AutoDirectorCreatePage = lazy(() => import("@/pages/novels/autoDirector/AutoDirectorCreatePage"));
const SimpleNovelShelfPage = lazy(() => import("@/pages/novels/simpleCreation/SimpleNovelShelfPage"));
const NovelPreview = lazy(() => import("@/pages/novels/NovelPreview"));
const NarrativeFormNovelEditRoute = lazy(() => import("@/pages/novels/NarrativeFormNovelEditRoute"));
const NovelChapterEdit = lazy(() => import("@/pages/novels/NovelChapterEdit"));
const DramaWorkspacePage = lazy(() => import("@/pages/drama/DramaWorkspacePage"));
const DramaProjectPage = lazy(() => import("@/pages/drama/DramaProjectPage"));
const ComicWorkspacePage = lazy(() => import("@/pages/comic/ComicWorkspacePage"));
const ComicProjectPage = lazy(() => import("@/pages/comic/ComicProjectPage"));
const CreativeHubPage = lazy(() => import("@/pages/creativeHub/CreativeHubPage"));
const ChatPage = lazy(() => import("@/pages/chat/ChatPage"));
const BookAnalysisPage = lazy(() => import("@/pages/bookAnalysis/BookAnalysisPage"));
const TaskCenterPage = lazy(() => import("@/pages/tasks/TaskCenterPage"));
const AutoDirectorFollowUpCenterPage = lazy(() => import("@/pages/autoDirectorFollowUps/AutoDirectorFollowUpCenterPage"));
const KnowledgePage = lazy(() => import("@/pages/knowledge/KnowledgePage"));
const GenreManagementPage = lazy(() => import("@/pages/genres/GenreManagementPage"));
const StoryModeManagementPage = lazy(() => import("@/pages/storyModes/StoryModeManagementPage"));
const TitleStudioPage = lazy(() => import("@/pages/titles/TitleStudioPage"));
const PromptWorkbenchPage = lazy(() => import("@/pages/promptWorkbench/PromptWorkbenchPage"));
const AntiAiRulesPage = lazy(() => import("@/pages/antiAiRules/AntiAiRulesPage"));
const SettingsOverviewPage = lazy(() => import("@/pages/settings/views/SettingsOverviewPage"));
const ModelsSettingsPage = lazy(() => import("@/pages/settings/views/ModelsSettingsPage"));
const DirectorSettingsPage = lazy(() => import("@/pages/settings/views/DirectorSettingsPage"));
const KnowledgeSettingsPage = lazy(() => import("@/pages/settings/views/KnowledgeSettingsPage"));
const MaintenanceSettingsPage = lazy(() => import("@/pages/settings/views/MaintenanceSettingsPage"));
const AppearanceSettingsPage = lazy(() => import("@/pages/settings/views/AppearanceSettingsPage"));
const WorldList = lazy(() => import("@/pages/worlds/WorldList"));
const WorldGenerator = lazy(() => import("@/pages/worlds/WorldGenerator"));
const WorldWorkspace = lazy(() => import("@/pages/worlds/WorldWorkspace"));
const WritingFormulaPage = lazy(() => import("@/pages/writingFormula/WritingFormulaPage"));
const CharacterLibrary = lazy(() => import("@/pages/characters/CharacterLibrary"));

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "help", element: <HelpPage /> },
      { path: "novels", element: <NovelList /> },
      { path: "create", element: <CreationStudioPage /> },
      { path: "novels/create", element: <NovelCreate /> },
      { path: "novels/auto-director", element: <AutoDirectorCreatePage /> },
      { path: "novels/:id/simple", element: <SimpleNovelShelfPage /> },
      { path: "novels/:id/story", element: <ShortStoryStudioPage /> },
      { path: "novels/:id/preview", element: <NovelPreview /> },
      { path: "novels/:id/edit", element: <NarrativeFormNovelEditRoute /> },
      { path: "novels/:id/chapters/:chapterId", element: <NovelChapterEdit /> },
      { path: "drama", element: <DramaWorkspacePage /> },
      { path: "drama/projects/:id", element: <DramaProjectPage /> },
      { path: "comic", element: <ComicWorkspacePage /> },
      { path: "comic/projects/:id", element: <ComicProjectPage /> },
      { path: "creative-hub", element: <CreativeHubPage /> },
      { path: "chat-legacy", element: <ChatPage /> },
      { path: "chat", element: <Navigate to="/creative-hub" replace /> },
      { path: "book-analysis", element: <BookAnalysisPage /> },
      { path: "tasks", element: <TaskCenterPage /> },
      { path: "auto-director/follow-ups", element: <AutoDirectorFollowUpCenterPage /> },
      { path: "auto-director/follow-up-center", element: <Navigate to="/auto-director/follow-ups" replace /> },
      { path: "auto-director/followup-center", element: <Navigate to="/auto-director/follow-ups" replace /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "genres", element: <GenreManagementPage /> },
      { path: "story-modes", element: <StoryModeManagementPage /> },
      { path: "titles", element: <TitleStudioPage /> },
      { path: "prompt-workbench", element: <PromptWorkbenchPage /> },
      { path: "anti-ai-rules", element: <AntiAiRulesPage /> },
      { path: "settings/model-routes", element: <Navigate to="/settings/models" replace /> },
      { path: "settings/models", element: <ModelsSettingsPage /> },
      { path: "settings/director", element: <DirectorSettingsPage /> },
      { path: "settings/knowledge", element: <KnowledgeSettingsPage /> },
      { path: "settings/maintenance", element: <MaintenanceSettingsPage /> },
      { path: "settings/appearance", element: <AppearanceSettingsPage /> },
      { path: "settings", element: <SettingsOverviewPage /> },
      { path: "worlds", element: <WorldList /> },
      {
        path: "worlds/generator",
        element: featureFlags.worldWizardEnabled ? <WorldGenerator /> : <Navigate to="/worlds" replace />,
      },
      {
        path: "worlds/:id/workspace",
        element: featureFlags.worldWizardEnabled ? <WorldWorkspace /> : <Navigate to="/worlds" replace />,
      },
      { path: "style-engine", element: <WritingFormulaPage /> },
      { path: "writing-formula", element: <Navigate to="/style-engine" replace /> },
      { path: "base-characters", element: <CharacterLibrary /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];

export default function AppRouter() {
  return useRoutes(routes);
}
