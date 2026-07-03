export interface TensionCurvePoint {
  id: string;
  chapterOrder: number;
  title: string;
  value: number | null;
  source?: "ai" | "user" | null;
  beatKey?: string | null;
}

export interface TensionCurveSeries {
  id: string;
  label: string;
  color: string;
  points: TensionCurvePoint[];
  editable?: boolean;
}

export interface TensionCurveViewportOption {
  key: string;
  label: string;
}

export interface CurveSegment {
  key: string;
  path: string;
  color: string;
  dash?: string;
  opacity?: number;
}

export interface ChapterGuide {
  key: string;
  x: number;
  label: string;
  emphasized?: boolean;
}

export interface BeatBand {
  key: string;
  x: number;
  width: number;
  label: string;
  active: boolean;
}

export interface TensionCanvasData extends Record<string, unknown> {
  width: number;
  ticks: number[];
  guides: ChapterGuide[];
  bands: BeatBand[];
  segments: CurveSegment[];
}

export interface TensionPointData extends Record<string, unknown> {
  seriesId: string;
  pointId: string;
  chapterOrder: number;
  title: string;
  value: number | null;
  color: string;
  source?: "ai" | "user" | null;
  editable: boolean;
  selectedScope: boolean;
  onCommitValue?: (seriesId: string, pointId: string, value: number) => void;
  onRelease?: (seriesId: string, pointId: string, value: number) => void;
}
