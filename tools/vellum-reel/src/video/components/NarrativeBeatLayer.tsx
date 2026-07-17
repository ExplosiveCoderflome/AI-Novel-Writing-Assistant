import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {NarrativeProject} from '../../schema';

export const NarrativeBeatLayer: React.FC<{project: NarrativeProject}> = ({project}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const beat = project.narrative.beats.find((item) => nowMs >= item.startMs && nowMs < item.endMs);
  if (!beat) return null;

  const localMs = nowMs - beat.startMs;
  const opacity = interpolate(localMs, [0, 380, 1700, 2400], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const translateY = interpolate(localMs, [0, 500], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="narrative-beat" style={{opacity, transform: `translateY(${translateY}px)`}}>
      <div className="narrative-beat-index">{beat.index}</div>
      <div className="narrative-beat-copy">
        <span>{beat.label}</span>
        <strong>{beat.title}</strong>
        {beat.motif ? <small>{beat.motif}</small> : null}
      </div>
    </div>
  );
};
