import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import DirectorNovelPage from "./DirectorNovelPage";
import "../../index.css";

// Development acceptance surface: no startup gate, worker or database is needed.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <HashRouter>
        <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
          <Routes>
            <Route path="/lab/director/preview" element={<DirectorNovelPage previewOnly />} />
            <Route path="*" element={<Navigate to="/lab/director/preview" replace />} />
          </Routes>
        </main>
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
