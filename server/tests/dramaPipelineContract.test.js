const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function clearDramaModules() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes("\\dist\\services\\drama\\")
      || key.includes("/dist/services/drama/")
      || key.includes("\\dist\\services\\image\\provider.js")
      || key.includes("/dist/services/image/provider.js")
      || key.includes("\\dist\\db\\prisma.js")
      || key.includes("/dist/db/prisma.js")
      || key.includes("\\dist\\prompting\\core\\promptRunner.js")
      || key.includes("/dist/prompting/core/promptRunner.js")
      || key.includes("\\dist\\runtime\\appPaths.js")
      || key.includes("/dist/runtime/appPaths.js")
    ) {
      delete require.cache[key];
    }
  }
}

function installPipelineStubs() {
  const state = {
    episode: {
      id: "episode_1",
      projectId: "project_1",
      order: 1,
      title: "身份反转",
      hookOpening: "保安被当众羞辱",
      hookType: "身份反差",
      cliffhanger: "董事长喊他少爷",
      emotionNet: 4,
      isPaywall: false,
      beatSheet: JSON.stringify({ conflict: "主角隐藏身份被羞辱" }),
      sourceMap: JSON.stringify({ beatRefs: [1] }),
      content: null,
      durationSec: null,
      status: "planned",
      qualityFlags: null,
    },
    facts: [{
      id: "fact_0",
      projectId: "project_1",
      episodeOrder: 0,
      category: "revealed",
      text: "主角真实身份是集团继承人",
      source: "auto",
      createdAt: new Date("2026-06-09T00:00:00.000Z"),
    }],
    storyboards: [],
    shots: [],
    videoPrompts: [],
    batchJobs: [],
    keyframeInput: null,
    generatedImagesRoot: fs.mkdtempSync(path.join(os.tmpdir(), "drama-keyframes-")),
  };

  function buildProject() {
    return {
      id: "project_1",
      title: "逆袭短剧",
      source: "text_import",
      sourceRef: null,
      sourceInput: "主角隐藏身份进入公司。",
      track: "hidden_identity",
      theme: "逆袭",
      targetEpisodes: 12,
      status: "outlined",
      strategy: JSON.stringify({ mainPleasureLine: "身份揭露带来的连续打脸" }),
      sourceBundle: {
        projectId: "project_1",
        synopsis: "隐藏继承人在底层被羞辱后逐步反击。",
        beats: JSON.stringify([{ order: 1, summary: "主角隐藏身份入职，被同事羞辱。" }]),
        worldNotes: "现代都市公司。",
        hardFacts: JSON.stringify([{ text: "主角真实身份是集团继承人", category: "revealed" }]),
        rawText: null,
      },
      characters: [{
        id: "character_1",
        projectId: "project_1",
        name: "林澈",
        archetype: "隐藏继承人",
        persona: "冷静克制，擅长反击",
        speechStyle: "短句，压迫感强",
        visualAnchor: JSON.stringify({ hint: "黑色西装，克制表情" }),
        voiceProfile: JSON.stringify({ voiceId: "lin-voice", emotion: "tense", speed: 1.05 }),
        relations: "与反派主管对立",
        portraitData: JSON.stringify({
          status: "done",
          url: "/api/drama/character-images/character_1/character-sheet",
        }),
        threeViewData: null,
        sourceCharacterRef: null,
        createdAt: new Date("2026-06-09T00:00:00.000Z"),
        updatedAt: new Date("2026-06-09T00:00:00.000Z"),
      }],
      facts: state.facts,
      episodes: [state.episode],
    };
  }

  const tx = {
    dramaEpisode: {
      update: async ({ data }) => {
        Object.assign(state.episode, data);
        return state.episode;
      },
    },
    dramaFact: {
      createMany: async ({ data }) => {
        for (const fact of data) {
          state.facts.push({
            id: `fact_${state.facts.length + 1}`,
            createdAt: new Date("2026-06-09T00:00:00.000Z"),
            ...fact,
          });
        }
        return { count: data.length };
      },
    },
    dramaStoryboard: {
      create: async ({ data }) => {
        const storyboard = { id: "storyboard_1", createdAt: new Date("2026-06-09T00:00:00.000Z"), ...data };
        state.storyboards.push(storyboard);
        return storyboard;
      },
      findUnique: async ({ where }) => {
        const storyboard = state.storyboards.find((item) => item.id === where.id);
        return storyboard ? { ...storyboard, shots: state.shots.filter((shot) => shot.storyboardId === storyboard.id) } : null;
      },
    },
    dramaShot: {
      createMany: async ({ data }) => {
        data.forEach((shot, index) => {
          state.shots.push({ id: `shot_${index + 1}`, createdAt: new Date("2026-06-09T00:00:00.000Z"), ...shot });
        });
        return { count: data.length };
      },
      update: async ({ where, data }) => {
        const shot = state.shots.find((item) => item.id === where.id);
        Object.assign(shot, data);
        return shot;
      },
    },
    dramaVideoPrompt: {
      create: async ({ data }) => {
        const created = {
          id: `video_prompt_${state.videoPrompts.length + 1}`,
          createdAt: new Date("2026-06-09T00:00:00.000Z"),
          updatedAt: new Date("2026-06-09T00:00:00.000Z"),
          version: data.version ?? 1,
          supersededById: null,
          ...data,
        };
        state.videoPrompts.push(created);
        return created;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const prompt of state.videoPrompts) {
          if (where.projectId && prompt.projectId !== where.projectId) continue;
          if (where.episodeId && prompt.episodeId !== where.episodeId) continue;
          if (where.shotId && prompt.shotId !== where.shotId) continue;
          if (where.id?.not && prompt.id === where.id.not) continue;
          if (where.status?.not && prompt.status === where.status.not) continue;
          Object.assign(prompt, data, { updatedAt: new Date("2026-06-09T00:00:00.000Z") });
          count += 1;
        }
        return { count };
      },
    },
  };

  const prisma = {
    $transaction: async (callback) => callback(tx),
    dramaProject: {
      findUnique: async () => buildProject(),
    },
    dramaEpisode: {
      update: tx.dramaEpisode.update,
      findUnique: async ({ where }) => {
        const matchesComposite = where.projectId_order
          && where.projectId_order.projectId === "project_1"
          && where.projectId_order.order === state.episode.order;
        const matchesId = where.id === state.episode.id;
        if (!matchesComposite && !matchesId) {
          return null;
        }
        return {
          ...state.episode,
          project: { title: "逆袭短剧" },
          storyboards: state.storyboards.map((storyboard) => ({
            ...storyboard,
            shots: state.shots.filter((shot) => shot.storyboardId === storyboard.id),
          })),
          videoPrompts: [...state.videoPrompts].sort((left, right) =>
            (right.version ?? 1) - (left.version ?? 1)
            || right.createdAt.getTime() - left.createdAt.getTime()
          ),
        };
      },
    },
    dramaFact: {
      createMany: tx.dramaFact.createMany,
    },
    dramaCharacter: {
      findMany: async ({ where }) => buildProject().characters.filter((character) => character.projectId === where.projectId),
    },
    dramaShot: {
      findUnique: async ({ where }) => {
        const shot = state.shots.find((item) => item.id === where.id);
        if (!shot) return null;
        return {
          ...shot,
          storyboard: {
            ...state.storyboards.find((item) => item.id === shot.storyboardId),
            episode: state.episode,
            project: buildProject(),
          },
        };
      },
      update: tx.dramaShot.update,
    },
    dramaVideoPrompt: {
      create: tx.dramaVideoPrompt.create,
      findUnique: async ({ where }) => state.videoPrompts.find((prompt) => prompt.id === where.id) ?? null,
      findFirst: async ({ where }) => [...state.videoPrompts]
        .filter((prompt) =>
          (!where.projectId || prompt.projectId === where.projectId)
          && (!where.episodeId || prompt.episodeId === where.episodeId)
          && (!where.shotId || prompt.shotId === where.shotId)
          && (!where.status?.not || prompt.status !== where.status.not)
        )
        .sort((left, right) =>
          (right.version ?? 1) - (left.version ?? 1)
          || right.createdAt.getTime() - left.createdAt.getTime()
        )[0] ?? null,
      update: async ({ where, data }) => {
        const prompt = state.videoPrompts.find((item) => item.id === where.id);
        Object.assign(prompt, data);
        return prompt;
      },
      updateMany: tx.dramaVideoPrompt.updateMany,
    },
    dramaBatchJob: {
      create: async ({ data }) => {
        const created = {
          id: `batch_job_${state.batchJobs.length + 1}`,
          createdAt: new Date("2026-06-10T00:00:00.000Z"),
          updatedAt: new Date("2026-06-10T00:00:00.000Z"),
          ...data,
        };
        state.batchJobs.push(created);
        return created;
      },
      findUnique: async ({ where }) => state.batchJobs.find((job) => job.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const job = state.batchJobs.find((item) => item.id === where.id);
        Object.assign(job, data, { updatedAt: new Date("2026-06-10T00:00:00.000Z") });
        return job;
      },
    },
  };

  const promptRunnerPath = require.resolve("../dist/prompting/core/promptRunner.js");
  require.cache[promptRunnerPath] = {
    id: promptRunnerPath,
    filename: promptRunnerPath,
    loaded: true,
    exports: {
      runStructuredPrompt: async ({ asset }) => {
        if (asset.id === "drama.episode.script") {
          return {
            output: {
              content: "【场景】公司大厅\n林澈被拦下。\n林澈：让董事长下来见我。",
              durationSec: 72,
              sceneCount: 2,
              opening3s: "主角被保安拦下并被嘲讽",
              endingCliffhanger: "董事长称他为少爷",
              newlyIntroducedFacts: [{ text: "董事长认识林澈", category: "revealed" }],
              episodeSummary: "林澈隐藏身份进入公司，被羞辱后身份露出端倪。",
            },
          };
        }
        if (asset.id === "drama.episode.quality") {
          return {
            output: {
              status: "repairable",
              score: { hook: 82, density: 76, paywall: 70, emotion: 78, duration: 80, consistency: 88, overall: 79 },
              flags: [{
                severity: "medium",
                code: "weak_payoff",
                evidence: "结尾身份提示还不够强。",
                suggestion: "增强董事长出场反应。",
              }],
              repairPlan: { mode: "patch", instruction: "强化结尾打脸和董事长称呼。" },
            },
          };
        }
        if (asset.id === "drama.episode.compliance") {
          return {
            output: {
              level: "pass",
              items: [],
            },
          };
        }
        if (asset.id === "drama.episode.repair") {
          return {
            output: {
              content: "【场景】公司大厅\n林澈：让董事长下来。\n董事长冲出电梯：少爷，您终于来了。",
              durationSec: 68,
              sceneCount: 2,
              opening3s: "保安当众羞辱林澈",
              endingCliffhanger: "董事长跪迎少爷",
              newlyIntroducedFacts: [],
              episodeSummary: "林澈被羞辱后，董事长公开确认他的身份。",
            },
          };
        }
        if (asset.id === "drama.storyboard") {
          return {
            output: {
              summary: "大厅羞辱到董事长反转的竖屏镜头。",
              shots: [{
                order: 1,
                shotSize: "中近景",
                cameraMove: "轻微推进",
                durationSec: 5,
                location: "公司大厅",
                action: "林澈被保安拦住，周围员工围观。",
                dialogue: "林澈：让董事长下来。",
                characterRefs: ["林澈"],
                visualPrompt: "黑色西装青年在现代公司大厅被拦住。",
              }],
            },
          };
        }
        if (asset.id === "drama.video.prompt") {
          return {
            output: {
              prompt: "9:16 vertical drama, modern company lobby, restrained young man in black suit being blocked by security, tense close shot",
              negativePrompt: "low quality, blurry, extra fingers",
              aspectRatio: "9:16",
              durationSec: 5,
            },
          };
        }
        throw new Error(`Unexpected prompt asset: ${asset.id}`);
      },
    },
  };

  const prismaPath = require.resolve("../dist/db/prisma.js");
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma },
  };

  const imageProviderPath = require.resolve("../dist/services/image/provider.js");
  require.cache[imageProviderPath] = {
    id: imageProviderPath,
    filename: imageProviderPath,
    loaded: true,
    exports: {
      generateImagesByProvider: async (input) => {
        state.keyframeInput = input;
        return {
          provider: input.provider,
          model: input.model,
          images: [{
            url: "data:image/png;base64,iVBORw0KGgo=",
          }],
        };
      },
      isImageProviderSupported: () => true,
      resolveImageModel: async () => "gpt-image-test",
    },
  };

  const appPathsPath = require.resolve("../dist/runtime/appPaths.js");
  require.cache[appPathsPath] = {
    id: appPathsPath,
    filename: appPathsPath,
    loaded: true,
    exports: {
      resolveGeneratedImagesRoot: () => state.generatedImagesRoot,
    },
  };

  return state;
}

