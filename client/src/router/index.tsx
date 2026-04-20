import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import { Navigate, useRoutes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { featureFlags } from "@/config/featureFlags";

const Home = lazy(() => import("@/pages/Home"));
const NovelList = lazy(() => import("@/pages/novels/NovelList"));
const NovelCreate = lazy(() => import("@/pages/novels/NovelCreate"));
const NovelEdit = lazy(() => import("@/pages/novels/NovelEdit"));
const NovelChapterEdit = lazy(() => import("@/pages/novels/NovelChapterEdit"));
const CreativeHubPage = lazy(() => import("@/pages/creativeHub/CreativeHubPage"));
const ChatPage = lazy(() => import("@/pages/chat/ChatPage"));
const BookAnalysisPage = lazy(() => import("@/pages/bookAnalysis/BookAnalysisPage"));
const TaskCenterPage = lazy(() => import("@/pages/tasks/TaskCenterPage"));
const KnowledgePage = lazy(() => import("@/pages/knowledge/KnowledgePage"));
const GenreManagementPage = lazy(() => import("@/pages/genres/GenreManagementPage"));
const StoryModeManagementPage = lazy(() => import("@/pages/storyModes/StoryModeManagementPage"));
const TitleStudioPage = lazy(() => import("@/pages/titles/TitleStudioPage"));
const ModelRoutesPage = lazy(() => import("@/pages/settings/ModelRoutesPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
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
      { path: "novels", element: <NovelList /> },
      { path: "novels/create", element: <NovelCreate /> },
      { path: "novels/:id/edit", element: <NovelEdit /> },
      { path: "novels/:id/chapters/:chapterId", element: <NovelChapterEdit /> },
      { path: "creative-hub", element: <CreativeHubPage /> },
      { path: "chat-legacy", element: <ChatPage /> },
      { path: "chat", element: <Navigate to="/creative-hub" replace /> },
      { path: "book-analysis", element: <BookAnalysisPage /> },
      { path: "tasks", element: <TaskCenterPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "genres", element: <GenreManagementPage /> },
      { path: "story-modes", element: <StoryModeManagementPage /> },
      { path: "titles", element: <TitleStudioPage /> },
      { path: "settings/model-routes", element: <ModelRoutesPage /> },
      { path: "settings", element: <SettingsPage /> },
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
