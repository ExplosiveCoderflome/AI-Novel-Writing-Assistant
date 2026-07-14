import { staticFile } from "remotion";
import { CinematicRendererProps } from "./types";

export const signalFromTomorrowWithMusicFixture: CinematicRendererProps = {
  titleFontSize: 78,
  titleWidth: 1320,
  signalLineCount: 18,
  soundtrack: {
    src: staticFile(
      "music/signal-from-tomorrow/cinematic_time_hans_zimmer_style.mp3",
    ),
    volume: 0.42,
    fadeInSeconds: 1.5,
    fadeOutSeconds: 2.5,
  },
  scenes: [
    {
      id: "sc1",
      kind: "video",
      startSeconds: 0,
      durationSeconds: 4,
      src: staticFile("video/signal-from-tomorrow/sample_observatory_veo31_ref.mp4"),
      tone: "cold",
      trimBeforeSeconds: 1,
      fadeInFrames: 0,
    },
    {
      id: "sc2",
      kind: "video",
      startSeconds: 4,
      durationSeconds: 4,
      src: staticFile(
        "video/signal-from-tomorrow/sc2_mission_control_veo31_ref_8s.mp4",
      ),
      tone: "steel",
    },
    {
      id: "sc3",
      kind: "title",
      startSeconds: 8,
      durationSeconds: 3,
      text: "YESTERDAY, THEY LAUNCHED.",
      accent: "#89d7ff",
      intensity: 1,
    },
    {
      id: "sc4",
      kind: "video",
      startSeconds: 11,
      durationSeconds: 7,
      src: staticFile("video/signal-from-tomorrow/sc4_launch_departure_veo31_ref.mp4"),
      tone: "cold",
    },
    {
      id: "sc5",
      kind: "title",
      startSeconds: 18,
      durationSeconds: 3,
      text: "THE SIGNAL CAME FROM EARTH.",
      accent: "#a6e6ff",
      intensity: 1.15,
    },
    {
      id: "sc6",
      kind: "video",
      startSeconds: 21,
      durationSeconds: 6,
      src: staticFile(
        "video/signal-from-tomorrow/sc6_orbital_paradox_veo31_ref_8s.mp4",
      ),
      tone: "void",
    },
    {
      id: "sc7",
      kind: "title",
      startSeconds: 27,
      durationSeconds: 3,
      text: "SIGNAL FROM TOMORROW",
      accent: "#d6f1ff",
      intensity: 0.9,
    },
  ],
};
