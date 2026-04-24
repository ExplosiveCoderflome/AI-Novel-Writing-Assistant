import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMobileFloatingSaveLabel } from "./mobileFloatingActions";

interface MobileFloatingSaveButtonProps {
  onSave: () => void;
  isSaving: boolean;
  visible: boolean;
}

const STORAGE_KEY = "novel-mobile-floating-save-position";
const DEFAULT_POSITION = { x: 16, y: 148 };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readStoredPosition() {
  if (typeof window === "undefined") {
    return DEFAULT_POSITION;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_POSITION;
    }
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_POSITION>;
    return {
      x: typeof parsed.x === "number" ? parsed.x : DEFAULT_POSITION.x,
      y: typeof parsed.y === "number" ? parsed.y : DEFAULT_POSITION.y,
    };
  } catch {
    return DEFAULT_POSITION;
  }
}

export default function MobileFloatingSaveButton({ onSave, isSaving, visible }: MobileFloatingSaveButtonProps) {
  const [position, setPosition] = useState(readStoredPosition);
  const dragStartRef = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const maxX = Math.max(12, window.innerWidth - 120);
    const maxY = Math.max(96, window.innerHeight - 96);
    setPosition((current) => ({
      x: clamp(current.x, 12, maxX),
      y: clamp(current.y, 96, maxY),
    }));
  }, []);

  if (!visible) {
    return null;
  }

  const persistPosition = (nextPosition: typeof DEFAULT_POSITION) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPosition));
    }
  };

  const resolveDraggedPosition = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) {
      return position;
    }
    const maxX = Math.max(12, window.innerWidth - 120);
    const maxY = Math.max(96, window.innerHeight - 96);
    return {
      x: clamp(start.x + event.clientX - start.startX, 12, maxX),
      y: clamp(start.y + event.clientY - start.startY, 96, maxY),
    };
  };

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={isSaving}
      onClick={() => {
        if (dragStartRef.current?.moved) {
          dragStartRef.current = null;
          return;
        }
        onSave();
      }}
      onPointerDown={(event) => {
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        dragStartRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: position.x,
          y: position.y,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        const start = dragStartRef.current;
        if (!start || start.pointerId !== event.pointerId) {
          return;
        }
        const deltaX = event.clientX - start.startX;
        const deltaY = event.clientY - start.startY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
          start.moved = true;
        }
        setPosition(resolveDraggedPosition(event));
      }}
      onPointerUp={(event) => {
        const start = dragStartRef.current;
        if (start?.pointerId === event.pointerId) {
          const nextPosition = resolveDraggedPosition(event);
          setPosition(nextPosition);
          persistPosition(nextPosition);
        }
      }}
      onPointerCancel={() => {
        persistPosition(position);
        dragStartRef.current = null;
      }}
      className={cn(
        "fixed z-40 h-10 rounded-full border border-border/70 bg-background/95 px-3 shadow-lg backdrop-blur",
        "touch-none select-none text-xs font-semibold",
      )}
      style={{ left: position.x, top: position.y }}
      aria-label="保存当前工作区"
    >
      <Save className="h-4 w-4" />
      {getMobileFloatingSaveLabel(isSaving)}
    </Button>
  );
}
