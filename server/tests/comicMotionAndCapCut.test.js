// Hook better-sqlite3 to prevent native binary evaluation crash on Node v26
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "better-sqlite3") {
    const MockDb = function () {
      this.pragma = (val) => {
        if (val === "journal_mode") return "wal";
        return "wal";
      };
      this.prepare = () => ({ run: () => {} });
      this.close = () => {};
    };
    return MockDb;
  }
  return originalRequire.apply(this, arguments);
};

const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { DramaExportService } = require("../dist/services/drama/DramaExportService.js");
const { ComicMotionService } = require("../dist/services/comic/ComicMotionService.js");

test("DramaExportService - jianying format export maps microsecond timings and tracks correctly", async () => {
  const exportService = new DramaExportService();

  // Mock prisma.dramaEpisode.findUnique
  prisma.dramaEpisode = {
    findUnique: async () => {
      return {
        id: "episode-123",
        projectId: "proj-456",
        order: 2,
        title: "Test Episode",
        durationSec: 10,
        content: "林平：放肆！\n苏清：你才是。",
        project: {
          title: "My Short Drama",
        },
        videoPrompts: [
          {
            shotId: "shot-1",
            status: "done",
            resultUrl: "http://example.com/video1.mp4",
            provider: "luma",
            version: 1,
            providerTaskId: "task-1",
          },
        ],
        storyboards: [
          {
            shots: [
              {
                id: "shot-1",
                order: 1,
                durationSec: 5,
                dialogue: "林平：放肆！",
                dialogueAudioData: JSON.stringify({
                  status: "done",
                  items: [
                    {
                      lineIndex: 0,
                      speaker: "林平",
                      text: "放肆！",
                      audioUrl: "http://example.com/audio1.mp3",
                      durationSec: 2,
                    },
                  ],
                }),
                keyframeData: JSON.stringify({
                  status: "done",
                  url: "http://example.com/poster1.jpg",
                }),
                shotSize: "close_up",
                cameraMove: "push_in",
                location: "hall",
                action: "林平怒视",
                characterRefs: "[]",
                visualPrompt: "man angry",
              },
            ],
          },
        ],
      };
    },
  };

  const data = await exportService.exportEpisode("proj-456", 2, "jianying");

  assert.equal(data.contentType, "application/json; charset=utf-8");
  assert.match(data.filename, /jianying-draft\.json$/);

  const draft = JSON.parse(data.body);

  // Assert draft settings
  assert.equal(draft.fps, 30.0);
  assert.equal(draft.width, 1080);
  assert.equal(draft.height, 1920);

  // Assert microsecond timing duration (5 seconds total for the shot)
  assert.equal(draft.duration, 5000000);

  // Assert tracks and segments
  assert.equal(draft.tracks.length, 3);
  
  // Video track segment assertions
  const videoTrack = draft.tracks.find((t) => t.type === "video");
  assert.ok(videoTrack);
  assert.equal(videoTrack.segments.length, 1);
  assert.equal(videoTrack.segments[0].material_id, "mat_video_shot-1");
  assert.equal(videoTrack.segments[0].source_timerange.duration, 5000000);
  assert.equal(videoTrack.segments[0].target_timerange.start, 0);

  // Audio track segment assertions
  const audioTrack = draft.tracks.find((t) => t.type === "audio");
  assert.ok(audioTrack);
  assert.equal(audioTrack.segments.length, 1);
  assert.equal(audioTrack.segments[0].material_id, "mat_audio_shot-1_0");
  assert.equal(audioTrack.segments[0].source_timerange.duration, 2000000);

  // Subtitle track assertions
  const textTrack = draft.tracks.find((t) => t.type === "text");
  assert.ok(textTrack);
  assert.equal(textTrack.segments.length, 1);
  assert.equal(textTrack.segments[0].material_id, "mat_text_1");
});

test("ComicMotionService - generatePanelMotionData infers cameraMove from panelType and calculates dialogue-based duration", async () => {
  const motionService = new ComicMotionService();

  let updatedData = null;

  // Mock prisma.comicPanel
  prisma.comicPanel = {
    findUnique: async (args) => {
      if (args.where.id === "panel-close-up") {
        return {
          id: "panel-close-up",
          panelType: "close_up",
          dialogues: JSON.stringify([{ text: "一二三四五六七八九十" }]), // 10 chars -> 2.5s duration -> clamp to 3.0s min
          motionData: null,
        };
      }
      if (args.where.id === "panel-establishing") {
        return {
          id: "panel-establishing",
          panelType: "establishing",
          dialogues: JSON.stringify([{ text: "这句台词非常非常非常长，应该会计算出更长的时长以供TTS播报。" }]), // 30 chars -> 7.5s duration
          motionData: null,
        };
      }
      return null;
    },
    update: async (args) => {
      updatedData = args.data;
      return { id: args.where.id, ...args.data };
    },
  };

  // Test 1: Close up panel gets "push_in" cameraMove and clamp to 3.0s min duration
  const motion1 = await motionService.generatePanelMotionData("panel-close-up", true);
  assert.equal(motion1.cameraMove, "push_in");
  assert.equal(motion1.durationSec, 3.0);
  assert.deepEqual(JSON.parse(updatedData.motionData), { cameraMove: "push_in", durationSec: 3.0 });

  // Test 2: Establishing panel gets "pan_right" cameraMove and ~7.8s duration
  const motion2 = await motionService.generatePanelMotionData("panel-establishing", true);
  assert.equal(motion2.cameraMove, "pan_right");
  assert.equal(motion2.durationSec, 7.8);
  assert.deepEqual(JSON.parse(updatedData.motionData), { cameraMove: "pan_right", durationSec: 7.8 });
});
