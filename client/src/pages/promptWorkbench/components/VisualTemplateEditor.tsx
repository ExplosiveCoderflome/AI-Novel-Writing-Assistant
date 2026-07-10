import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import type { Descendant, Value } from "platejs";
import { createSlatePlugin } from "platejs";
import { ParagraphPlugin, Plate, PlateContent, usePlateEditor } from "platejs/react";
import { Code2, LockKeyhole, ShieldAlert, Sparkles, Tags } from "lucide-react";
import type {
  PromptTemplateReferenceCatalog,
  PromptTemplateReferenceItem,
} from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  PROMPT_TOKEN_ELEMENT_TYPE,
  createTemplateTokenNode,
  labelTemplateReferenceItem,
  normalizeEditorValuePayload,
  parseTemplateToEditorValue,
  serializeEditorValueToTemplate,
  type PromptTemplateTokenNode,
} from "../templateTokenEditor";

export type TemplateRole = "system" | "human";

const PromptTokenPlugin = createSlatePlugin({
  key: PROMPT_TOKEN_ELEMENT_TYPE,
  node: {
    isInline: true,
    isVoid: true,
  },
});

const REFERENCE_GROUP_LABELS: Record<PromptTemplateReferenceItem["group"], string> = {
  required_context: "必需上下文",
  optional_context: "可选上下文",
  input: "运行变量",
  slot: "槽位",
};

