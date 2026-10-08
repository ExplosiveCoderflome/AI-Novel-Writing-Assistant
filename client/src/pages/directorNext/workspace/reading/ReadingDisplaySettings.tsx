import {useId} from "react";
import {Type} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {
  DEFAULT_READING_DISPLAY,
  READING_FONT_OPTIONS,
  READING_FONT_SIZE_MAX,
  READING_FONT_SIZE_MIN,
  normalizeReadingDisplayPreferences,
  readingTextStyle,
  type ReadingDisplayPreferences,
} from "./displayPreferences";

export function ReadingDisplaySettings({preferences, onChange, previewText}: {
  preferences: ReadingDisplayPreferences;
  onChange: (next: ReadingDisplayPreferences) => void;
  previewText?: string | null;
}) {
  const sizeId = useId();
  const fontId = useId();
  return <Dialog>
    <DialogTrigger asChild><Button variant="ghost" size="sm" className="shrink-0 gap-2"><Type className="h-4 w-4" aria-hidden="true"/>正文显示</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto">
      <DialogHeader>
        <DialogTitle>正文显示</DialogTitle>
        <DialogDescription>调整字号和字体，正文与实时预览会同步显示。</DialogDescription>
      </DialogHeader>
      <div className="space-y-5 py-2">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <label htmlFor={sizeId} className="text-sm font-medium">字号</label>
            <output htmlFor={sizeId} className="text-sm tabular-nums" aria-live="polite">{preferences.fontSize}px</output>
          </div>
          <input id={sizeId} type="range" min={READING_FONT_SIZE_MIN} max={READING_FONT_SIZE_MAX} step={1} value={preferences.fontSize}
            onChange={event => onChange({...preferences, fontSize: Number(event.target.value)})}
            className="h-6 w-full cursor-pointer accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"/>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>小</span><span>大</span></div>
        </div>
        <div>
          <label htmlFor={fontId} className="mb-2 block text-sm font-medium">字体</label>
          <Select value={preferences.font} onValueChange={font => onChange(normalizeReadingDisplayPreferences({...preferences, font}))}>
            <SelectTrigger id={fontId} className="shadow-none hover:shadow-none"><SelectValue/></SelectTrigger>
            <SelectContent>{READING_FONT_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}><span style={{fontFamily: option.family}}>{option.label}</span></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <section aria-label="阅读预览" className="rounded-md bg-muted/40 px-4 py-3">
          <h3 className="mb-2 text-xs text-muted-foreground">阅读预览</h3>
          <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words leading-[2.15] tracking-wide" style={readingTextStyle(preferences)}>
            {previewText?.trim().slice(0, 180) || "晨光落在窗沿，他翻开书页，故事从这里继续。"}
          </p>
        </section>
        <p className="text-xs leading-5 text-muted-foreground">选择会在此浏览器中记住，切换章节和小说时沿用。</p>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={() => onChange({...DEFAULT_READING_DISPLAY})} className="sm:mr-auto">恢复默认</Button>
        <DialogClose asChild><Button>完成</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
