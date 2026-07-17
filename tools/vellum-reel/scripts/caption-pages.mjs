import {createTikTokStyleCaptions} from '@remotion/captions';

const visibleLength = (text) => [...text.replace(/\s+/g, '')].length;
const endsSentence = (text) => /[，。！？；：,.!?;:]$/u.test(text.trim());

const splitLongToken = (token, maxChars) => {
  const characters = [...token.text.replace(/\s+/g, '')];
  if (characters.length <= maxChars) {
    return [{text: characters.join(''), startMs: token.fromMs, endMs: token.toMs}];
  }

  const pieces = [];
  const duration = Math.max(1, token.toMs - token.fromMs);
  for (let offset = 0; offset < characters.length; offset += maxChars) {
    const text = characters.slice(offset, offset + maxChars).join('');
    const startRatio = offset / characters.length;
    const endRatio = Math.min(1, (offset + text.length) / characters.length);
    pieces.push({
      text,
      startMs: token.fromMs + duration * startRatio,
      endMs: token.fromMs + duration * endRatio,
    });
  }
  return pieces;
};

export const paginateCaptions = (
  captions,
  {maxChars = 18, maxDurationMs = 4200, maxGapMs = 650, minimumDisplayMs = 760} = {},
) => {
  if (!captions.length) return [];

  // Reuse Remotion's maintained token/page normalization, then apply constraints
  // for short Chinese subtitle lines where whitespace is not a reliable boundary.
  const {pages} = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: maxDurationMs,
  });
  const tokens = pages
    .flatMap((page) => page.tokens)
    .flatMap((token) => splitLongToken(token, maxChars))
    .filter((token) => token.text.trim());

  const result = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    result.push({
      startMs: Math.round(current.startMs),
      endMs: Math.round(current.endMs),
      text: current.text.replace(/\s+/g, '').trim(),
    });
    current = null;
  };

  for (const token of tokens) {
    const text = token.text.replace(/\s+/g, '').trim();
    if (!text) continue;

    const wouldExceedChars = current && visibleLength(current.text + text) > maxChars;
    const wouldExceedDuration = current && token.endMs - current.startMs > maxDurationMs;
    const followsLongPause = current && token.startMs - current.endMs > maxGapMs;

    if (wouldExceedChars || wouldExceedDuration || followsLongPause) flush();

    if (!current) {
      current = {text, startMs: token.startMs, endMs: token.endMs};
    } else {
      current.text += text;
      current.endMs = token.endMs;
    }

    if (endsSentence(text) && visibleLength(current.text) >= 6) flush();
  }
  flush();

  return result.map((caption, index) => {
    const next = result[index + 1];
    if (!next) return caption;
    const desiredEnd = caption.startMs + minimumDisplayMs;
    const latestEnd = Math.max(caption.endMs, next.startMs - 80);
    return {
      ...caption,
      endMs: Math.round(Math.max(caption.endMs, Math.min(desiredEnd, latestEnd))),
    };
  });
};
