import { cn } from "@/lib/utils";

interface DesktopBrandMarkProps {
  className?: string;
}

export default function DesktopBrandMark({ className }: DesktopBrandMarkProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-16 w-16 drop-shadow-[0_18px_40px_rgba(8,16,31,0.28)]", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="desktopBrandGradientReact" x1="14" y1="12" x2="82" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A5F7A" />
          <stop offset="1" stopColor="#122033" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="80" height="80" rx="24" fill="url(#desktopBrandGradientReact)" />
      <path d="M48 18L67 37L48 78L29 37L48 18Z" fill="#F7F3EA" />
      <circle cx="48" cy="44" r="6" fill="#133246" />
      <path d="M38 59L48 67L58 59" stroke="#133246" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="69" cy="28" r="4.5" fill="#76E5FF" />
      <path d="M63 34L57 39" stroke="#76E5FF" strokeWidth="4" strokeLinecap="round" />
      <circle cx="28" cy="65" r="3.5" fill="#F6B24C" />
      <path d="M34 60L39 54" stroke="#F6B24C" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
