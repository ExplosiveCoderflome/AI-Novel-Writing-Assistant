import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { errorHandler } from "./middleware/errorHandler";
import { loadProviderApiKeys } from "./llm/factory";
import astrologyRouter from "./routes/astrology";
import characterRouter from "./routes/character";
import chatRouter from "./routes/chat";
import healthRouter from "./routes/health";
import llmRouter from "./routes/llm";
import novelRouter from "./routes/novel";
import settingsRouter from "./routes/settings";
import worldRouter from "./routes/world";
import writingFormulaRouter from "./routes/writingFormula";

export function createApp() {
  const app = express();
  const corsOriginEnv = process.env.CORS_ORIGIN;
  const corsAllowList = corsOriginEnv
    ? corsOriginEnv
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    : [];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (corsAllowList.length > 0) {
          callback(null, corsAllowList.includes(origin));
          return;
        }
        const isLocalhostDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
        callback(null, isLocalhostDevOrigin);
      },
      credentials: true,
    }),
  );
  app.use(helmet());
  app.use(morgan("dev"));
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/llm", llmRouter);
  app.use("/api/novels", novelRouter);
  app.use("/api/worlds", worldRouter);
  app.use("/api/base-characters", characterRouter);
  app.use("/api/writing-formula", writingFormulaRouter);
  app.use("/api/chat", chatRouter);
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

async function bootstrap(): Promise<void> {
  try {
    await loadProviderApiKeys();
  } catch (error) {
    console.warn("数据库中的模型密钥加载失败，已回退到环境变量。", error);
  }

  const app = createApp();
  const port = Number(process.env.PORT ?? 3000);

  app.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
  });
}

if (require.main === module) {
  void bootstrap();
}
