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
        <linearGradient id="desktopBrandGradientReact" x1="12" y1="10" x2="84" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#173747" />
          <stop offset="0.58" stopColor="#102532" />
          <stop offset="1" stopColor="#0D1822" />
        </linearGradient>
        <filter id="desktopBrandPaperShadow" x="0" y="0" width="96" height="96" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#07111A" floodOpacity="0.22" />
        </filter>
      </defs>
      <rect x="8" y="8" width="80" height="80" rx="18" fill="url(#desktopBrandGradientReact)" filter="url(#desktopBrandPaperShadow)" />
      <path d="M22 31H74" stroke="#E7D8B7" strokeWidth="5" strokeLinecap="round" />
      <path d="M27 23L36 31M46 23L55 31M65 23L74 31" stroke="#D29A3D" strokeWidth="4" strokeLinecap="round" />
      <path d="M28 39H68V72H28V39Z" fill="#F4EBDD" />
      <path d="M37 45H59" stroke="#173747" strokeWidth="4" strokeLinecap="round" />
      <path d="M37 55H53" stroke="#173747" strokeWidth="4" strokeLinecap="round" />
      <path d="M37 65H48" stroke="#D29A3D" strokeWidth="4" strokeLinecap="round" />
      <path d="M68 39V72" stroke="#D29A3D" strokeWidth="5" strokeLinecap="round" />
      <circle cx="69" cy="69" r="6" fill="#163544" stroke="#F4EBDD" strokeWidth="3" />
    </svg>
  );
}
