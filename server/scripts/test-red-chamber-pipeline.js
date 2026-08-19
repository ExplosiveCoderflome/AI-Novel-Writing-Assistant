const { prisma } = require("../dist/db/prisma.js");
const { videoProjectService } = require("../dist/services/video/VideoProjectService.js");
const { VideoRenderService } = require("../dist/services/video/VideoRenderService.js");

async function main() {
  const projectId = "test-red-chamber-project";
  console.log("=== Starting Red Chamber VellumReel Video Generation Pipeline Test ===");

  // 1. Clean up existing test project
  await prisma.videoProject.deleteMany({
    where: { id: projectId }
  }).catch(() => {});
  
  // 2. Create mock script output
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
      },
      {
        order: 3,
        durationSec: 6,
        visualDescription: "贾宝玉身披红色大氅，光着头，合掌向远处贾政深鞠一躬，消逝在茫茫雪地中",
        narration: "落了片白茫茫大地真干净。",
        cameraDirection: "pull",
        transition: "dip",
        mood: "verdigris"
      }
    ]
  };

  // 3. Insert project into SQLite DB
  const project = await prisma.videoProject.create({
    data: {
      id: projectId,
      title: "红楼梦视频集成测试",
      sourceType: "custom",
      status: "idle",
      scriptJson: JSON.stringify(mockScript),
      configJson: JSON.stringify({ mode: "quick" }) // Use quick mode for faster render
    }
  });
  console.log(`Created video project in database. Project ID: ${project.id}`);

  // 4. Trigger video render pipeline
  const renderService = new VideoRenderService();
  console.log("Submitting render task to VellumReel...");
  
  try {
    await renderService.submitRender(projectId);
    
    // Poll status until complete or failed
    let maxAttempts = 60;
    while (maxAttempts > 0) {
      const statusData = await renderService.checkRenderStatus(projectId);
      console.log(`Current render status: ${statusData.status}, progress: ${statusData.progress || 0}%`);
      
      if (statusData.status === "completed") {
        console.log(`\n🎉 Success! Video generated successfully.`);
        console.log(`Output Video URL: ${statusData.resultUrl}`);
        break;
      }
      if (statusData.status === "failed") {
        throw new Error(`Video rendering failed: ${statusData.error}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      maxAttempts--;
    }
  } catch (err) {
    console.error("Pipeline render execution failed:", err);
    process.exit(1);
  }
}

main().catch(console.error);