test("drama service pipeline keeps repairable quality issues before storyboard and video tasks", async () => {
  process.env.DRAMA_COST_CURRENCY = "CNY";
  process.env.DRAMA_IMAGE_COST_PER_IMAGE_OPENAI = "1.25";
  process.env.DRAMA_VIDEO_MOCK_COST_PER_SECOND = "0.4";
  process.env.DRAMA_TTS_MOCK_COST_PER_SECOND = "0.2";
  clearDramaModules();
  const state = installPipelineStubs();
  const { DramaScriptService } = require("../dist/services/drama/DramaScriptService.js");
  const { DramaQualityGate } = require("../dist/services/drama/DramaQualityGate.js");
  const { DramaRepairService } = require("../dist/services/drama/DramaRepairService.js");
  const { DramaStoryboardService } = require("../dist/services/drama/DramaStoryboardService.js");
  const { DramaBatchOrchestrator } = require("../dist/services/drama/production/DramaBatchOrchestrator.js");

  const script = await new DramaScriptService().generateEpisodeScript("project_1", 1);
  assert.match(script.content, /林澈/);
  assert.equal(state.episode.status, "scripted");
  assert.equal(state.episode.qualityFlags, null);
  assert.equal(state.facts.some((fact) => fact.text === "董事长认识林澈"), true);

  const quality = await new DramaQualityGate().reviewEpisode("project_1", 1);
  assert.equal(quality.status, "repairable");
  assert.equal(state.episode.status, "needs_repair");
  assert.match(state.episode.qualityFlags, /weak_payoff/);

  const repair = await new DramaRepairService().repairEpisode("project_1", 1);
  assert.match(repair.content, /少爷/);
  assert.equal(state.episode.status, "scripted");
  assert.equal(state.episode.qualityFlags, null);

  const storyboard = await new DramaStoryboardService().generateStoryboard("project_1", 1);
  assert.equal(storyboard.shots.length, 1);
  assert.equal(storyboard.shots[0].characterRefs, JSON.stringify(["林澈"]));

  const batchOrchestrator = new DramaBatchOrchestrator();
  const keyframeEstimate = await batchOrchestrator.estimateEpisodeBatchJob(
    "project_1",
    1,
    { type: "keyframes", provider: "openai" },
  );
  assert.equal(keyframeEstimate.cost.estimated, 1.25);
  assert.equal(keyframeEstimate.cost.estimatedUnits.images, 1);

  const keyframeJob = await batchOrchestrator.createEpisodeBatchJob(
    "project_1",
    1,
    { type: "keyframes", provider: "openai" },
    { autoStart: false },
  );
  const finishedKeyframes = await batchOrchestrator.runBatchJob(keyframeJob.id);
  const keyframeProgress = JSON.parse(finishedKeyframes.progress);
  assert.equal(finishedKeyframes.status, "done");
  assert.equal(keyframeProgress.total, 1);
  assert.equal(keyframeProgress.done, 1);
  assert.equal(keyframeProgress.cost.estimated, 1.25);
  assert.equal(keyframeProgress.cost.actual, 1.25);
  assert.equal(state.keyframeInput.sceneType, "chapter_illustration");
  assert.equal(state.keyframeInput.size, "1024x1536");
  assert.match(state.shots[0].keyframeData, /shot-images/);

  const videoEstimate = await batchOrchestrator.estimateEpisodeBatchJob(
    "project_1",
    1,
    { type: "videos", provider: "mock" },
  );
  assert.equal(videoEstimate.cost.estimated, 2);
  assert.equal(videoEstimate.cost.estimatedUnits.seconds, 5);

  const videoJob = await batchOrchestrator.createEpisodeBatchJob(
    "project_1",
    1,
    { type: "videos", provider: "mock" },
    { autoStart: false },
  );
  const finishedVideos = await batchOrchestrator.runBatchJob(videoJob.id);
  const videoProgress = JSON.parse(finishedVideos.progress);
  assert.equal(finishedVideos.status, "done");
  assert.equal(videoProgress.total, 1);
  assert.equal(videoProgress.done, 1);
  assert.equal(videoProgress.cost.estimated, 2);
  assert.equal(videoProgress.cost.actual, 2);

  const prompt = state.videoPrompts[0];
  assert.equal(prompt.aspectRatio, "9:16");
  assert.match(prompt.prompt, /vertical drama/);
  assert.equal(prompt.provider, "mock");
  assert.match(prompt.providerTaskId, /^mock_/);
  assert.equal(prompt.status, "queued");
  assert.equal(prompt.resultUrl, null);
  assert.equal(prompt.failureReason, null);
  assert.match(prompt.providerResult, /providerTaskId/);
  assert.deepEqual(JSON.parse(prompt.providerResult).raw.refImages, [
    "/api/drama/shot-images/shot_1/keyframe",
    "/api/drama/character-images/character_1/character-sheet",
  ]);

  const ttsJob = await batchOrchestrator.createEpisodeBatchJob(
    "project_1",
    1,
    { type: "tts", provider: "mock" },
    { autoStart: false },
  );
  const finishedTts = await batchOrchestrator.runBatchJob(ttsJob.id);
  const ttsProgress = JSON.parse(finishedTts.progress);
  assert.equal(finishedTts.status, "done");
  assert.equal(ttsProgress.total, 1);
  assert.equal(ttsProgress.done, 1);
  assert.equal(ttsProgress.cost.estimated, 1);
  assert.equal(ttsProgress.cost.actual, 0.4);
  assert.equal(ttsProgress.cost.actualUnits.seconds, 2);
  const audioData = JSON.parse(state.shots[0].dialogueAudioData);
  assert.equal(audioData.status, "done");
  assert.equal(audioData.items[0].speaker, "林澈");
  assert.equal(audioData.items[0].text, "让董事长下来。");
  assert.equal(audioData.items[0].voiceId, "lin-voice");
  assert.match(audioData.items[0].audioUrl, /^data:audio\/wav;base64,/);
  assert.equal(audioData.items[0].durationSec, 2);

  const { DramaExportService } = require("../dist/services/drama/DramaExportService.js");
  const srt = await new DramaExportService().exportEpisode("project_1", 1, "srt");
  assert.equal(srt.contentType, "application/x-subrip; charset=utf-8");
  assert.equal(srt.filename, "逆袭短剧-E1.srt");
  assert.match(srt.body, /00:00:00,000 --> 00:00:02,000/);
  assert.match(srt.body, /林澈：让董事长下来。/);

  const timeline = await new DramaExportService().exportEpisode("project_1", 1, "timeline-json");
  assert.equal(timeline.contentType, "application/json; charset=utf-8");
  assert.equal(timeline.filename, "逆袭短剧-E1-timeline.json");
  const timelineBody = JSON.parse(timeline.body);
  assert.equal(timelineBody.format, "ai-novel.drama.timeline.v1");
  assert.equal(timelineBody.episode.order, 1);
  assert.equal(timelineBody.tracks.video[0].shotOrder, 1);
  assert.equal(timelineBody.tracks.video[0].status, "queued");
  assert.equal(timelineBody.tracks.video[0].providerTaskId, prompt.providerTaskId);
  assert.equal(timelineBody.tracks.video[0].version, 1);
  assert.equal(timelineBody.tracks.video[0].posterUrl, "/api/drama/shot-images/shot_1/keyframe");
  assert.equal(timelineBody.tracks.audio[0].voiceId, "lin-voice");
  assert.match(timelineBody.tracks.audio[0].audioUrl, /^data:audio\/wav;base64,/);
  assert.equal(timelineBody.tracks.subtitles[0].endSec, 2);
  assert.match(timelineBody.warnings[0], /镜头 1/);

  const { DramaVideoPromptService } = require("../dist/services/drama/DramaVideoPromptService.js");
  const videoPromptService = new DramaVideoPromptService();
  const regeneratedPrompt = await videoPromptService.generateVideoPromptForShot("project_1", "shot_1");
  assert.equal(regeneratedPrompt.version, 2);
  assert.equal(regeneratedPrompt.status, "prompted");
  assert.equal(prompt.status, "superseded");
  assert.equal(prompt.supersededById, regeneratedPrompt.id);
  await assert.rejects(
    () => videoPromptService.createProviderTask(prompt.id, "mock"),
    /已有新版/,
  );

  const { DramaShotKeyframeService } = require("../dist/services/drama/visual/DramaShotKeyframeService.js");
  const keyframeData = await new DramaShotKeyframeService().generateKeyframe("shot_1", "openai");
  assert.equal(keyframeData.version, 2);
  assert.equal(keyframeData.history.length, 1);
  assert.equal(keyframeData.history[0].version, 1);
  assert.equal(keyframeData.history[0].url, "/api/drama/shot-images/shot_1/keyframe/v1");
  assert.equal(fs.existsSync(path.join(state.generatedImagesRoot, "drama-shots", "shot_1", "keyframe.v1.png")), true);
});
