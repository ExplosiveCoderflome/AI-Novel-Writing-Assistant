import type { RouteObject } from "react-router-dom";
import { Navigate, useRoutes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import BookAnalysisPage from "@/pages/bookAnalysis/BookAnalysisPage";
import Home from "@/pages/Home";
import ChatPage from "@/pages/chat/ChatPage";
import CharacterLibrary from "@/pages/characters/CharacterLibrary";
import KnowledgePage from "@/pages/knowledge/KnowledgePage";
import NovelChapterEdit from "@/pages/novels/NovelChapterEdit";
import NovelEdit from "@/pages/novels/NovelEdit";
import NovelList from "@/pages/novels/NovelList";
import SettingsPage from "@/pages/settings/SettingsPage";
import WorldGenerator from "@/pages/worlds/WorldGenerator";
import WorldList from "@/pages/worlds/WorldList";
import WorldWorkspace from "@/pages/worlds/WorldWorkspace";
import WritingFormulaPage from "@/pages/writingFormula/WritingFormulaPage";
import { featureFlags } from "@/config/featureFlags";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "novels", element: <NovelList /> },
      { path: "novels/:id/edit", element: <NovelEdit /> },
      { path: "novels/:id/chapters/:chapterId", element: <NovelChapterEdit /> },
      { path: "chat", element: <ChatPage /> },
      { path: "book-analysis", element: <BookAnalysisPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
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
      { path: "writing-formula", element: <WritingFormulaPage /> },
      { path: "base-characters", element: <CharacterLibrary /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];

export default function AppRouter() {
  return useRoutes(routes);
}
