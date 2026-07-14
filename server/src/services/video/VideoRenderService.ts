/**
 * 视频渲染服务
 *
 * 对接 OpenMontage Bridge，提交渲染任务并跟踪状态。
 */
import { bridgeClient } from "./OpenMontageBridgeClient";
import { videoProjectService } from "./VideoProjectService";

export class VideoRenderService {
  /**
   * 将已生成脚本的项目提交到 OpenMontage Bridge 渲染。
   */
  async submitRender(projectId: string) {
    const project = await videoProjectService.getProject(projectId);
    if (!project) {
      throw new Error(`视频项目不存在: ${projectId}`);
    }
    if (!project.scriptJson) {
      throw new Error("视频脚本尚未生成，请先生成脚本");
    }

    // 检查 Bridge 可达性
    const reachable = await bridgeClient.isReachable();
    if (!reachable) {
      throw new Error(
        "无法连接 OpenMontage Bridge 服务。请确认 Bridge 已启动 (python bridge/server.py)",
      );
    }

    const scriptData = JSON.parse(project.scriptJson);
    const config = project.configJson ? JSON.parse(project.configJson) : {};

    const result = await bridgeClient.submitRender({
      projectTitle: project.title,
      pipeline: project.pipeline ?? "animated-explainer",
      scenePlan: scriptData,
      config,
    });

    await videoProjectService.updateProject(projectId, {
      renderTaskId: result.taskId,
      status: "rendering",
    });

    return { taskId: result.taskId, status: result.status };
  }

  /**
   * 查询渲染状态并同步到数据库。
   */
  async checkRenderStatus(projectId: string) {
    const project = await videoProjectService.getProject(projectId);
    if (!project?.renderTaskId) {
      throw new Error("该项目尚未提交渲染任务");
    }

    const status = await bridgeClient.getRenderStatus(project.renderTaskId);

    // 同步状态到数据库
    const updates: Record<string, unknown> = {};
    if (status.status === "completed") {
      updates.status = "completed";
      updates.resultUrl = status.output_path;
      updates.actualCost = status.cost_usd;
    } else if (status.status === "failed") {
      updates.status = "failed";
      updates.errorMessage = status.error;
    }

    if (Object.keys(updates).length > 0) {
      await videoProjectService.updateProject(projectId, updates as Record<string, string>);
    }

    return status;
  }

  /**
   * 检查 Bridge 连通性和可用工具。
   */
  async checkBridgeHealth() {
    try {
      const health = await bridgeClient.health();
      const tools = await bridgeClient.listTools();
      return {
        reachable: true,
        ...health,
        toolsSummary: tools.summary,
        toolNames: tools.tool_names,
      };
    } catch (error) {
      return {
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 推荐 pipeline。
   */
  async recommendPipeline(contentType: string) {
    return bridgeClient.proposePipeline(contentType);
  }
}

export const videoRenderService = new VideoRenderService();
