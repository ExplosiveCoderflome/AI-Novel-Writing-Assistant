import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import MarkdownViewer from "./MarkdownViewer";

interface StreamOutputProps {
  isStreaming: boolean;
  content: string;
  onAbort?: () => void;
  title?: string;
  emptyText?: string;
}

export default function StreamOutput({ isStreaming, content, onAbort, title = t("gen.components.common.StreamOutput.aiOutput"), emptyText = t("gen.components.common.StreamOutput.gen_56fb4083") }: StreamOutputProps) {
  const wordCount = content.trim().length;

  return (
    <motion.div
      className="min-w-0 w-full max-w-full overflow-hidden rounded-md border bg-card p-4"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <span className="text-xs text-muted-foreground">{t("gen.components.common.StreamOutput.gen_c422af87")}</span>
          ) : (
            <span className="text-xs text-muted-foreground">{t("gen.components.common.StreamOutput.gen_8cffe33c")}</span>
          )}
          {isStreaming && onAbort ? (
            <Button size="sm" variant="secondary" onClick={onAbort}>
              停止生成
            </Button>
          ) : null}
        </div>
      </div>

      <MarkdownViewer content={content || emptyText} />
    </motion.div>
  );
}
