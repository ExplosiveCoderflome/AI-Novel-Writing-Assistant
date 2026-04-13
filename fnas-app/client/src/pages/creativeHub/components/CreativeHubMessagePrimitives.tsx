import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  type ToolCallMessagePartProps,
  useThread,
} from "@assistant-ui/react";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import CreativeHubInlineToolCall from "./CreativeHubInlineToolCall";

function BranchControls() {
  const canEdit = useThread((thread) => thread.capabilities.edit);
  if (!canEdit) {
    return null;
  }
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600"
    >
      <BranchPickerPrimitive.Previous asChild>
        <button type="button" className="rounded-full px-1 transition hover:bg-slate-200">
          上一支
        </button>
      </BranchPickerPrimitive.Previous>
      <span className="tabular-nums">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <button type="button" className="rounded-full px-1 transition hover:bg-slate-200">
          下一支
        </button>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

function UserMessageActions() {
  const canEdit = useThread((thread) => thread.capabilities.edit);
  if (!canEdit) {
    return null;
  }
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="mt-2 flex justify-end gap-2"
    >
      <ActionBarPrimitive.Edit asChild>
        <button
          type="button"
          className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 transition hover:bg-slate-50"
        >
          编辑
        </button>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
}

function AssistantMessageActions() {
  const canReload = useThread((thread) => thread.capabilities.reload);
  if (!canReload) {
    return null;
  }
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="mt-2 flex gap-2"
    >
      <ActionBarPrimitive.Reload asChild>
        <button
          type="button"
          className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 transition hover:bg-slate-50"
        >
          重新生成
        </button>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
}

export function CreativeHubUserMessage() {
  return (
    <MessagePrimitive.If hasContent>
      <MessagePrimitive.Root className="ml-auto max-w-[88%]">
        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-slate-50 shadow-sm">
          <MessagePrimitive.Parts
            components={{
              Text: ({ text }: { text: string }) => (
                <div className="text-sm leading-6">
                  <MarkdownViewer content={text} />
                </div>
              ),
            }}
          />
        </div>
        <UserMessageActions />
        <BranchControls />
      </MessagePrimitive.Root>
    </MessagePrimitive.If>
  );
}

export function CreativeHubAssistantMessage() {
  return (
    <MessagePrimitive.If hasContent>
      <MessagePrimitive.Root className="mr-auto max-w-[88%]">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm">
          <MessagePrimitive.Parts
            components={{
              Text: ({ text }: { text: string }) => (
                <div className="text-sm leading-6">
                  <MarkdownViewer content={text} />
                </div>
              ),
              Reasoning: ({ text }: { text: string }) => (
                <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs">
                  <div className="mb-1 text-[11px] text-amber-700">推理过程</div>
                  <MarkdownViewer content={text} />
                </div>
              ),
              tools: {
                Fallback: (props: ToolCallMessagePartProps) => <CreativeHubInlineToolCall {...props} />,
              },
            }}
          />
        </div>
        <AssistantMessageActions />
        <BranchControls />
      </MessagePrimitive.Root>
    </MessagePrimitive.If>
  );
}

export function CreativeHubEditComposer() {
  return (
    <ComposerPrimitive.Root className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
      <ComposerPrimitive.Input
        className="min-h-[88px] w-full resize-none rounded-xl border border-amber-200 bg-white p-3 text-sm outline-none transition focus:border-amber-400"
        placeholder="编辑这条消息后生成新的分支"
        submitMode="enter"
      />
      <div className="mt-3 flex gap-2">
        <ComposerPrimitive.Cancel asChild>
          <button
            type="button"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            取消
          </button>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild>
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            发送新分支
          </button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}
