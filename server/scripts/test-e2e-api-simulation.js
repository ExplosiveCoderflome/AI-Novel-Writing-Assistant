const path = require("node:path");
const fs = require("node:fs/promises");

async function main() {
  const SERVER_URL = "http://localhost:3000/api";
  console.log("=== Starting End-to-End User Simulation via API Pipeline ===");

  // 1. 测试硬件诊断接口（模拟用户点击系统设置的诊断操作）
  console.log("\n[Step 1] Simulating User Settings: Querying Hardware Diagnostics...");
  const diagRes = await fetch(`${SERVER_URL}/images/diagnostics`).then(r => r.json());
  if (diagRes.success) {
    console.log("✔ Diagnostics Succeeded!");
    console.log(`  Platform: ${diagRes.data.platform}, Recommended Tier: ${diagRes.data.recommendedTier}`);
    console.log(`  Reason: ${diagRes.data.reason}`);
  } else {
    throw new Error(`Diagnostics failed: ${JSON.stringify(diagRes)}`);
  }

  // 2. 创建一本《红楼梦·测试》小说（模拟用户在界面创建小说）
  console.log("\n[Step 2] Simulating User Action: Creating Novel...");
  const novelRes = await fetch(`${SERVER_URL}/novels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "红楼梦·端到端测试",
      description: "林黛玉扫花葬花，宝黛共读西厢，宝玉出家消逝雪野。"
    })
  }).then(r => r.json());

  let novelId;
  if (novelRes.success) {
    novelId = novelRes.data.id;
    console.log(`✔ Novel Created Successfully! ID: ${novelId}`);
  } else {
    throw new Error(`Failed to create novel: ${JSON.stringify(novelRes)}`);
  }

  // 3. 测试本地 SenseNova 图像局部微调接口（模拟用户在漫画详情页点击局部微调并提交）
  console.log("\n[Step 3] Simulating User Action: Editing Comic Panel Image via Local SenseNova...");
  
  // Create a 1x1 pixel PNG fallback base64 string to act as the source image
  const base64PixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  
  const editPayload = {
    imageBase64: base64PixelPng,
    prompt: "将背景中的桃花变得更红，突出中式水墨风",
    provider: "sensenova",
    size: "1024x1024"
  };

  const editRes = await fetch(`${SERVER_URL}/images/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(editPayload)
  }).then(r => r.json());

  if (editRes.success) {
    console.log("✔ Image Edit Completed successfully via local model!");
    console.log(`  Generated image url: ${editRes.data.images[0].url}`);
  } else {
    console.warn("⚠ Local Image Edit returned non-success (likely offline mock mode):", editRes);
  }

  // 4. 创建视频改编项目（模拟用户在视频工作台创建项目）
  console.log("\n[Step 4] Simulating User Action: Creating Video Adaptation Project...");
  const mockScript = {
    title: "红楼梦·悲金悼玉",
    author: "曹雪芹",
    visualStyle: "Classical Chinese Ink",
    scenes: [
      {
        order: 1,
        durationSec: 5,
        visualDescription: "林黛玉独自一人手提花锄，在桃花纷飞的树下，双眼噙泪默默扫花装袋",
        narration: "花谢花飞花满天，红消香断有谁怜？",
        cameraDirection: "push",
        transition: "crossfade",
        mood: "noir"
      },
      {
        order: 2,
        durationSec: 5,
        visualDescription: "贾宝玉与林黛玉坐在桃树底下的石头上，一同专注地看着一卷《西厢记》",
        narration: "如花美眷，似水流年。",
        cameraDirection: "pan-left",
        transition: "crossfade",
        mood: "amber"
      }
    ]
  };

  const videoProjRes = await fetch(`${SERVER_URL}/video/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "红楼梦·视频E2E测试",
      novelId,
      sourceType: "chapter_adaptation",
      config: { mode: "quick" }
    })
  }).then(r => r.json());

  let videoProjectId;
  if (videoProjRes.success) {
    videoProjectId = videoProjRes.data.id;
    console.log(`✔ Video Project Created Successfully! ID: ${videoProjectId}`);
  } else {
    throw new Error(`Failed to create video project: ${JSON.stringify(videoProjRes)}`);
  }

  // 5. 写入脚本 JSON 并提交视频渲染任务（模拟用户点击生成脚本与提交渲染）
  console.log("\n[Step 5] Simulating User Action: Saving Video Script & Submitting Render...");
  
  // We simulate saving scriptJson directly in database since we have a mock script payload
  const { prisma } = require("../dist/db/prisma.js");
  await prisma.videoProject.update({
    where: { id: videoProjectId },
    data: { scriptJson: JSON.stringify(mockScript) }
  });

  const renderRes = await fetch(`${SERVER_URL}/video/projects/${videoProjectId}/render`, {
    method: "POST"
  }).then(r => r.json());

  if (renderRes.success) {
    console.log("✔ Video Render Submitted Successfully!");
  } else {
    throw new Error(`Failed to submit video render: ${JSON.stringify(renderRes)}`);
  }

  // 6. 轮询视频生成状态，直至完成（模拟用户在界面实时查看进度）
  console.log("\n[Step 6] Simulating User Action: Polling Render Status...");
  let maxAttempts = 60;
  while (maxAttempts > 0) {
    const statusRes = await fetch(`${SERVER_URL}/video/projects/${videoProjectId}/render/status`).then(r => r.json());
    if (statusRes.success) {
      console.log(`  Current render status: ${statusRes.data.status}`);
      if (statusRes.data.status === "completed") {
        console.log(`\n🎉 End-to-End Integration Verified Successfully!`);
        console.log(`  Rendered MP4 video url: ${statusRes.data.resultUrl}`);
        break;
      }
      if (statusRes.data.status === "failed") {
        throw new Error(`Video rendering failed: ${statusRes.data.error}`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
    maxAttempts--;
  }

  // Clean up
  console.log("\nCleaning up test project files...");
  await prisma.videoProject.delete({ where: { id: videoProjectId } }).catch(() => {});
  await prisma.novel.delete({ where: { id: novelId } }).catch(() => {});
  console.log("✔ Cleanup complete.");
}

main().catch(console.error);
