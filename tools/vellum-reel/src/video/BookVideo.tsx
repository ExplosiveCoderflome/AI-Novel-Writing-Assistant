import {Audio} from '@remotion/media';
import {AbsoluteFill, Sequence, staticFile} from 'remotion';
import {BookProjectSchema, type BookProject, type Caption} from '../schema';
import {BackgroundScene} from './components/BackgroundScene';
import {BookIdentity} from './components/BookIdentity';
import {CaptionLayer} from './components/CaptionLayer';
import {TextureLayer} from './components/TextureLayer';
import {VellumFrame} from './components/VellumFrame';

export type BookVideoProps = {
  project: BookProject;
  captions: Caption[];
};

export const BookVideo: React.FC<BookVideoProps> = ({project: rawProject, captions}) => {
  const project = BookProjectSchema.parse(rawProject);
  const {fps} = project.format;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0b0b09',
        color: project.style.subtitle,
        fontFamily: project.style.fontFamily,
      }}
    >
      {project.scenes.map((scene, index) => {
        const from = Math.round((scene.startMs / 1000) * fps);
        const durationInFrames = Math.max(
          1,
          Math.round(((scene.endMs - scene.startMs) / 1000) * fps),
        );

        return (
          <Sequence key={`${scene.startMs}-${index}`} from={from} durationInFrames={durationInFrames}>
            <BackgroundScene scene={scene} durationInFrames={durationInFrames} index={index} />
          </Sequence>
        );
      })}

      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(5,5,4,0.18) 0%, rgba(5,5,4,${project.style.overlayOpacity * 0.35}) 42%, rgba(5,5,4,${project.style.overlayOpacity + 0.28}) 100%)`,
        }}
      />
      <TextureLayer opacity={project.style.grainOpacity} />
      <VellumFrame
        brand={project.brand}
        accent={project.style.accent}
        title={project.book.title}
        section="BOOK NOTES · 书籍解读"
      />
      <BookIdentity project={project} />
      <CaptionLayer captions={captions} color={project.style.subtitle} />

      {project.audio.narration ? (
        <Audio src={staticFile(project.audio.narration)} volume={project.audio.narrationVolume} />
      ) : null}
      {project.audio.bgm ? (
        <Audio src={staticFile(project.audio.bgm)} volume={project.audio.bgmVolume} loop />
      ) : null}
    </AbsoluteFill>
  );
};