function groupReferences(items: PromptTemplateReferenceItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (!normalized) return true;
    const displayLabel = labelTemplateReferenceItem(item);
    return [item.key, displayLabel, item.label, item.token, item.description ?? ""]
      .join("\n")
      .toLowerCase()
      .includes(normalized);
  });
  return (["required_context", "optional_context", "input", "slot"] as const).map((group) => ({
    group,
    items: filtered.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);
}

function TokenMenu(props: {
  items: PromptTemplateReferenceItem[];
  query: string;
  onQueryChange: (value: string) => void;
  onInsert: (item: PromptTemplateReferenceItem) => void;
  onClose: () => void;
}) {
  const grouped = groupReferences(props.items, props.query);
  return (
    <div className="rounded-md border border-[#cbdad6] bg-white shadow-[0_18px_40px_rgba(20,54,48,0.16)]">
      <div className="border-b border-[#dce8e4] p-2">
        <Input
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="搜索上下文、变量或槽位"
          className="h-8 border-[#cbdad6]"
        />
      </div>
      <div className="max-h-80 overflow-auto p-2">
        {grouped.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">没有可插入的引用。</div>
        ) : grouped.map((section) => (
          <div key={section.group} className="mb-2 last:mb-0">
            <div className="px-2 pb-1 text-[11px] font-semibold text-[#52606d]">
              {REFERENCE_GROUP_LABELS[section.group]}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const displayLabel = labelTemplateReferenceItem(item);
                return (
                  <button
                    key={`${section.group}:${item.key}`}
                    type="button"
                    onClick={() => props.onInsert(item)}
                    className="w-full rounded-md px-2 py-2 text-left hover:bg-[#eef7f4]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[#25443f]">{displayLabel}</span>
                      {item.required ? (
                        <span className="rounded-md bg-[#eaf7f2] px-1.5 py-0.5 text-[11px] text-[#0f766e]">
                          必需
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">{item.token}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#dce8e4] p-2 text-right">
        <Button type="button" variant="ghost" size="sm" onClick={props.onClose}>
          关闭
        </Button>
      </div>
    </div>
  );
}

function tokenToneClassName(node: PromptTemplateTokenNode) {
  if (node.unknown) {
    return "border-[#ef9a9a] bg-[#fff5f5] text-[#9f1239]";
  }
  if (node.kind === "input") {
    return "border-[#bfd5f6] bg-[#edf5ff] text-[#24518f]";
  }
  if (node.kind === "slot") {
    return "border-[#ead49c] bg-[#fff8df] text-[#7a5413]";
  }
  if (node.required && node.hasPreviewBlock === false) {
    return "border-[#e5b65c] bg-[#fff8e7] text-[#77510f]";
  }
  return "border-[#acd7ca] bg-[#eaf7f2] text-[#0f5f59]";
}

function PromptTokenElement(props: {
  attributes: Record<string, unknown>;
  children: ReactNode;
  element: PromptTemplateTokenNode;
}) {
  const { attributes, children, element } = props;
  const keyText = element.kind === "unknown" ? element.key : `${element.kind}.${element.key}`;
  const title = [
    element.label,
    keyText,
    element.description,
    element.required ? "必需上下文" : "",
    element.hasPreviewBlock === false ? "当前预览未装配内容" : "",
  ].filter(Boolean).join("\n");

  return (
    <span
      {...attributes}
      contentEditable={false}
      title={title}
      className={cn(
        "mx-0.5 inline-flex max-w-full select-none items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline text-xs font-semibold leading-5 shadow-[0_1px_0_rgba(15,55,48,0.05)]",
        tokenToneClassName(element),
      )}
      data-prompt-token={element.token}
    >
      {element.unknown ? (
        <ShieldAlert className="h-3 w-3 shrink-0" />
      ) : element.required ? (
        <LockKeyhole className="h-3 w-3 shrink-0" />
      ) : (
        <Tags className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate">{element.label}</span>
      <span className="sr-only">{element.token}</span>
      {children}
    </span>
  );
}

function renderTemplateElement(props: {
  attributes: Record<string, unknown>;
  children: ReactNode;
  element: Descendant;
}) {
  if ("type" in props.element && props.element.type === PROMPT_TOKEN_ELEMENT_TYPE) {
    return (
      <PromptTokenElement
        attributes={props.attributes}
        element={props.element as unknown as PromptTemplateTokenNode}
      >
        {props.children}
      </PromptTokenElement>
    );
  }
  return <p {...props.attributes}>{props.children}</p>;
}

function TemplateSourceTextarea(props: {
  role: TemplateRole;
  label: string;
  value: string;
  disabled?: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  tokenItems: PromptTemplateReferenceItem[];
  tokenMenuRole: TemplateRole | null;
  tokenQuery: string;
  onTokenQueryChange: (value: string) => void;
  onOpenTokenMenu: (role: TemplateRole) => void;
  onCloseTokenMenu: () => void;
  onFocusRole: (role: TemplateRole) => void;
  onInsertToken: (token: string) => void;
  onChange: (value: string) => void;
  menuStyle?: CSSProperties;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "@") {
      event.preventDefault();
      props.onFocusRole(props.role);
      props.onOpenTokenMenu(props.role);
    }
  }

  return (
    <div className="relative rounded-md border border-[#d7e4e0] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e1ebe8] px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-[#25443f]">{props.label}</div>
          <div className="text-[11px] text-muted-foreground">源码调试视图会显示原始模板 token</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-[#b8d9d0] text-[#0f5f59]"
          onClick={() => props.onOpenTokenMenu(props.role)}
          disabled={props.disabled}
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          插入引用
        </Button>
      </div>
      <textarea
        ref={props.textareaRef}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onFocus={() => props.onFocusRole(props.role)}
        onKeyDown={handleKeyDown}
        disabled={props.disabled}
        spellCheck={false}
        className={cn(
          "min-h-[280px] w-full resize-y bg-white px-3 py-3 font-mono text-sm leading-6 outline-none",
          props.disabled && "cursor-not-allowed opacity-60",
        )}
      />
      {props.tokenMenuRole === props.role ? (
        <div className="absolute z-20 w-[360px] max-w-[calc(100%-24px)]" style={props.menuStyle ?? { right: 12, top: 56 }}>
          <TokenMenu
            items={props.tokenItems}
            query={props.tokenQuery}
            onQueryChange={props.onTokenQueryChange}
            onInsert={(item) => {
              props.onInsertToken(item.token);
              props.onCloseTokenMenu();
            }}
            onClose={props.onCloseTokenMenu}
          />
        </div>
      ) : null}
    </div>
  );
}

export function VisualTemplateEditor(props: {
  role: TemplateRole;
  label: string;
  value: string;
  disabled?: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  tokenItems: PromptTemplateReferenceItem[];
  tokenMenuRole: TemplateRole | null;
  tokenQuery: string;
  references: PromptTemplateReferenceCatalog | null;
  onTokenQueryChange: (value: string) => void;
  onOpenTokenMenu: (role: TemplateRole) => void;
  onCloseTokenMenu: () => void;
  onFocusRole: (role: TemplateRole) => void;
  onInsertToken: (token: string) => void;
  onChange: (value: string) => void;
}) {
  const [sourceMode, setSourceMode] = useState(false);
  const [editorSeed, setEditorSeed] = useState(0);
  const [internalText, setInternalText] = useState(props.value);
  const [referenceSignature, setReferenceSignature] = useState("");
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentReferenceSignature = useMemo(
    () => (props.references?.items ?? [])
      .map((item) => `${item.token}:${item.label}:${item.required ? "1" : "0"}:${item.hasPreviewBlock ? "1" : "0"}`)
      .join("|"),
    [props.references],
  );
  const [internalValue, setInternalValue] = useState<Value>(
    () => parseTemplateToEditorValue(props.value, props.references) as unknown as Value,
  );
  const editor = usePlateEditor(
    {
      plugins: [ParagraphPlugin, PromptTokenPlugin],
      value: internalValue,
    },
    [editorSeed],
  );

  useEffect(() => {
    if (props.value === internalText && currentReferenceSignature === referenceSignature) {
      return;
    }
    const nextValue = parseTemplateToEditorValue(props.value, props.references) as unknown as Value;
    setInternalText(props.value);
    setReferenceSignature(currentReferenceSignature);
    setInternalValue(nextValue);
    setEditorSeed((current) => current + 1);
  }, [currentReferenceSignature, internalText, props.references, props.value, referenceSignature]);

  const handleValueChange = useCallback((payload: unknown) => {
    const nextValue = normalizeEditorValuePayload(payload);
    const nextText = serializeEditorValueToTemplate(nextValue);
    if (nextText === internalText) {
      return;
    }
    setInternalValue(nextValue);
    setInternalText(nextText);
    props.onChange(nextText);
  }, [internalText, props]);

  const insertReference = useCallback((item: PromptTemplateReferenceItem) => {
    props.onFocusRole(props.role);
    if (sourceMode) {
      props.onInsertToken(item.token);
      return;
    }
    const tokenNode = createTemplateTokenNode(item);
    try {
      const transformApi = (editor as unknown as { tf?: { insertNodes?: (node: unknown) => void; focus?: () => void } }).tf;
      if (!transformApi?.insertNodes) {
        props.onChange(`${props.value}${item.token}`);
        return;
      }
      transformApi?.focus?.();
      transformApi.insertNodes(tokenNode);
      window.setTimeout(() => {
        const nextText = serializeEditorValueToTemplate(editor.children as Value);
        setInternalText(nextText);
        props.onChange(nextText);
      }, 0);
    } catch {
      props.onChange(`${props.value}${item.token}`);
    }
  }, [editor, props, sourceMode]);

  function placeMenuNearSelection() {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) {
      setMenuStyle(undefined);
      return;
    }
    const range = selection.getRangeAt(0);
    const selectionRect = range.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    if (selectionRect.width === 0 && selectionRect.height === 0) {
      setMenuStyle(undefined);
      return;
    }
    const menuWidth = 360;
    const left = Math.max(12, Math.min(selectionRect.left - rootRect.left, rootRect.width - menuWidth - 12));
    const top = Math.max(56, selectionRect.bottom - rootRect.top + 8);
    setMenuStyle({ left, top });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "@") {
      event.preventDefault();
      props.onFocusRole(props.role);
      placeMenuNearSelection();
      props.onOpenTokenMenu(props.role);
    }
  }

  const lineCount = Math.max(1, props.value.replace(/\r\n/g, "\n").split("\n").length);

  if (sourceMode) {
    return (
      <div className="space-y-2">
        <TemplateSourceTextarea
          {...props}
          onInsertToken={props.onInsertToken}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSourceMode(false)}
            className="text-[#0f5f59] hover:bg-[#eef7f4] hover:text-[#0f5f59]"
          >
            <Tags className="mr-1.5 h-3.5 w-3.5" />
            返回可视化编辑
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative rounded-md border border-[#d7e4e0] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e1ebe8] px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-[#25443f]">{props.label}</div>
          <div className="text-[11px] text-muted-foreground">输入 @ 可插入上下文、变量或槽位标签</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#cbdad6] text-[#52606d]"
            onClick={() => setSourceMode(true)}
            disabled={props.disabled}
          >
            <Code2 className="mr-1.5 h-3.5 w-3.5" />
            源码视图
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#b8d9d0] text-[#0f5f59]"
            onClick={() => {
              setMenuStyle(undefined);
              props.onOpenTokenMenu(props.role);
            }}
            disabled={props.disabled}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            插入引用
          </Button>
        </div>
      </div>
      <div className="flex min-h-0">
        <div className="w-12 shrink-0 select-none border-r border-[#dce8e4] bg-[#eef7f3] py-3 pr-2 text-right font-mono text-[11px] leading-7 text-[#6f8d86]">
          {Array.from({ length: lineCount }).map((_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          {editor ? (
            <Plate editor={editor} onValueChange={handleValueChange}>
              <PlateContent
                readOnly={props.disabled}
                placeholder="编排提示词内容，可插入上下文标签"
                renderElement={renderTemplateElement}
                onFocus={() => props.onFocusRole(props.role)}
                onKeyDown={handleKeyDown}
                className={cn(
                  "prose prose-sm min-h-[280px] max-w-none rounded-r-md px-4 py-4 text-sm leading-7 outline-none dark:prose-invert",
                  "break-words [&_p]:m-0 [&_p]:min-h-7 [&_p]:text-foreground",
                  props.disabled && "cursor-not-allowed opacity-70",
                )}
              />
            </Plate>
          ) : null}
        </div>
      </div>
      {props.tokenMenuRole === props.role ? (
        <div className="absolute z-20 w-[360px] max-w-[calc(100%-24px)]" style={menuStyle ?? { right: 12, top: 56 }}>
          <TokenMenu
            items={props.tokenItems}
            query={props.tokenQuery}
            onQueryChange={props.onTokenQueryChange}
            onInsert={(item) => {
              insertReference(item);
              props.onCloseTokenMenu();
            }}
            onClose={props.onCloseTokenMenu}
          />
        </div>
      ) : null}
    </div>
  );
}
