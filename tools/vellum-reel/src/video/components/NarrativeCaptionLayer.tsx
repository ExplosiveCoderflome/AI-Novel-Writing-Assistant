import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Caption} from '../../schema';
import {EmphasizedText} from './EmphasizedText';

export const NarrativeCaptionLayer: React.FC<{captions: Caption[]; color: string}> = ({captions, color}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const active = captions.find((caption) => nowMs >= caption.startMs && nowMs < caption.endMs);
  if (!active) return null;

  const localFrame = frame - Math.round((active.startMs / 1000) * fps);
  const opacity = interpolate(localFrame, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const translateY = interpolate(localFrame, [0, 7], [12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="narrative-caption-safe-area">
      <div
        className={`narrative-caption-text caption-${active.kind}`}
        style={{color, opacity, transform: `translateY(${translateY}px)`}}
      >
        <EmphasizedText text={active.text} emphasis={active.emphasis} />
      </div>
    </div>
  );
};
