/**
 * OpenMontage Bridge HTTP 客户端
 *
 * 封装 GeneralAgent 后端与 OpenMontage Bridge (Python FastAPI) 之间的通信。
 * Bridge 服务位于 tools/openmontage-bridge/server.py。
 * 低耦合：本文件不 import 任何 novel/drama/comic 业务逻辑。
 */

interface BridgeHealthResponse {
  status: string;
  openmontage_root: string;
  tools_available: boolean;
  tool_count: number;
}

interface BridgeToolsResponse {
  status: string;
  summary: Record<string, unknown>;
  tool_names: string[];
  error?: string;
}

interface PipelineRecommendation {
  pipeline: string;
  reason: string;
  estimated_cost_usd: number;
  alternatives: string[];
}

interface BridgePipelineProposalResponse {
  status: string;
  recommendation: PipelineRecommendation;
}

interface BridgeScenePlan {
  meta: {
    source: string;
    target_duration_sec: number;
    visual_style: string;
  };
  synopsis: string;
  characters: string[];
  world_notes: string;
  source_text: string;
}

interface BridgeRenderSubmitResponse {
  status: string;
  task_id: string;
  render_status: string;
}

interface BridgeRenderStatusResponse {
  task_id: string;
  status: string;
  progress: number;
  output_path: string | null;
  error: string | null;
  cost_usd: number;
}

export interface CharacterInput {
  name: string;
  persona?: string;
  visualHint?: string;
  relations?: string;
}

export class OpenMontageBridgeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl = "http://localhost:8100", timeoutMs = 30_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  // ── 内部 HTTP 工具 ──────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Bridge 请求失败 [${response.status}]: ${text || response.statusText}`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Bridge 请求超时 (${this.timeoutMs}ms): ${method} ${path}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── 公开 API ────────────────────────────────────────────

  /** 健康检查 */
  async health(): Promise<BridgeHealthResponse> {
    return this.request<BridgeHealthResponse>("GET", "/health");
  }

  /** 是否可达 */
  async isReachable(): Promise<boolean> {
    try {
      const res = await this.health();
      return res.status === "ok";
    } catch {
      return false;
    }
  }

  /** 列出可用工具 */
  async listTools(): Promise<BridgeToolsResponse> {
    return this.request<BridgeToolsResponse>("GET", "/tools");
  }

  /** 推荐 pipeline */
  async proposePipeline(
    contentType: string,
    hasNarration = true,
    visualStyle = "cinematic",
  ): Promise<PipelineRecommendation> {
    const res = await this.request<BridgePipelineProposalResponse>(
      "POST",
      "/pipeline/propose",
      {
        content_type: contentType,
        has_narration: hasNarration,
        visual_style: visualStyle,
      },
    );
    return res.recommendation;
  }

  /** 生成 scene plan（格式转换，非 AI 生成） */
  async generateScenePlan(input: {
    synopsis: string;
    characters: CharacterInput[];
    chapterText?: string;
    worldNotes?: string;
    targetDurationSec?: number;
    visualStyle?: string;
  }): Promise<BridgeScenePlan> {
    const res = await this.request<{ status: string; scene_plan: BridgeScenePlan }>(
      "POST",
      "/script/generate",
      {
        synopsis: input.synopsis,
        characters: input.characters,
        chapter_text: input.chapterText,
        world_notes: input.worldNotes,
        target_duration_sec: input.targetDurationSec ?? 60,
        visual_style: input.visualStyle ?? "cinematic",
      },
    );
    return res.scene_plan;
  }

  /** 提交渲染任务 */
  async submitRender(input: {
    projectTitle: string;
    pipeline: string;
    scenePlan: Record<string, unknown>;
    config?: Record<string, unknown>;
  }): Promise<{ taskId: string; status: string }> {
    const res = await this.request<BridgeRenderSubmitResponse>(
      "POST",
      "/render",
      {
        project_title: input.projectTitle,
        pipeline: input.pipeline,
        scene_plan: input.scenePlan,
        config: input.config ?? {
          resolution: "1920x1080",
          fps: 30,
          codec: "h264",
        },
      },
    );
    return { taskId: res.task_id, status: res.render_status };
  }

  /** 查询渲染状态 */
  async getRenderStatus(taskId: string): Promise<BridgeRenderStatusResponse> {
    return this.request<BridgeRenderStatusResponse>(
      "GET",
      `/render/${encodeURIComponent(taskId)}/status`,
    );
  }

  /** 获取渲染结果 */
  async getRenderResult(
    taskId: string,
  ): Promise<{ outputPath: string | null; costUsd: number }> {
    const res = await this.request<BridgeRenderStatusResponse>(
      "GET",
      `/render/${encodeURIComponent(taskId)}/result`,
    );
    return { outputPath: res.output_path, costUsd: res.cost_usd };
  }
}

/** 全局单例（地址从环境变量/设置中读取） */
export const bridgeClient = new OpenMontageBridgeClient(
  process.env.OPENMONTAGE_BRIDGE_URL || "http://localhost:8100",
);
