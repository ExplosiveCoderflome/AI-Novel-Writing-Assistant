import {z} from 'zod';

const MediaPath = z.string().refine((value) => !value.startsWith('/'), {
  message: '素材路径请相对于 public/ 填写，不要以 / 开头',
});

export const CaptionSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  text: z.string().min(1),
  segmentId: z.string().min(1).optional(),
  kind: z.enum(['narration', 'dialogue', 'quote']).default('narration'),
  emphasis: z.array(z.string().min(1)).default([]),
});

export const SceneSchema = z.object({
  id: z.string().min(1).optional(),
  segmentId: z.string().min(1).optional(),
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  image: MediaPath,
  focus: z.string().min(1),
  fallback: z.tuple([z.string(), z.string(), z.string()]),
  motion: z.enum(['push', 'pull', 'pan-left', 'pan-right', 'drift-up', 'still']),
  intensity: z.number().min(0).max(1).default(0.5),
  transition: z.enum(['crossfade', 'cut', 'dip']).default('crossfade'),
  grade: z.enum(['neutral', 'amber', 'noir', 'dawn', 'verdigris']).default('neutral'),
});

const BrandSchema = z.object({
  name: z.string().min(1).default('VellumReel'),
  nameZh: z.string().min(1).default('卷影'),
  tagline: z.string().min(1).default('Narrative video, shaped by text.'),
  edition: z.string().min(1).default('OPEN EDITION'),
});

const defaultBrand = {
  name: 'VellumReel',
  nameZh: '卷影',
  tagline: 'Narrative video, shaped by text.',
  edition: 'OPEN EDITION',
};

const BeatSchema = z.object({
  id: z.string().min(1),
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  index: z.string().min(1),
  label: z.string().min(1),
  title: z.string().min(1),
  motif: z.string().min(1).optional(),
});

export const BookProjectSchema = z.object({
  id: z.string().min(1),
  brand: BrandSchema.default(defaultBrand),
  book: z.object({
    title: z.string().min(1),
    author: z.string().min(1),
    englishTitle: z.string().min(1),
    strapline: z.string().min(1),
    cornerMark: z.string().min(1).max(4),
    coverTop: z.string().min(1).optional(),
    coverAuthor: z.string().min(1).optional(),
  }),
  format: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().min(24).max(60),
    durationSeconds: z.number().positive(),
  }),
  style: z.object({
    accent: z.string().min(1),
    subtitle: z.string().min(1),
    overlayOpacity: z.number().min(0).max(1),
    grainOpacity: z.number().min(0).max(1),
    fontFamily: z.string().min(1),
    surface: z.string().min(1).default('#0b0c0d'),
    muted: z.string().min(1).default('#a7a298'),
  }),
  audio: z.object({
    narration: MediaPath,
    narrationVolume: z.number().min(0).max(2),
    bgm: MediaPath,
    bgmVolume: z.number().min(0).max(1),
  }),
  narration: z.array(z.string().min(1)).min(1),
  scenes: z
    .array(SceneSchema)
    .min(1),
});

export const NarrativeProjectSchema = z.object({
  id: z.string().min(1),
  brand: BrandSchema.default(defaultBrand),
  series: z.object({
    title: z.string().min(1),
    volume: z.string().min(1),
    englishTitle: z.string().min(1),
    chapter: z.string().min(1),
    subtitle: z.string().min(1),
  }),
  format: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().min(24).max(60),
    durationSeconds: z.number().positive(),
  }),
  style: z.object({
    accent: z.string().min(1),
    subtitle: z.string().min(1),
    overlayOpacity: z.number().min(0).max(1),
    grainOpacity: z.number().min(0).max(1),
    fontFamily: z.string().min(1),
    surface: z.string().min(1).default('#08090a'),
    muted: z.string().min(1).default('#9f9a90'),
  }),
  audio: z.object({
    narration: MediaPath,
    narrationVolume: z.number().min(0).max(2),
  }),
  scenes: z.array(SceneSchema.extend({id: z.string().min(1)})).min(1),
  narrative: z.object({
    eyebrow: z.string().min(1).default('A VELLUMREEL STORY'),
    logline: z.string().min(1).optional(),
    epigraphs: z.array(z.object({text: z.string().min(1), source: z.string().min(1)})).max(3).default([]),
    beats: z.array(BeatSchema).default([]),
  }).default({eyebrow: 'A VELLUMREEL STORY', epigraphs: [], beats: []}),
  endCard: z.object({
    line1: z.string().min(1),
    line2: z.string().min(1),
    kicker: z.string().min(1).default('END OF CHAPTER'),
    cta: z.string().min(1).optional(),
  }),
});

export type BookProject = z.infer<typeof BookProjectSchema>;
export type NarrativeProject = z.infer<typeof NarrativeProjectSchema>;
export type Caption = z.infer<typeof CaptionSchema>;
