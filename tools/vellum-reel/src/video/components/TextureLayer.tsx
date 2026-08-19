import {AbsoluteFill} from 'remotion';

export const TextureLayer: React.FC<{opacity: number}> = ({opacity}) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      opacity,
      mixBlendMode: 'soft-light',
      backgroundImage:
        'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 180 180\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.88\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'.85\'/%3E%3C/svg%3E")',
    }}
  />
);
