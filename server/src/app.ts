import "dotenv/config";
import os from "node:os";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { errorHandler } from "./middleware/errorHandler";
import { loadProviderApiKeys } from "./llm/factory";
import astrologyRouter from "./routes/astrology";
import agentCatalogRouter from "./routes/agentCatalog";
import agentRunsRouter from "./routes/agentRuns";
import bookAnalysisRouter from "./routes/bookAnalysis";
import characterRouter from "./routes/character";
import chatRouter from "./routes/chat";
import creativeHubRouter from "./routes/creativeHub";
import genreRouter from "./routes/genre";
import healthRouter from "./routes/health";
import imagesRouter from "./routes/images";
import knowledgeRouter from "./routes/knowledge";
import llmRouter from "./routes/llm";
import novelRouter from "./routes/novel";
import novelDirectorRouter from "./routes/novelDirector";
import novelDecisionsRouter from "./routes/novelDecisions";
import novelChapterSummaryRouter from "./routes/novelChapterSummary";
import novelExportRouter from "./routes/novelExport";
import novelWorkflowsRouter from "./routes/novelWorkflows";
import ragRouter from "./routes/rag";
import settingsRouter from "./routes/settings";
import styleEngineRouter from "./routes/styleEngine";
import styleEngineExtractionRouter from "./routes/styleEngineExtraction";
import storyModeRouter from "./routes/storyMode";
import tasksRouter from "./routes/tasks";
import titleLibraryRouter from "./routes/titleLibrary";
import worldRouter from "./routes/world";
import writingFormulaRouter from "./routes/writingFormula";
import { novelEventBus, registerNovelEventHandlers } from "./events";
import { bookAnalysisService } from "./services/bookAnalysis/BookAnalysisService";
import { imageGenerationService } from "./services/image/ImageGenerationService";
import { ragServices } from "./services/rag";
import { NovelWorkflowRuntimeService } from "./services/novel/workflow/NovelWorkflowRuntimeService";

registerNovelEventHandlers(novelEventBus);
const novelWorkflowRuntimeService = new NovelWorkflowRuntimeService();

morgan.token("error-message", (_req, res) => {
  const response = res as typeof res & {
    locals?: {
      requestErrorMessage?: unknown;
    };
  };
  const errorMessage = response.locals?.requestErrorMessage;
  return typeof errorMessage === "string" ? errorMessage.trim() : "";
});

function parseEnvFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1";
}

export function createApp() {
  const app = express();
  const jsonBodyLimit = process.env.API_JSON_LIMIT ?? "20mb";
  const corsOriginEnv = process.env.CORS_ORIGIN;
  const corsAllowList = corsOriginEnv
    ? corsOriginEnv
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    : [];

  const allowLan = parseEnvFlag(process.env.ALLOW_LAN, process.env.NODE_ENV !== "production");
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const isListedOrigin = corsAllowList.includes(origin);
        const isLocalhostDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
        const isLanOrigin = allowLan && /^https?:\/\/(?:\d{1,3}\.){3}\d{1,3}:\d+$/.test(origin);
        callback(null, isListedOrigin || isLocalhostDevOrigin || isLanOrigin);
      },
      credentials: true,
    }),
  );
  app.use(helmet());
  app.use(morgan((tokens, req, res) => {
    const method = tokens.method(req, res) ?? "-";
    const url = tokens.url(req, res) ?? "-";
    const status = tokens.status(req, res) ?? "-";
    const responseTime = tokens["response-time"](req, res) ?? "0";
    const contentLength = tokens.res(req, res, "content-length") ?? "0";
    const errorMessage = tokens["error-message"](req, res);
    const errorSuffix = errorMessage ? ` | error: ${errorMessage}` : "";
    return `${method} ${url} ${status} ${responseTime} ms - ${contentLength}${errorSuffix}`;
  }));
  app.use(express.json({ limit: jsonBodyLimit }));

  app.use("/api/health", healthRouter);
  app.use("/api/agent-catalog", agentCatalogRouter);
  app.use("/api/agent-runs", agentRunsRouter);
  app.use("/api/book-analysis", bookAnalysisRouter);
  app.use("/api/genres", genreRouter);
  app.use("/api/story-modes", storyModeRouter);
  app.use("/api/knowledge", knowledgeRouter);
  app.use("/api/llm", llmRouter);
  app.use("/api/title-library", titleLibraryRouter);
  app.use("/api", styleEngineRouter);
  app.use("/api", styleEngineExtractionRouter);
  app.use("/api/novels", novelRouter);
  app.use("/api/novels/director", novelDirectorRouter);
  app.use("/api/novel-workflows", novelWorkflowsRouter);
  app.use("/api/novels", novelDecisionsRouter);
  app.use("/api/novels", novelChapterSummaryRouter);
  app.use("/api/novels", novelExportRouter);
  app.use("/api/worlds", worldRouter);
  app.use("/api/rag", ragRouter);
  app.use("/api/base-characters", characterRouter);
  app.use("/api/writing-formula", writingFormulaRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/creative-hub", creativeHubRouter);
  app.use("/api/images", imagesRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/astrology", astrologyRouter);

  app.use((_req, res) => {
    const response: ApiResponse<null> = {
      success: false,
      error: "接口不存在。",
    };
    res.status(404).json(response);
  });

  app.use(errorHandler);

  return app;
}

function getLanIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const info of list) {
      if (info.family === "IPv4" && !info.internal) {
        return info.address;
      }
    }
  }
  return null;
}

async function bootstrap(): Promise<void> {
  try {
    await loadProviderApiKeys();
  } catch (error) {
    console.warn("数据库中的模型密钥加载失败，已回退到环境变量。", error);
  }

  const app = createApp();
  const port = Number(process.env.PORT ?? 3000);
  const allowLan = parseEnvFlag(process.env.ALLOW_LAN, process.env.NODE_ENV !== "production");
  const host = process.env.HOST ?? (allowLan ? "0.0.0.0" : "localhost");
  ragServices.ragWorker.start();
  bookAnalysisService.startWatchdog();
  void bookAnalysisService.resumePendingAnalyses().catch((error) => {
    console.warn("Failed to resume pending book analyses.", error);
  });
  void imageGenerationService.resumePendingTasks().catch((error) => {
    console.warn("Failed to resume pending image generation tasks.", error);
  });
  void novelWorkflowRuntimeService.resumePendingAutoDirectorTasks().catch((error) => {
    console.warn("Failed to resume pending auto director workflows.", error);
  });

  app.listen(port, host, () => {
    console.log(`[server] listening on http://localhost:${port}`);
    if (host === "0.0.0.0" || host === "::") {
      const lanIp = getLanIp();
      if (lanIp) {
        console.log(`[server] LAN: http://${lanIp}:${port}`);
      }
    }
  });
}

if (require.main === module) {
  void bootstrap();
}
