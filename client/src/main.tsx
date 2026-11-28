// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 ExplosiveCoderflome and contributors
// Additional terms under AGPL-3.0 section 7 apply. See NOTICE.
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter } from "react-router-dom";
import "highlight.js/styles/github.css";
import DesktopBootstrapBoundary from "./components/layout/DesktopBootstrapBoundary";
import ServerStartupGate from "./components/layout/ServerStartupGate";
import AccessTokenGate from "./components/layout/AccessTokenGate";
import { APP_RUNTIME } from "./lib/constants";
import AppRouter from "./router";
import { Toaster } from "./components/ui/toast";
import "./index.css";
import { ThemeProvider } from "./components/theme/ThemeProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const AppRouterProvider = APP_RUNTIME === "desktop" ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppRouterProvider>
          <DesktopBootstrapBoundary>
            <ServerStartupGate>
              <AccessTokenGate><AppRouter /></AccessTokenGate>
            </ServerStartupGate>
          </DesktopBootstrapBoundary>
          <Toaster />
        </AppRouterProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
