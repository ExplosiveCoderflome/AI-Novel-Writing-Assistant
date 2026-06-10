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
        voiceProfile: null,
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
  };

  const prisma = {
    $transaction: async (callback) => callback(tx),
    dramaProject: {
      findUnique: async () => buildProject(),
    },
    dramaEpisode: {
      update: tx.dramaEpisode.update,
      findUnique: async ({ where }) => {
        if (where.projectId_order.projectId !== "project_1" || where.projectId_order.order !== state.episode.order) {
          return null;
        }
        return {
          ...state.episode,
          project: { title: "逆袭短剧" },
          storyboards: state.storyboards.map((storyboard) => ({
            ...storyboard,
            shots: state.shots.filter((shot) => shot.storyboardId === storyboard.id),
          })),
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
      create: async ({ data }) => {
        const created = { id: `video_prompt_${state.videoPrompts.length + 1}`, createdAt: new Date("2026-06-09T00:00:00.000Z"), ...data };
        state.videoPrompts.push(created);
        return created;
      },
      findUnique: async ({ where }) => state.videoPrompts.find((prompt) => prompt.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const prompt = state.videoPrompts.find((item) => item.id === where.id);
        Object.assign(prompt, data);
        return prompt;
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
                dialogue: "保安：你也配进去？",
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
  clearDramaModules();
  const state = installPipelineStubs();
  const { DramaScriptService } = require("../dist/services/drama/DramaScriptService.js");
  const { DramaQualityGate } = require("../dist/services/drama/DramaQualityGate.js");
  const { DramaRepairService } = require("../dist/services/drama/DramaRepairService.js");
  const { DramaStoryboardService } = require("../dist/services/drama/DramaStoryboardService.js");
  const { DramaVideoPromptService } = require("../dist/services/drama/DramaVideoPromptService.js");

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

  const { DramaShotKeyframeService } = require("../dist/services/drama/visual/DramaShotKeyframeService.js");
  const keyframe = await new DramaShotKeyframeService().generateKeyframe(storyboard.shots[0].id, "openai");
  assert.equal(keyframe.status, "done");
  assert.equal(keyframe.url, "/api/drama/shot-images/shot_1/keyframe");
  assert.equal(state.keyframeInput.sceneType, "chapter_illustration");
  assert.equal(state.keyframeInput.size, "1024x1536");
  assert.match(state.shots[0].keyframeData, /shot-images/);

  const videoService = new DramaVideoPromptService();
  const prompt = await videoService.generateVideoPromptForShot("project_1", storyboard.shots[0].id);
  assert.equal(prompt.aspectRatio, "9:16");
  assert.match(prompt.prompt, /vertical drama/);

  const task = await videoService.createProviderTask(prompt.id, "mock");
  assert.equal(task.provider, "mock");
  assert.match(task.providerTaskId, /^mock_/);
  assert.equal(task.status, "queued");
  assert.equal(task.resultUrl, null);
  assert.equal(task.failureReason, null);
  assert.match(task.providerResult, /providerTaskId/);
  assert.deepEqual(JSON.parse(task.providerResult).raw.refImages, [
    "/api/drama/shot-images/shot_1/keyframe",
    "/api/drama/character-images/character_1/character-sheet",
  ]);

  const { DramaExportService } = require("../dist/services/drama/DramaExportService.js");
  const srt = await new DramaExportService().exportEpisode("project_1", 1, "srt");
  assert.equal(srt.contentType, "application/x-subrip; charset=utf-8");
  assert.equal(srt.filename, "逆袭短剧-E1.srt");
  assert.match(srt.body, /00:00:00,000 --> 00:00:05,000/);
  assert.match(srt.body, /保安：你也配进去？/);
});
