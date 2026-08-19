import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db/prisma";
import { KnowledgeService } from "./services/knowledge/KnowledgeService";
import { WorldService } from "./services/world/WorldService";
import { getSharedNovelServices } from "./services/novel/application/sharedNovelServices";
import { DirectorCommandService } from "./services/novel/director/commands/DirectorCommandService";
import { videoProjectService } from "./services/video/VideoProjectService";
import { videoScriptService } from "./services/video/VideoScriptService";
import { videoRenderService } from "./services/video/VideoRenderService";

async function main() {
  console.log("=== STARTING RED CHAMBER AUTO WORKFLOW ===");

  // 1. Setup offline settings in database
  console.log("Setting up application settings for offline models and fallback TTS...");
  await prisma.appSetting.upsert({
    where: { key: "video.offlineMode" },
    update: { value: "true" },
    create: { key: "video.offlineMode", value: "true" }
  });
  await prisma.appSetting.upsert({
    where: { key: "video.ttsUrl" },
    update: { value: "http://127.0.0.1:8001/v1" },
    create: { key: "video.ttsUrl", value: "http://127.0.0.1:8001/v1" }
  });
  await prisma.appSetting.upsert({
    where: { key: "video.ollamaModel" },
    update: { value: "gemma4:e4b" },
    create: { key: "video.ollamaModel", value: "gemma4:e4b" }
  });

  // Setup LLM provider keys and routes in Prisma if they don't exist
  // We can setup default model routes to ensure everything goes to Ollama / gemma4:e4b
  const taskTypes = [
    "director_candidates",
    "director_volumes",
    "director_chapters",
    "director_refinement",
    "chapter_outline",
    "chapter_draft",
    "chapter_review",
    "chapter_repair",
    "style_extraction",
    "style_revision",
    "world_axioms",
    "world_draft",
    "world_refinement",
    "world_improve",
    "character_draft",
    "character_refinement",
    "title_generation",
    "video_script"
  ];
  for (const t of taskTypes) {
    await prisma.modelRouteConfig.upsert({
      where: { taskType: t },
      update: { provider: "ollama", model: "gemma4:e4b" },
      create: { taskType: t, provider: "ollama", model: "gemma4:e4b" }
    });
  }

  // 2. Upload Document
  const knowledgeService = new KnowledgeService();
  const filePath = "/Users/nvidia/Downloads/红楼梦.txt";
  console.log(`Checking document: ${filePath}...`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const fileName = path.basename(filePath);

  let doc = await prisma.knowledgeDocument.findFirst({
    where: { title: "红楼梦" }
  });
  if (!doc) {
    console.log(`Uploading ${fileName} to knowledge library...`);
    doc = await knowledgeService.createDocument({
      title: "红楼梦",
      fileName,
      content,
    });
    console.log(`Knowledge document uploaded successfully. ID: ${doc.id}`);
  } else {
    console.log(`Found existing knowledge document. ID: ${doc.id}`);
  }

  // Wait for indexing to complete
  console.log("Waiting for RAG index job to complete...");
  let indexed = false;
  for (let i = 0; i < 30; i++) {
    const job = await prisma.ragIndexJob.findFirst({
      where: { ownerId: doc.id, ownerType: "knowledge_document" },
      orderBy: { createdAt: "desc" }
    });
    console.log(`Job status: ${job?.status || "unknown"}. Progress: ${(job as any)?.progress || 0}`);
    if (job?.status === "succeeded") {
      indexed = true;
      break;
    }
    if (job?.status === "failed") {
      throw new Error(`Indexing job failed: ${job.lastError}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  if (!indexed) {
    console.log("WARNING: Indexing is taking longer than expected. Continuing with workflow...");
  } else {
    console.log("RAG Indexing completed successfully.");
  }

  // 3. Create World
  const worldService = new WorldService();
  console.log("Creating World...");
  const world = await worldService.createWorld({
    name: "红楼梦大世界",
    description: "经典名著红楼梦的世界设定，包含贾史王薛四大家族的兴衰与仙缘故事。",
    worldType: "classical_chinese_novel",
    axioms: "1. 贾史王薛四大家族同气连枝。\n2. 神瑛侍者与绛珠仙草有泪尽夭亡之夙盟。\n3. 太虚幻境执掌红尘痴男怨女的命运。",
    knowledgeDocumentIds: [doc.id]
  });
  console.log(`World created. ID: ${world.id}`);

  // 4. Create Novel
  const novelService = getSharedNovelServices();
  console.log("Creating Novel...");
  const novel = await novelService.createNovel({
    title: "红楼梦之绛珠仙草新传",
    description: "基于《红楼梦》世界观的同人小说，讲述绛珠仙草在红尘中不同的人生选择。",
    worldId: world.id,
    writingMode: "original",
    projectMode: "auto_pipeline",
    estimatedChapterCount: 3,
    defaultChapterLength: 1500
  });
  console.log(`Novel created. ID: ${novel.id}`);

  // 5. Trigger Autopilot Writing via Auto-Director Takeover
  const commandService = new DirectorCommandService();
  console.log("Enqueuing Director Takeover command...");
  const takeoverResponse = await commandService.enqueueTakeoverCommand({
    novelId: novel.id,
    runMode: "full_book_autopilot",
    autoExecutionPlan: {
      mode: "book",
      autoReview: true,
      autoRepair: true
    },
    autoApproval: {
      enabled: true,
      approvalPointCodes: [
        "candidate_direction_confirmed",
        "character_setup_ready",
        "volume_strategy_ready",
        "structured_outline_ready"
      ]
    }
  });
  console.log(`Takeover command enqueued. Task ID: ${takeoverResponse.taskId}`);

  // Wait for the Director Task to finish
  console.log("Waiting for autopilot to write chapters... (this may take a few minutes)");
  let novelFinished = false;
  for (let i = 0; i < 60; i++) {
    const task = await prisma.novelWorkflowTask.findUnique({
      where: { id: takeoverResponse.taskId }
    });
    console.log(`Autopilot progress: ${task?.progress || 0}%, status: ${task?.status || "unknown"}, stage: ${task?.currentStage || "unknown"}, item: ${task?.currentItemLabel || "unknown"}`);
    if ((task?.status as string) === "completed" || (task?.status as string) === "succeeded") {
      novelFinished = true;
      break;
    }
    if (task?.status === "failed") {
      throw new Error(`Autopilot task failed: ${task.lastError}`);
    }
    await new Promise(r => setTimeout(r, 10000));
  }
  if (!novelFinished) {
    throw new Error("Autopilot execution timed out.");
  }
  console.log("AI Fanfiction novel written successfully!");

  // Get generated chapters
  const chapters = await prisma.chapter.findMany({
    where: { novelId: novel.id },
    orderBy: { order: "asc" }
  });
  console.log(`Generated ${chapters.length} chapters.`);
  if (chapters.length === 0) {
    throw new Error("No chapters were generated by autopilot.");
  }

  // 6. Create Video Project
  console.log("Creating video project...");
  const videoProj = await videoProjectService.createProject({
    title: "红楼梦绛珠新传预告片",
    novelId: novel.id,
    chapterIds: [chapters[0].id],
    sourceType: "trailer",
    pipeline: "NarrativeVideo"
  });
  console.log(`Video project created. ID: ${videoProj.id}`);

  // 7. Generate Video Script
  console.log("Generating video script...");
  const script = await videoScriptService.generateScript(videoProj.id, {
    visualStyle: "ink_wash_painting", // Classical Chinese ink wash style
    targetDurationSec: 30
  });
  console.log("Video script generated successfully.");

  // 8. Render Video
  console.log("Submitting video render task...");
  const renderRes = await videoRenderService.submitRender(videoProj.id);
  console.log(`Render task submitted. Task ID: ${renderRes.taskId}`);

  // Wait for rendering to complete
  console.log("Waiting for video rendering to finish...");
  let renderFinished = false;
  for (let i = 0; i < 30; i++) {
    const status = await videoRenderService.checkRenderStatus(videoProj.id);
    console.log(`Render status: ${status.status}, progress: ${status.progress * 100}%`);
    if (status.status === "completed") {
      renderFinished = true;
      console.log(`Video render complete! Output URL: ${status.output_path}`);
      break;
    }
    if (status.status === "failed") {
      throw new Error(`Video rendering failed: ${status.error}`);
    }
    await new Promise(r => setTimeout(r, 10000));
  }

  if (!renderFinished) {
    throw new Error("Video rendering timed out.");
  }

  console.log("=== WORKFLOW SUCCESSFULLY COMPLETED ===");
}

main().catch(error => {
  console.error("Workflow failed with error:", error);
  process.exit(1);
});
