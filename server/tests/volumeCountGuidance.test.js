const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildHardPlannedVolumeRange,
  buildVolumeCountGuidance,
  MAX_VOLUME_COUNT,
} = require("../../shared/dist/types/volumePlanning.js");

test("volume count guidance derives sane ranges for short, medium, and long projects", () => {
  const shortProject = buildVolumeCountGuidance({ chapterBudget: 20 });
  assert.deepEqual(shortProject.allowedVolumeCountRange, { min: 1, max: 1 });
  assert.equal(shortProject.systemRecommendedVolumeCount, 1);
  assert.equal(shortProject.recommendedVolumeCount, 1);
  assert.deepEqual(shortProject.hardPlannedVolumeRange, { min: 1, max: 1 });

  const mediumProject = buildVolumeCountGuidance({ chapterBudget: 60 });
  assert.deepEqual(mediumProject.allowedVolumeCountRange, { min: 1, max: 2 });
  assert.equal(mediumProject.systemRecommendedVolumeCount, 1);
  assert.equal(mediumProject.recommendedVolumeCount, 1);

  const longProject = buildVolumeCountGuidance({ chapterBudget: 120 });
  assert.deepEqual(longProject.allowedVolumeCountRange, { min: 2, max: 3 });
  assert.equal(longProject.systemRecommendedVolumeCount, 2);
  assert.equal(longProject.recommendedVolumeCount, 2);

  const ultraLongProject = buildVolumeCountGuidance({ chapterBudget: 500 });
  assert.deepEqual(ultraLongProject.allowedVolumeCountRange, { min: 8, max: 13 });
  assert.equal(ultraLongProject.systemRecommendedVolumeCount, 9);
  assert.equal(ultraLongProject.recommendedVolumeCount, 9);
  assert.notEqual(ultraLongProject.recommendedVolumeCount, 4);
  assert.deepEqual(ultraLongProject.hardPlannedVolumeRange, { min: 2, max: 4 });
});

test("volume count guidance respects preferred and existing counts while clamping to valid ranges", () => {
  const preferred = buildVolumeCountGuidance({
    chapterBudget: 120,
    userPreferredVolumeCount: 3,
  });
  assert.equal(preferred.userPreferredVolumeCount, 3);
  assert.equal(preferred.recommendedVolumeCount, 3);
  assert.deepEqual(preferred.hardPlannedVolumeRange, { min: 2, max: 3 });

  const respectedExisting = buildVolumeCountGuidance({
    chapterBudget: 120,
    existingVolumeCount: 5,
    respectExistingVolumeCount: true,
  });
  assert.equal(respectedExisting.respectedExistingVolumeCount, null);
  assert.equal(respectedExisting.recommendedVolumeCount, respectedExisting.systemRecommendedVolumeCount);

  const ignoredExisting = buildVolumeCountGuidance({
    chapterBudget: 120,
    existingVolumeCount: 3,
    respectExistingVolumeCount: false,
  });
  assert.equal(ignoredExisting.respectedExistingVolumeCount, null);
  assert.equal(ignoredExisting.recommendedVolumeCount, ignoredExisting.systemRecommendedVolumeCount);
});

test("volume count guidance ignores stale existing counts outside the valid chapter budget range", () => {
  const guidance = buildVolumeCountGuidance({
    chapterBudget: 430,
    existingVolumeCount: 4,
    respectExistingVolumeCount: true,
  });

  assert.deepEqual(guidance.allowedVolumeCountRange, { min: 7, max: 11 });
  assert.equal(guidance.systemRecommendedVolumeCount, 8);
  assert.equal(guidance.respectedExistingVolumeCount, null);
  assert.equal(guidance.recommendedVolumeCount, 8);
});

test("volume count guidance clamps huge budgets to the configured maximum", () => {
  const hugeProject = buildVolumeCountGuidance({
    chapterBudget: 5000,
    maxVolumeCount: MAX_VOLUME_COUNT,
  });

  assert.deepEqual(hugeProject.allowedVolumeCountRange, {
    min: MAX_VOLUME_COUNT,
    max: MAX_VOLUME_COUNT,
  });
  assert.equal(hugeProject.systemRecommendedVolumeCount, MAX_VOLUME_COUNT);
  assert.equal(hugeProject.recommendedVolumeCount, MAX_VOLUME_COUNT);
  assert.deepEqual(hugeProject.hardPlannedVolumeRange, { min: 2, max: 4 });
});

test("hard planned volume ranges stay constrained to early volumes", () => {
  assert.deepEqual(buildHardPlannedVolumeRange(1), { min: 1, max: 1 });
  assert.deepEqual(buildHardPlannedVolumeRange(2), { min: 2, max: 2 });
  assert.deepEqual(buildHardPlannedVolumeRange(3), { min: 2, max: 3 });
  assert.deepEqual(buildHardPlannedVolumeRange(4), { min: 2, max: 4 });
  assert.deepEqual(buildHardPlannedVolumeRange(9), { min: 2, max: 4 });
});
