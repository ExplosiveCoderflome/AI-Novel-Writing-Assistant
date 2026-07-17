import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import type {SceneSchema} from '../../schema';
import type {z} from 'zod';

type Scene = z.infer<typeof SceneSchema>;

export const BackgroundScene: React.FC<{
  scene: Scene;
  durationInFrames: number;
  index: number;
}> = ({scene, durationInFrames, index}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const transitionFrames = scene.transition === 'cut' ? 1 : scene.transition === 'dip' ? 24 : 14;
  const fade = interpolate(frame, [0, transitionFrames, Math.max(0, durationInFrames - transitionFrames), durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const travel = 0.045 + scene.intensity * 0.075;
  const scale = scene.motion === 'push'
    ? 1.035 + progress * travel
    : scene.motion === 'pull'
      ? 1.11 - progress * travel
      : scene.motion === 'still' ? 1.055 : 1.085;
  const translateX =
    scene.motion === 'pan-left' ? 34 - progress * 68 : scene.motion === 'pan-right' ? -34 + progress * 68 : 0;
  const translateY = scene.motion === 'drift-up' ? 24 - progress * 48 : 0;
  const grade = {
    neutral: 'saturate(0.76) contrast(1.07) brightness(0.88)',
    amber: 'sepia(0.18) saturate(0.82) contrast(1.08) brightness(0.88)',
    noir: 'grayscale(0.48) saturate(0.55) contrast(1.18) brightness(0.82)',
    dawn: 'sepia(0.1) saturate(0.9) contrast(1.02) brightness(0.96)',
    verdigris: 'hue-rotate(8deg) saturate(0.62) contrast(1.1) brightness(0.84)',
  }[scene.grade];

  return (
    <AbsoluteFill style={{opacity: fade, overflow: 'hidden'}}>
      {scene.image ? (
        <Img
          src={staticFile(scene.image)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: scene.focus,
            filter: grade,
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: `
              radial-gradient(ellipse at ${index % 2 === 0 ? '70% 28%' : '28% 32%'}, ${scene.fallback[1]} 0%, transparent 45%),
              linear-gradient(155deg, ${scene.fallback[0]} 0%, ${scene.fallback[2]} 76%)`,
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          }}
        >
          <div className="fallback-sun" />
          <div className="fallback-mountain fallback-mountain-back" />
          <div className="fallback-mountain fallback-mountain-front" />
          <div className="fallback-river" />
          <div className="fallback-traveler" />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
