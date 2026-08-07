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

export default function StreamOutput({ isStreaming, content, onAbort, title = "AI output", emptyText = "Waiting for streaming output..." }: StreamOutputProps) {
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
            <span className="text-xs text-muted-foreground">Generating...</span>
          ) : (
            <span className="text-xs text-muted-foreground">Word count:{wordCount}</span>
          )}
          {isStreaming && onAbort ? (
            <Button size="sm" variant="secondary" onClick={onAbort}>
              Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                      </Button>
          ) : null}
        </div>
      </div>

      <MarkdownViewer content={content || emptyText} />
    </motion.div>
  );
}
