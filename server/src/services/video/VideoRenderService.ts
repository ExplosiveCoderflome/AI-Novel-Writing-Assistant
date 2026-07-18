import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { videoProjectService } from "./VideoProjectService";
import { adaptToVellumReelProject } from "./vellumReelAdapter";
import { generateLocalImage, generateLocalSpeech } from "./localModelConnectors";
import { prisma } from "../../db/prisma";

const execAsync = promisify(exec);

// Path helper to get GeneralAgent root directory
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const VELLUM_REEL_ROOT = path.join(PROJECT_ROOT, "tools", "vellum-reel");

// Global map to track active rendering child processes
const activeLocalRenders = new Map<string, { process: any; promise: Promise<any> }>();

export class VideoRenderService {
  /**
   * Checks if local Node, FFmpeg, and ffprobe are available.
   */
  async checkBridgeHealth() {
    try {
      const results = await Promise.all([
        execAsync("node -v").then(r => r.stdout.trim()).catch(() => null),
        execAsync("ffmpeg -version").then(r => r.stdout.split("\n")[0]).catch(() => null),
        execAsync("ffprobe -version").then(r => r.stdout.split("\n")[0]).catch(() => null),
      ]);

      const nodeVer = results[0];
      const ffmpegVer = results[1];
      const ffprobeVer = results[2];

      const fullyOfflineCapable = !!(nodeVer && ffmpegVer && ffprobeVer);

      return {
        reachable: true,
        status: "ok",
        tools_available: fullyOfflineCapable,
        openmontage_root: VELLUM_REEL_ROOT,
        tool_count: 5,
        environment: {
          node: nodeVer || "Not Found",
          ffmpeg: ffmpegVer || "Not Found",
          ffprobe: ffprobeVer || "Not Found",
        },
      };
    } catch (error) {
      return {
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Recommend pipelines
   */
  async recommendPipeline(contentType: string) {
    return {
      pipeline: "NarrativeVideo",
      reason: "本地 VellumReel 支持 9:16 小说及书籍叙事视频（NarrativeVideo）模式",
      estimated_cost_usd: 0.0,
      alternatives: ["BookVideo"],
    };
  }

  /**
   * Render a project locally using VellumReel.
   */
  async submitRender(projectId: string) {
    const project = await videoProjectService.getProject(projectId);
    if (!project) {
      throw new Error(`视频项目不存在: ${projectId}`);
    }
    if (!project.scriptJson) {
      throw new Error("视频脚本尚未生成，请先生成脚本");
    }

    const scriptData = JSON.parse(project.scriptJson);
    const config = project.configJson ? JSON.parse(project.configJson) : {};

    // Get offline settings
    const isOfflineModeSetting = await prisma.appSetting.findUnique({
      where: { key: "video.offlineMode" },
    });
    const isOffline = isOfflineModeSetting?.value === "true";

    console.log(`[VideoRenderService] Starting render for project: ${projectId}. Offline: ${isOffline}`);

    // Generate VellumReel structure
    const { project: vProject, captions } = adaptToVellumReelProject(scriptData, projectId);

    // Create the narratives subfolder
    const narrativeDir = path.join(VELLUM_REEL_ROOT, "narratives", projectId);
    await fs.mkdir(narrativeDir, { recursive: true });

    // Prepare voice assembly manifest
    const voiceSegments = vProject.scenes.map(scene => ({
      id: scene.id,
      audio: `assets/projects/${projectId}/audio/${scene.id}.mp3`,
      text: scriptData.scenes.find((s: any) => `shot_${s.order}` === scene.id)?.narration || "",
      image: scene.image,
    }));

    // Generate missing assets locally if offline
    console.log("[VideoRenderService] Verifying project assets...");
    for (const segment of voiceSegments) {
      const imagePath = path.join(VELLUM_REEL_ROOT, "public", segment.image);
      const audioPath = path.join(VELLUM_REEL_ROOT, "public", segment.audio);

      if (!existsSync(imagePath)) {
        console.log(`Generating missing image asset: ${segment.image}`);
        try {
          await generateLocalImage({
            prompt: scriptData.scenes.find((s: any) => `shot_${s.order}` === segment.id)?.visualDescription || segment.id,
            projectId,
            shotId: segment.id,
            rootDir: VELLUM_REEL_ROOT,
          });
        } catch (e) {
          console.error(`Failed to generate image offline for scene ${segment.id}:`, e);
        }
      }

      if (!existsSync(audioPath)) {
        console.log(`Generating missing audio asset: ${segment.audio}`);
        try {
          await generateLocalSpeech({
            text: segment.text,
            projectId,
            shotId: segment.id,
            rootDir: VELLUM_REEL_ROOT,
          });
        } catch (e) {
          console.error(`Failed to generate speech offline for scene ${segment.id}:`, e);
        }
      }
    }

    const voiceManifest = {
      voice: "af_bella",
      output: `assets/projects/${projectId}/audio/narration-assembled.mp3`,
      gapMs: 600,
      tailMs: 1500,
      segments: voiceSegments,
    };

    const manifestPath = path.join(narrativeDir, "narration-segments.json");
    await fs.writeFile(manifestPath, JSON.stringify(voiceManifest, null, 2), "utf-8");
    await fs.writeFile(path.join(narrativeDir, "project.json"), JSON.stringify(vProject, null, 2), "utf-8");
    await fs.writeFile(path.join(narrativeDir, "captions.json"), JSON.stringify(captions, null, 2), "utf-8");

    const mode = config.mode || "final";
    let command = `node scripts/assemble-narration.mjs --manifest=narratives/${projectId}/narration-segments.json --project=narratives/${projectId}/project.json --captions=narratives/${projectId}/captions.json`;

    // Force skip Whisper transcription alignment entirely to prevent ASR hallucinations on offline silence and rely on precise script subtitles synchronization.
    const isTtsOnline = false;

    command += ` && node scripts/render-narrative.mjs --narrative=narratives/${projectId} --mode=${mode}`;

    console.log(`[VideoRenderService] Running pipeline command in tools/vellum-reel: ${command}`);

    const renderProcess = exec(command, {
      cwd: VELLUM_REEL_ROOT,
      env: {
        ...process.env,
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`
      }
    });

    const renderPromise = new Promise<void>((resolve, reject) => {
      let outputLogs = "";

      renderProcess.stdout?.on("data", (data) => {
        outputLogs += data;
        console.log(`[VellumReel Render STDOUT]: ${data}`);
      });

      renderProcess.stderr?.on("data", (data) => {
        outputLogs += data;
        console.error(`[VellumReel Render STDERR]: ${data}`);
      });

      renderProcess.on("close", async (code) => {
        activeLocalRenders.delete(projectId);
        if (code === 0) {
          console.log(`[VellumReel Render] Finished successfully for project: ${projectId}`);
          const outputRelPath = `out/${projectId}/${mode === "final" ? "narrative-full.mp4" : "narrative-preview.mp4"}`;
          const absoluteVideoPath = path.join(VELLUM_REEL_ROOT, outputRelPath);

          // Copy final MP4 to server public assets for client accessibility
          const serverPublicRelPath = `assets/projects/${projectId}/renders/video.mp4`;
          const serverPublicAbsPath = path.join(PROJECT_ROOT, "server", "public", serverPublicRelPath);
          await fs.mkdir(path.dirname(serverPublicAbsPath), { recursive: true });
          
          if (existsSync(absoluteVideoPath)) {
            await fs.copyFile(absoluteVideoPath, serverPublicAbsPath);
            await videoProjectService.updateProject(projectId, {
              status: "completed",
              resultUrl: `http://localhost:${process.env.PORT || 4000}/${serverPublicRelPath}`,
            });
            resolve();
          } else {
            const errorMsg = "Render process completed, but the expected output MP4 file is missing.";
            await videoProjectService.updateProject(projectId, {
              status: "failed",
              errorMessage: errorMsg,
            });
            reject(new Error(errorMsg));
          }
        } else {
          console.error(`[VellumReel Render] Failed with exit code ${code} for project: ${projectId}`);
          await videoProjectService.updateProject(projectId, {
            status: "failed",
            errorMessage: `VellumReel compiler crashed with exit code ${code}.\nLogs:\n${outputLogs.slice(-1000)}`,
          });
          reject(new Error(`Render pipeline crashed with code ${code}`));
        }
      });
    });

    activeLocalRenders.set(projectId, {
      process: renderProcess,
      promise: renderPromise,
    });

    await videoProjectService.updateProject(projectId, {
      renderTaskId: `local-${projectId}-${Date.now()}`,
      status: "rendering",
    });

    return { taskId: `local-${projectId}`, status: "running" };
  }

  /**
   * Read render status directly from database state.
   */
  async checkRenderStatus(projectId: string) {
    const project = await videoProjectService.getProject(projectId);
    if (!project) {
      throw new Error(`视频项目不存在: ${projectId}`);
    }

    const isActive = activeLocalRenders.has(projectId);

    return {
      task_id: project.renderTaskId || `local-${projectId}`,
      status: project.status,
      progress: project.status === "completed" ? 1.0 : isActive ? 0.5 : 0.0,
      output_path: project.resultUrl,
      error: project.errorMessage,
      cost_usd: 0.0,
    };
  }
}

export const videoRenderService = new VideoRenderService();
