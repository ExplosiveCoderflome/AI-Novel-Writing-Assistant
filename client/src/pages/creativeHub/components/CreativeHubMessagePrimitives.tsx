import i18next from "i18next";
import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  type ToolCallMessagePartProps,
  useThread,
} from "@assistant-ui/react";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import { Button } from "@/components/ui/button";
import CreativeHubInlineToolCall from "./CreativeHubInlineToolCall";
import { useCreativeHubInlineControls } from "./CreativeHubInlineControlsContext";

function BranchControls() {
  const canEdit = useThread((thread) => thread.capabilities.edit);
  const { actionDisabled } = useCreativeHubInlineControls();
  if (!canEdit) {
    return null;
  }
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground"
    >
      <BranchPickerPrimitive.Previous asChild>
        <Button type="button" size="sm" variant="ghost" className="h-6 px-1 text-[11px]" disabled={actionDisabled}>
          {i18next.t("creativeHub.prevBranch", "上一支")}
        </Button>
      </BranchPickerPrimitive.Previous>
      <span className="tabular-nums">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <Button type="button" size="sm" variant="ghost" className="h-6 px-1 text-[11px]" disabled={actionDisabled}>
          {i18next.t("creativeHub.nextBranch", "下一支")}
        </Button>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

function UserMessageActions() {
  const canEdit = useThread((thread) => thread.capabilities.edit);
  const { actionDisabled } = useCreativeHubInlineControls();
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
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={actionDisabled}>
          {i18next.t("creativeHub.edit", "编辑")}
        </Button>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
}

function AssistantMessageActions() {
  const canReload = useThread((thread) => thread.capabilities.reload);
  const { actionDisabled } = useCreativeHubInlineControls();
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
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={actionDisabled}>
          {i18next.t("creativeHub.regenerate", "重新生成")}
        </Button>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
}

export function CreativeHubUserMessage() {
  return (
    <MessagePrimitive.If hasContent>
      <MessagePrimitive.Root className="ml-auto max-w-[88%]">
        <div className="rounded-md bg-primary px-4 py-3 text-primary-foreground">
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
        <div className="rounded-md border border-border bg-card px-4 py-3 text-card-foreground">
          <MessagePrimitive.Parts
            components={{
              Text: ({ text }: { text: string }) => (
                <div className="text-sm leading-6">
                  <MarkdownViewer content={text} />
                </div>
              ),
              Reasoning: ({ text }: { text: string }) => (
                <div className="mb-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
                  <div className="mb-1 text-[11px] text-warning">{i18next.t("dict.gen_3d1dec1f")}</div>
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
  const { actionDisabled } = useCreativeHubInlineControls();
  return (
    <ComposerPrimitive.Root className="mt-3 rounded-md border border-info/30 bg-info/5 p-3">
      <ComposerPrimitive.Input
        className="min-h-[88px] w-full resize-none rounded-md border border-input bg-background p-3 text-base outline-none transition focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
        placeholder={i18next.t("dict.gen_6402b0c3")}
        submitMode="enter"
        disabled={actionDisabled}
        aria-label={i18next.t("creativeHub.creativeHubMessagePrimitives.f52zsc")}
      />
      <div className="mt-3 flex gap-2">
        <ComposerPrimitive.Cancel asChild>
          <Button type="button" size="sm" variant="outline" disabled={actionDisabled}>{i18next.t("common.cancel")}</Button>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild>
          <Button type="button" size="sm" disabled={actionDisabled}>{i18next.t("creativeHub.creativeHubMessagePrimitives.8ugxbr")}</Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}
