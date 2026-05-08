import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter } from "react-router-dom";
import "highlight.js/styles/github.css";
import DesktopBootstrapBoundary from "./components/layout/DesktopBootstrapBoundary";
import ServerStartupGate from "./components/layout/ServerStartupGate";
import { APP_RUNTIME } from "./lib/constants";
import AppRouter from "./router";
import { Toaster } from "./components/ui/toast";
import "./index.css";

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
    <QueryClientProvider client={queryClient}>
      <AppRouterProvider>
        <DesktopBootstrapBoundary>
          <ServerStartupGate>
            <AppRouter />
          </ServerStartupGate>
        </DesktopBootstrapBoundary>
        <Toaster />
      </AppRouterProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
