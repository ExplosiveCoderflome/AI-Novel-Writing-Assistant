export const activeBeatAt = (beats, nowMs) =>
  beats.find((beat) => nowMs >= beat.startMs && nowMs < beat.endMs) ?? null;

export const validateNarrativeBeats = (beats, totalMs) => {
  const errors = [];
  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index];
    if (beat.endMs <= beat.startMs) errors.push(`beat ${beat.id} 的 endMs 必须大于 startMs`);
    if (beat.endMs > totalMs) errors.push(`beat ${beat.id} 超出视频时长`);
    if (index > 0 && beat.startMs < beats[index - 1].endMs) {
      errors.push(`beat ${beats[index - 1].id} 与 ${beat.id} 时间重叠`);
    }
  }
  return errors;
};
