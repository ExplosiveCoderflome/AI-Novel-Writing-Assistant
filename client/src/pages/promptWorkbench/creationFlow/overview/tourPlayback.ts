import { stages } from "../flowDefinition";

export const tourStops = stages.flatMap(stage => stage.main.map(step => ({ stage, step })));
export const lastStop = tourStops.length - 1;
export interface Playback { index: number | null; playing: boolean }
export const closedTour: Playback = { index: null, playing: false };
export type TourAction = "toggle" | "pause" | "end" | { seek: number } | { elapsedAt: number } | { read: string };

export function tourPlayback(state: Playback, action: TourAction): Playback {
  if (action === "end") return closedTour;
  if (action === "pause") return state.playing ? { ...state, playing: false } : state;
  if (action === "toggle") return {
    index: state.index === null || state.index === lastStop ? 0 : state.index,
    playing: !state.playing,
  };
  if (state.index === null) return state;
  if ("read" in action) {
    const index = tourStops.findIndex(({ step }) => step.id === action.read);
    return { index: index < 0 ? state.index : index, playing: false };
  }
  if ("seek" in action) return { index: Math.max(0, Math.min(lastStop, action.seek)), playing: false };
  if (!state.playing || action.elapsedAt !== state.index) return state;
  const index = Math.min(lastStop, state.index + 1);
  return { index, playing: index < lastStop };
}
