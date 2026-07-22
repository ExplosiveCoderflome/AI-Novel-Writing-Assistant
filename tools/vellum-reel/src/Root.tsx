import {Composition} from 'remotion';
import rawProject from '../examples/book-demo/project.json';
import rawCaptions from '../examples/book-demo/captions.json';
import rawNarrativeProject from '../examples/narrative-demo/project.json';
import rawNarrativeCaptions from '../examples/narrative-demo/captions.json';
import {BookVideo} from './video/BookVideo';
import {NarrativeVideo} from './video/NarrativeVideo';
import {SocialPreview, SocialPreviewEn} from './video/SocialPreview';
import {BookProjectSchema, CaptionSchema, NarrativeProjectSchema} from './schema';

const project = BookProjectSchema.parse(rawProject);
const captions = CaptionSchema.array().parse(rawCaptions);
const narrativeProject = NarrativeProjectSchema.parse(rawNarrativeProject);
const narrativeCaptions = CaptionSchema.array().parse(rawNarrativeCaptions);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SocialPreview"
        component={SocialPreview}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={640}
      />
      <Composition
        id="SocialPreviewEn"
        component={SocialPreviewEn}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={640}
      />
      <Composition
        id="BookVideo"
        component={BookVideo}
        durationInFrames={Math.ceil(project.format.durationSeconds * project.format.fps)}
        fps={project.format.fps}
        width={project.format.width}
        height={project.format.height}
        defaultProps={{project, captions}}
        calculateMetadata={({props}) => ({
          durationInFrames: Math.ceil(props.project.format.durationSeconds * props.project.format.fps),
          fps: props.project.format.fps,
          width: props.project.format.width,
          height: props.project.format.height,
        })}
      />
      <Composition
        id="NarrativeVideo"
        component={NarrativeVideo}
        durationInFrames={Math.ceil(narrativeProject.format.durationSeconds * narrativeProject.format.fps)}
        fps={narrativeProject.format.fps}
        width={narrativeProject.format.width}
        height={narrativeProject.format.height}
        defaultProps={{project: narrativeProject, captions: narrativeCaptions}}
        calculateMetadata={({props}) => ({
          durationInFrames: Math.ceil(props.project.format.durationSeconds * props.project.format.fps),
          fps: props.project.format.fps,
          width: props.project.format.width,
          height: props.project.format.height,
        })}
      />
    </>
  );
};
