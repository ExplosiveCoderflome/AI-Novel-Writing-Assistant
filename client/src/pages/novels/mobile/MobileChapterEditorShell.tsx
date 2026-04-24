import MobileWorkspaceShell from "@/components/layout/mobile/MobileWorkspaceShell";
import { Button } from "@/components/ui/button";
import ChapterEditorShell from "../components/chapterEditor/ChapterEditorShell";
import type { ChapterEditorShellProps } from "../components/chapterEditor/chapterEditorTypes";

export default function MobileChapterEditorShell(props: ChapterEditorShellProps) {
  if (!props.chapter) {
    return (
      <MobileWorkspaceShell title="章节正文编辑" subtitle="章节正文编辑">
        <div className="rounded-3xl border border-dashed border-border/70 bg-background p-8 text-center text-sm text-muted-foreground">
          请选择一个章节后开始编辑正文。
        </div>
      </MobileWorkspaceShell>
    );
  }

  const chapterLabel = `第 ${props.chapter.order} 章`;
  const title = props.chapter.title?.trim() ? props.chapter.title : chapterLabel;

  return (
    <MobileWorkspaceShell
      title={title}
      subtitle="章节正文编辑"
      statusText="优先编辑正文；选中文字后可以让 AI 修改片段。"
      actions={(
        <Button type="button" size="sm" variant="outline" onClick={props.onBack}>
          返回
        </Button>
      )}
      contentClassName="mobile-page-chapter-edit mobile-chapter-editor-shell"
    >
      <div className="rounded-3xl border border-border/70 bg-background p-3 shadow-sm">
        <ChapterEditorShell {...props} />
      </div>
    </MobileWorkspaceShell>
  );
}
