import type { RouteObject } from "react-router-dom";
import { Navigate, useRoutes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import BookAnalysisPage from "@/pages/bookAnalysis/BookAnalysisPage";
import CreativeHubPage from "@/pages/creativeHub/CreativeHubPage";
import ChatPage from "@/pages/chat/ChatPage";
import GenreManagementPage from "@/pages/genres/GenreManagementPage";
import Home from "@/pages/Home";
import CharacterLibrary from "@/pages/characters/CharacterLibrary";
import KnowledgePage from "@/pages/knowledge/KnowledgePage";
import NovelChapterEdit from "@/pages/novels/NovelChapterEdit";
import NovelEdit from "@/pages/novels/NovelEdit";
import NovelList from "@/pages/novels/NovelList";
import ModelRoutesPage from "@/pages/settings/ModelRoutesPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import StoryModeManagementPage from "@/pages/storyModes/StoryModeManagementPage";
import TaskCenterPage from "@/pages/tasks/TaskCenterPage";
import TitleStudioPage from "@/pages/titles/TitleStudioPage";
import WorldGenerator from "@/pages/worlds/WorldGenerator";
import WorldList from "@/pages/worlds/WorldList";
import WorldWorkspace from "@/pages/worlds/WorldWorkspace";
import WritingFormulaPage from "@/pages/writingFormula/WritingFormulaPage";
import { featureFlags } from "@/config/featureFlags";
import NovelCreate from "@/pages/novels/NovelCreate";

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
