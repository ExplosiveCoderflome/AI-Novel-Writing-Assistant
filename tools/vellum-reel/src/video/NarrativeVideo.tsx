import {Audio} from '@remotion/media';
import {AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {NarrativeProjectSchema, type Caption, type NarrativeProject} from '../schema';
import {BackgroundScene} from './components/BackgroundScene';
import {NarrativeCaptionLayer} from './components/NarrativeCaptionLayer';
import {TextureLayer} from './components/TextureLayer';
import {NarrativeBeatLayer} from './components/NarrativeBeatLayer';
import {VellumFrame} from './components/VellumFrame';

export type NarrativeVideoProps = {
  project: NarrativeProject;
  captions: Caption[];
};

const OpeningTitles: React.FC<{project: NarrativeProject}> = ({project}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const seconds = frame / fps;
  const openingEnd = (project.narrative.beats[0]?.startMs ?? project.scenes[0]?.endMs ?? 15000) / 1000;
  const titleOut = Math.max(4.8, openingEnd * 0.58);
  const titleOpacity = interpolate(seconds, [0.6, 1.6, titleOut - 1.2, titleOut], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const epigraphOpacity = interpolate(seconds, [titleOut - 0.5, titleOut + 0.45, openingEnd - 1.1, openingEnd], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <>
      <div className="narrative-opening-title" style={{opacity: titleOpacity}}>
        <div className="narrative-eyebrow">{project.narrative.eyebrow}</div>
        <div className="narrative-volume">{project.series.volume}</div>
        <h1>{project.series.title}</h1>
        <div className="narrative-english">{project.series.englishTitle}</div>
        <div className="narrative-gold-rule" />
        <h2>{project.series.chapter}</h2>
      </div>
      <div className="narrative-epigraph" style={{opacity: epigraphOpacity}}>
        {project.narrative.epigraphs.map((item) => (
          <div key={`${item.text}-${item.source}`} className="narrative-epigraph-item">
            <p>{item.text}</p>
            <small>—— {item.source}</small>
          </div>
        ))}
      </div>
    </>
  );
};

const EndCard: React.FC<{project: NarrativeProject; captions: Caption[]}> = ({project, captions}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const lastCaptionFrame = Math.ceil(((captions.at(-1)?.endMs ?? 0) / 1000) * fps);
  const fadeStart = Math.min(durationInFrames - 2, lastCaptionFrame + Math.round(fps * 0.1));
  const fadeEnd = Math.max(fadeStart + 1, durationInFrames - Math.round(fps * 0.35));
  const opacity = interpolate(frame, [fadeStart, fadeEnd, durationInFrames], [0, 1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div className="narrative-end-card" style={{opacity}}>
      <small className="narrative-end-kicker">{project.endCard.kicker}</small>
      <div>{project.endCard.line1}</div>
      <span>{project.endCard.line2}</span>
      {project.endCard.cta ? <p>{project.endCard.cta}</p> : null}
    </div>
  );
};

export const NarrativeVideo: React.FC<NarrativeVideoProps> = ({project: rawProject, captions}) => {
  const project = NarrativeProjectSchema.parse(rawProject);
  const {fps} = project.format;

  return (
    <AbsoluteFill style={{backgroundColor: '#08090a', color: project.style.subtitle, fontFamily: project.style.fontFamily}}>
      {project.scenes.map((scene, index) => {
        const from = Math.round((scene.startMs / 1000) * fps);
        const durationInFrames = Math.max(1, Math.round(((scene.endMs - scene.startMs) / 1000) * fps));
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <BackgroundScene scene={scene} durationInFrames={durationInFrames} index={index} />
          </Sequence>
        );
      })}

      <AbsoluteFill className="narrative-vignette" />
      <TextureLayer opacity={project.style.grainOpacity} />
      <VellumFrame brand={project.brand} accent={project.style.accent} title={project.series.title} section={project.series.chapter} />
      <OpeningTitles project={project} />
      <NarrativeBeatLayer project={project} />
      <NarrativeCaptionLayer captions={captions} color={project.style.subtitle} />
      <EndCard project={project} captions={captions} />
      {project.audio.narration ? <Audio src={staticFile(project.audio.narration)} volume={project.audio.narrationVolume} /> : null}
    </AbsoluteFill>
  );
};
