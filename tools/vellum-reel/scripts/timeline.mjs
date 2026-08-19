export const syncProjectTimeline = ({project, captions, audioMs, tailMs = 900}) => {
  if (!Number.isFinite(audioMs) || audioMs <= 0) throw new Error('audioMs 必须为正数。');
  if (!project.scenes?.length) throw new Error('项目至少需要一个分镜。');

  const next = structuredClone(project);
  const lastCaptionMs = captions.reduce((max, caption) => Math.max(max, caption.endMs), 0);
  const targetMs = Math.ceil((Math.max(audioMs, lastCaptionMs) + tailMs) / 100) * 100;
  const oldTotalMs = project.format.durationSeconds * 1000;
  const scale = targetMs / oldTotalMs;

  next.format.durationSeconds = targetMs / 1000;
  next.scenes = next.scenes.map((scene, index) => ({
    ...scene,
    startMs: index === 0 ? 0 : Math.round(scene.startMs * scale),
    endMs: index === next.scenes.length - 1 ? targetMs : Math.round(scene.endMs * scale),
  }));

  return {project: next, oldTotalMs, targetMs, lastCaptionMs, scale};
};
