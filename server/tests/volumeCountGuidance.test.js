const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildHardPlannedVolumeRange,
  buildVolumeCountGuidance,
  MAX_VOLUME_COUNT,
} = require("../../shared/dist/types/volumePlanning.js");

test("volume count guidance derives sane ranges for short, medium, and long projects", () => {
  const shortProject = buildVolumeCountGuidance({ chapterBudget: 20 });
  assert.deepEqual(shortProject.allowedVolumeCountRange, { min: 1, max: MAX_VOLUME_COUNT });
  assert.deepEqual(shortProject.decisionVolumeCountRange, { min: 1, max: 2 });
  assert.equal(shortProject.volumeScaleProfile, "short");
  assert.equal(shortProject.systemRecommendedVolumeCount, 1);
  assert.equal(shortProject.recommendedVolumeCount, 1);
  assert.deepEqual(shortProject.hardPlannedVolumeRange, { min: 1, max: 1 });

  const mediumProject = buildVolumeCountGuidance({ chapterBudget: 60 });
  assert.deepEqual(mediumProject.decisionVolumeCountRange, { min: 3, max: 4 });
  assert.equal(mediumProject.systemRecommendedVolumeCount, 3);
  assert.equal(mediumProject.recommendedVolumeCount, 3);

  const compactProject = buildVolumeCountGuidance({ chapterBudget: 80 });
  assert.deepEqual(compactProject.decisionVolumeCountRange, { min: 3, max: 4 });
  assert.equal(compactProject.systemRecommendedVolumeCount, 3);
  assert.equal(compactProject.recommendedVolumeCount, 3);

  const longProject = buildVolumeCountGuidance({ chapterBudget: 120 });
  assert.deepEqual(longProject.decisionVolumeCountRange, { min: 4, max: 6 });
  assert.equal(longProject.systemRecommendedVolumeCount, 4);
  assert.equal(longProject.recommendedVolumeCount, 4);

  const ultraLongProject = buildVolumeCountGuidance({ chapterBudget: 500 });
  assert.deepEqual(ultraLongProject.decisionVolumeCountRange, { min: 9, max: 14 });
  assert.equal(ultraLongProject.systemRecommendedVolumeCount, 9);
  assert.equal(ultraLongProject.recommendedVolumeCount, 9);
  assert.notEqual(ultraLongProject.recommendedVolumeCount, 4);
  assert.deepEqual(ultraLongProject.hardPlannedVolumeRange, { min: 3, max: 6 });

  const megaProject = buildVolumeCountGuidance({ chapterBudget: 1000 });
  assert.deepEqual(megaProject.decisionVolumeCountRange, { min: 14, max: 20 });
  assert.ok(megaProject.systemRecommendedVolumeCount > 16);

  const hugeProject = buildVolumeCountGuidance({ chapterBudget: 2000 });
  assert.deepEqual(hugeProject.decisionVolumeCountRange, { min: 18, max: MAX_VOLUME_COUNT });
  assert.equal(hugeProject.systemRecommendedVolumeCount, MAX_VOLUME_COUNT);
});

test("volume count guidance respects preferred and existing counts while clamping to valid ranges", () => {
  const preferred = buildVolumeCountGuidance({
    chapterBudget: 80,
    userPreferredVolumeCount: 2,
  });
  assert.equal(preferred.userPreferredVolumeCount, 2);
  assert.equal(preferred.recommendedVolumeCount, 2);
  assert.deepEqual(preferred.hardPlannedVolumeRange, { min: 2, max: 2 });

  const respectedExisting = buildVolumeCountGuidance({
    chapterBudget: 120,
    existingVolumeCount: 5,
    respectExistingVolumeCount: true,
  });
  assert.equal(respectedExisting.respectedExistingVolumeCount, 5);
  assert.equal(respectedExisting.recommendedVolumeCount, 5);

  const ignoredExisting = buildVolumeCountGuidance({
    chapterBudget: 80,
    existingVolumeCount: 2,
    respectExistingVolumeCount: false,
  });
  assert.equal(ignoredExisting.respectedExistingVolumeCount, null);
  assert.equal(ignoredExisting.recommendedVolumeCount, ignoredExisting.systemRecommendedVolumeCount);
});

test("volume count guidance clamps huge budgets to the configured maximum", () => {
  const hugeProject = buildVolumeCountGuidance({
    chapterBudget: 5000,
    maxVolumeCount: MAX_VOLUME_COUNT,
  });

  assert.deepEqual(hugeProject.allowedVolumeCountRange, {
    min: 1,
    max: MAX_VOLUME_COUNT,
  });
  assert.deepEqual(hugeProject.decisionVolumeCountRange, {
    min: 18,
    max: MAX_VOLUME_COUNT,
  });
  assert.equal(hugeProject.systemRecommendedVolumeCount, MAX_VOLUME_COUNT);
  assert.equal(hugeProject.recommendedVolumeCount, MAX_VOLUME_COUNT);
  assert.deepEqual(hugeProject.hardPlannedVolumeRange, { min: 3, max: 6 });
});

test("hard planned volume ranges stay constrained to early volumes", () => {
  assert.deepEqual(buildHardPlannedVolumeRange(1), { min: 1, max: 1 });
  assert.deepEqual(buildHardPlannedVolumeRange(2), { min: 2, max: 2 });
  assert.deepEqual(buildHardPlannedVolumeRange(3), { min: 3, max: 3 });
  assert.deepEqual(buildHardPlannedVolumeRange(4), { min: 3, max: 4 });
  assert.deepEqual(buildHardPlannedVolumeRange(6), { min: 3, max: 4 });
  assert.deepEqual(buildHardPlannedVolumeRange(9), { min: 3, max: 6 });
  assert.deepEqual(buildHardPlannedVolumeRange(24), { min: 3, max: 6 });
});
