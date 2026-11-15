import { useEffect, useMemo } from "react";
import { Trophy, X } from "lucide-react";

interface BlgCelebrationProps {
  open: boolean;
  onClose: () => void;
}

const CONFETTI_COLORS = ["#FB7299", "#F6B24C", "#FFD166", "#FFFFFF", "#76E5FF"];

interface ConfettiPiece {
  left: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  rotation: number;
  round: boolean;
}

function buildConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, index) => ({
    left: (index * 37 + 11) % 100,
    delay: ((index * 13) % 20) / 10,
    duration: 2.6 + ((index * 7) % 10) / 10,
    size: 6 + ((index * 5) % 8),
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    rotation: (index * 47) % 360,
    round: index % 3 === 0,
  }));
}

export default function BlgCelebration({ open, onClose }: BlgCelebrationProps) {
  const confetti = useMemo(() => buildConfetti(64), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="BLG 夺冠庆祝"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <style>{`@keyframes blg-confetti-fall { from { transform: translateY(-10vh) rotate(0deg); opacity: 1; } to { transform: translateY(110vh) rotate(720deg); opacity: 0.7; } }`}</style>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map((piece, index) => (
          <span
            key={index}
            className="absolute top-0"
            style={{
              left: `${piece.left}%`,
              width: piece.size,
              height: piece.round ? piece.size : piece.size * 1.6,
              backgroundColor: piece.color,
              borderRadius: piece.round ? "50%" : "2px",
              transform: `rotate(${piece.rotation}deg)`,
              animation: `blg-confetti-fall ${piece.duration}s linear ${piece.delay}s infinite`,
            }}
          />
        ))}
      </div>
      <div
        className="relative flex max-w-md flex-col items-center gap-3 rounded-2xl bg-[#14101d] px-8 py-8 text-center text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="关闭庆祝"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-white/60 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <Trophy className="h-12 w-12 text-[#F6B24C]" aria-hidden="true" />
        <p className="text-5xl font-black tracking-wide text-[#FFD166]">BLG</p>
        <p className="text-lg font-semibold">2026 英雄联盟全球总决赛冠军</p>
        <p className="text-sm leading-relaxed text-white/70">
          决赛 3:1 战胜 GEN，一穿四连斩四支 LCK 队伍
        </p>
        <p className="text-sm text-white/70">Knight 决赛 MVP · 2026.11.15 · 纽约</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 rounded-full bg-[#FB7299] px-6 py-2 text-sm font-semibold text-white hover:bg-[#f95d8a]"
        >
          继续创作
        </button>
      </div>
    </div>
  );
}
