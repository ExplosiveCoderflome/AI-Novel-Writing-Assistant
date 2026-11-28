import { useEffect, useRef, type ReactNode } from "react";
import { BookOpen, Maximize2, Minimize2, X } from "lucide-react";

export interface ReadingControls {
  focused: boolean;
  toggleFocus: () => void;
  backToMap: () => void;
}
export function ReaderFrame({ title, breadcrumb, kind, focused, toggleFocus, backToMap, children }: ReadingControls & {
  title: string; breadcrumb: string; kind: string; children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [title]);
  return <section className="flow-reader" aria-label={title + "详情"}>
    <div className="flow-reader-bar">
      <span className="flow-reader-breadcrumb"><BookOpen size={15} />{breadcrumb}<span>/</span>{kind}</span>
      <button type="button" className="flow-expand" onClick={toggleFocus} aria-pressed={focused}>
        {focused ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{focused ? "返回分栏" : "专注阅读"}
      </button>
      <button className="reader-close" type="button" aria-label="收起详情，返回流程图" title="收起详情，返回流程图" onClick={backToMap}><X size={17} /></button>
    </div>
    <div className="reader-scroll" tabIndex={0} aria-label="阅读步骤和完整提示词">
      <div className="reader-paper"><h2 tabIndex={-1} ref={heading}>{title}</h2>{children}</div>
    </div>
  </section>;
}
