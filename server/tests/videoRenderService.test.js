const test = require("node:test");
const assert = require("node:assert/strict");
const { VideoProjectService } = require("../dist/services/video/VideoProjectService.js");
const { VideoRenderService } = require("../dist/services/video/VideoRenderService.js");
const { prisma } = require("../dist/db/prisma.js");

test("VellumReel Offline Video Rendering Services", async (t) => {
  const projectService = new VideoProjectService();
  const renderService = new VideoRenderService();

  const novelId = `test-novel-video-${Date.now()}`;
  let projectId = "";

  t.before(async () => {
    // Create a mock Novel and Chapter in Prisma
    await prisma.novel.create({
      data: {
        id: novelId,
        title: "Test Novel for Video",
        description: "A novel about test cases.",
      },
    });

    await prisma.chapter.create({
      data: {
        id: `chapter-video-1-${Date.now()}`,
        novelId: novelId,
        title: "Chapter 1: The Code",
        content: "Once upon a time, tests were missing.",
        order: 1,
      },
    });
  });

  t.after(async () => {
    // Cleanup DB records
    if (projectId) {
      await prisma.videoProject.deleteMany({ where: { id: projectId } });
    }
    await prisma.chapter.deleteMany({ where: { novelId } });
    await prisma.novel.deleteMany({ where: { id: novelId } });
  });

  await t.test("VideoProjectService CRUD and source content lookup", async () => {
    // 1. Create Project
    const project = await projectService.createProject({
      title: "Test Video Adapt",
      novelId,
      chapterIds: [],
      sourceType: "chapter_adaptation",
      pipeline: "NarrativeVideo",
      config: { mode: "final" },
    });

    assert.ok(project.id);
    projectId = project.id;
    assert.equal(project.title, "Test Video Adapt");
    assert.equal(project.novelId, novelId);

    // 2. Get Project
    const fetched = await projectService.getProject(projectId);
    assert.equal(fetched.title, "Test Video Adapt");

    // 3. List Projects
    const list = await projectService.listProjects(novelId);
    assert.ok(list.length >= 1);
    assert.ok(list.some(p => p.id === projectId));

    // 4. Update Project
    const updated = await projectService.updateProject(projectId, {
      status: "rendering",
      resultUrl: "http://renders/video.mp4",
    });
    assert.equal(updated.status, "rendering");
    assert.equal(updated.resultUrl, "http://renders/video.mp4");

    // 5. Get source content
    const sourceContent = await projectService.getProjectSourceContent(projectId);
    assert.ok(sourceContent.chapters);
    assert.ok(sourceContent.chapters.length >= 1);
    assert.equal(sourceContent.chapters[0].title, "Chapter 1: The Code");
  });

  await t.test("VideoRenderService bridge health and pipeline recommendation", async () => {
    // 1. Check bridge health (should run without throwing, environment output should exist)
    const health = await renderService.checkBridgeHealth();
    assert.ok(health.reachable);
    assert.ok(health.status);
    
    // 2. Recommend pipeline
    const rec = await renderService.recommendPipeline("novel");
    assert.equal(rec.pipeline, "NarrativeVideo");
    assert.ok(rec.reason);
  });

  await t.test("VideoRenderService submitRender validations", async () => {
    // 1. Project does not exist
    await assert.rejects(
      renderService.submitRender("non-existent-project"),
      /视频项目不存在/
    );

    // 2. Project script not generated yet
    const projectWithoutScript = await projectService.createProject({
      title: "No Script Project",
      novelId,
    });

    await assert.rejects(
      renderService.submitRender(projectWithoutScript.id),
      /视频脚本尚未生成/
    );

    // Cleanup
    await projectService.deleteProject(projectWithoutScript.id);
  });
});
