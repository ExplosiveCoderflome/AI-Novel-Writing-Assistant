import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

type FrameProps = {
  brand: {name: string; nameZh: string; tagline: string; edition: string};
  accent: string;
  title: string;
  section?: string;
};

export const VellumFrame: React.FC<FrameProps> = ({brand, accent, title, section}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const progress = Math.min(1, frame / Math.max(1, durationInFrames - 1));
  const intro = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="vellum-frame" style={{opacity: intro, '--accent': accent} as React.CSSProperties}>
      <div className="vellum-frame-top">
        <div className="vellum-monogram">VR</div>
        <div className="vellum-brand-lockup">
          <strong>{brand.name}</strong>
          <span>{brand.nameZh} · {brand.edition}</span>
        </div>
        <div className="vellum-frame-title">{title}</div>
      </div>
      <div className="vellum-side-index">
        <span>{section ?? brand.tagline}</span>
      </div>
      <div className="vellum-progress">
        <i style={{transform: `scaleX(${progress})`}} />
        <span>{String(Math.floor(progress * 100)).padStart(2, '0')}</span>
      </div>
    </div>
  );
};
