import { useState } from "react";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineImportPreview as OutlineImportPreviewData } from "@/api/outlines";
import { Button } from "@/components/ui/button";
import { findOutlineNodeTitle, getOutlineNodeTitle, type OutlineNode } from "./outlineNodes";
import {
  setImportChapterVolume,
  setImportReferences,
  toggleId,
  updateImportNodeTitle,
  type ImportReferenceCollection,
  type ImportReferenceField,
} from "./outlineImportEditing";

interface OutlineImportPreviewProps {
  preview: OutlineImportPreviewData;
  isConfirming: boolean;
  error?: unknown;
  onConfirm: (document: OutlineDocument) => void;
}

interface ReferenceOption {
  id: string;
  label: string;
}

const inputClassName = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const selectClassName = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function optionsFromNodes(nodes: OutlineNode[]): ReferenceOption[] {
  return nodes.map(node => ({ id: node.nodeId, label: getOutlineNodeTitle(node) }));
}

function ReferenceChecklist({ label, options, selectedIds, onChange }: {
  label: string;
  options: ReferenceOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
      {options.length ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {options.map(option => (
            <label key={option.id} className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-primary"
                checked={selectedIds.includes(option.id)}
                onChange={() => onChange(toggleId(selectedIds, option.id))}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : <p className="text-xs text-muted-foreground">暂无可关联的节点。</p>}
    </fieldset>
  );
}

function NodeTitleInput({ label, value, onChange }: { label: string; value: string; onChange: (title: string) => void }) {
  return <input aria-label={label} className={inputClassName} value={value} onChange={event => onChange(event.target.value)} />;
}

export function OutlineImportPreview({ preview, isConfirming, error, onConfirm }: OutlineImportPreviewProps) {
  const [document, setDocument] = useState<OutlineDocument>(preview.document);
  const chapterOptions = optionsFromNodes(document.chapters);
  const volumeOptions = optionsFromNodes(document.volumes);
  const characterOptions = optionsFromNodes(document.characters);
  const payoffOptions = optionsFromNodes(document.payoffs);
  const appearanceOptions = optionsFromNodes([...document.volumes, ...document.chapters]);
  const allNodeOptions = optionsFromNodes([
    document.story,
    ...document.volumes,
    ...document.chapters,
    ...document.characters,
    ...document.payoffs,
    ...document.facts,
  ]);

  const updateReferences = (
    collection: ImportReferenceCollection,
    nodeId: string,
    field: ImportReferenceField,
    referenceIds: string[],
  ) => setDocument(current => setImportReferences(current, collection, nodeId, field, referenceIds));

  const hasEmptyTitle = !document.story.title.trim()
    || document.volumes.some(node => !node.title.trim())
    || document.chapters.some(node => !node.title.trim())
    || document.characters.some(node => !node.name.trim())
    || document.payoffs.some(node => !node.title.trim())
    || document.facts.some(node => !node.title.trim());
  const hasInvalidFactScope = document.facts.some(fact => {
    if (fact.scope.type === "story") return false;
    if (!fact.scope.nodeId) return true;
    const candidates = fact.scope.type === "volume" ? document.volumes : document.chapters;
    return !candidates.some(node => node.nodeId === fact.scope.nodeId);
  });

  return (
    <section className="space-y-5 bg-muted/20 p-4" aria-label="导入结果确认">
      <div>
        <h3 className="font-medium">确认识别结果</h3>
        <p className="mt-1 text-sm text-muted-foreground">可调整标题、章节所属卷和节点引用。确认后才会创建大纲。</p>
      </div>
      <p className="text-sm">识别到 {document.volumes.length} 卷、{document.chapters.length} 章；{preview.unclassified.length} 段内容需要人工查看。</p>
      <p className="text-xs text-muted-foreground">原文共 {preview.sourceLength} 字符，节点来源覆盖 {preview.coveredLength} 字符。未覆盖和未匹配内容需要人工核对。</p>

      <label className="block space-y-1.5 text-sm text-muted-foreground">
        <span>大纲标题</span>
        <NodeTitleInput label="大纲标题" value={document.story.title} onChange={title => setDocument(current => ({ ...current, story: { ...current.story, title } }))} />
      </label>

      <section className="space-y-4">
        <h4 className="text-sm font-medium">卷与章节</h4>
        {document.volumes.map(volume => (
          <div key={volume.nodeId} className="space-y-3 bg-background/70 p-3">
            <NodeTitleInput
              label={`卷标题：${volume.title}`}
              value={volume.title}
              onChange={title => setDocument(current => updateImportNodeTitle(current, "volumes", volume.nodeId, title))}
            />
            <div className="ml-3 space-y-3 border-l border-border/50 pl-3">
              {document.chapters.filter(chapter => chapter.volumeNodeId === volume.nodeId).map(chapter => (
                <div key={chapter.nodeId} className="space-y-2">
                  <NodeTitleInput
                    label={`章节标题：${chapter.title}`}
                    value={chapter.title}
                    onChange={title => setDocument(current => updateImportNodeTitle(current, "chapters", chapter.nodeId, title))}
                  />
                  <label className="block space-y-1 text-xs text-muted-foreground">
                    <span>所属卷</span>
                    <select
                      className={selectClassName}
                      value={chapter.volumeNodeId}
                      onChange={event => setDocument(current => setImportChapterVolume(current, chapter.nodeId, event.target.value))}
                    >
                      {document.volumes.map(option => <option key={option.nodeId} value={option.nodeId}>{option.title}</option>)}
                    </select>
                  </label>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">调整人物与伏笔引用</summary>
                    <div className="mt-3 space-y-3">
                      <ReferenceChecklist label="关联人物" options={characterOptions} selectedIds={chapter.characterNodeIds} onChange={ids => updateReferences("chapters", chapter.nodeId, "characterNodeIds", ids)} />
                      <ReferenceChecklist label="关联伏笔与钩子" options={payoffOptions} selectedIds={chapter.payoffNodeIds} onChange={ids => updateReferences("chapters", chapter.nodeId, "payoffNodeIds", ids)} />
                    </div>
                  </details>
                </div>
              ))}
              {!volume.chapterNodeIds.length ? <p className="text-xs text-muted-foreground">这一卷还没有章节。</p> : null}
            </div>
          </div>
        ))}
      </section>

      {document.characters.length ? (
        <section className="space-y-3">
          <h4 className="text-sm font-medium">人物与出场位置</h4>
          {document.characters.map(character => (
            <div key={character.nodeId} className="space-y-2">
              <NodeTitleInput label={`人物姓名：${character.name}`} value={character.name} onChange={title => setDocument(current => updateImportNodeTitle(current, "characters", character.nodeId, title))} />
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">调整计划出场位置</summary>
                <ReferenceChecklist label="出场卷或章节" options={appearanceOptions} selectedIds={character.appearanceNodeIds} onChange={ids => updateReferences("characters", character.nodeId, "appearanceNodeIds", ids)} />
              </details>
            </div>
          ))}
        </section>
      ) : null}

      {document.payoffs.length ? (
        <section className="space-y-3">
          <h4 className="text-sm font-medium">伏笔与钩子</h4>
          {document.payoffs.map(payoff => (
            <div key={payoff.nodeId} className="space-y-2">
              <NodeTitleInput label={`伏笔标题：${payoff.title}`} value={payoff.title} onChange={title => setDocument(current => updateImportNodeTitle(current, "payoffs", payoff.nodeId, title))} />
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">调整埋设、回收与关联节点</summary>
                <div className="mt-3 space-y-3">
                  <ReferenceChecklist label="计划埋设章节" options={chapterOptions} selectedIds={payoff.setupChapterNodeIds} onChange={ids => updateReferences("payoffs", payoff.nodeId, "setupChapterNodeIds", ids)} />
                  <ReferenceChecklist label="计划回收章节" options={chapterOptions} selectedIds={payoff.payoffChapterNodeIds} onChange={ids => updateReferences("payoffs", payoff.nodeId, "payoffChapterNodeIds", ids)} />
                  <ReferenceChecklist label="其他关联节点" options={allNodeOptions.filter(option => option.id !== payoff.nodeId)} selectedIds={payoff.relatedNodeIds} onChange={ids => updateReferences("payoffs", payoff.nodeId, "relatedNodeIds", ids)} />
                </div>
              </details>
            </div>
          ))}
        </section>
      ) : null}

      {document.facts.length ? (
        <section className="space-y-3">
          <h4 className="text-sm font-medium">固定设定</h4>
          {document.facts.map(fact => (
            <div key={fact.nodeId} className="space-y-2">
              <NodeTitleInput label={`设定标题：${fact.title}`} value={fact.title} onChange={title => setDocument(current => updateImportNodeTitle(current, "facts", fact.nodeId, title))} />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>适用范围</span>
                  <select
                    className={selectClassName}
                    value={fact.scope.type}
                    onChange={event => {
                      const type = event.target.value as "story" | "volume" | "chapter";
                      setDocument(current => ({
                        ...current,
                        facts: current.facts.map(item => item.nodeId === fact.nodeId ? { ...item, scope: { type } } : item),
                      }));
                    }}
                  >
                    <option value="story">全书</option>
                    <option value="volume">指定卷</option>
                    <option value="chapter">指定章节</option>
                  </select>
                </label>
                {fact.scope.type !== "story" ? (
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>{fact.scope.type === "volume" ? "选择卷" : "选择章节"}</span>
                    <select
                      className={selectClassName}
                      value={fact.scope.nodeId ?? ""}
                      onChange={event => setDocument(current => ({
                        ...current,
                        facts: current.facts.map(item => item.nodeId === fact.nodeId ? { ...item, scope: { type: fact.scope.type, nodeId: event.target.value } } : item),
                      }))}
                    >
                      <option value="" disabled>请选择</option>
                      {(fact.scope.type === "volume" ? document.volumes : document.chapters).map(node => <option key={node.nodeId} value={node.nodeId}>{node.title}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">调整关联节点</summary>
                <ReferenceChecklist label="关联节点" options={allNodeOptions.filter(option => option.id !== fact.nodeId)} selectedIds={fact.relatedNodeIds} onChange={ids => updateReferences("facts", fact.nodeId, "relatedNodeIds", ids)} />
              </details>
            </div>
          ))}
        </section>
      ) : null}

      {preview.unclassified.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">查看未分类原文（{preview.unclassified.length}）</summary>
          <div className="mt-3 space-y-2">{preview.unclassified.map((item, index) => <p key={index} className="whitespace-pre-wrap bg-muted/40 p-3 text-xs text-muted-foreground">{item}</p>)}</div>
        </details>
      ) : null}
      {preview.unmatchedSources.length ? <p role="alert" className="text-sm text-destructive">{preview.unmatchedSources.length} 个节点没有匹配到对应原文，请返回原文核对后再确认。</p> : null}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">核对节点与来源片段</summary>
        <ul className="mt-3 space-y-3">
          {preview.coverage.map(item => (
            <li key={`${item.nodeId}-${item.start}-${item.end}`}>
              <p className="font-medium">{findOutlineNodeTitle(document, item.nodeId)}</p>
              <p className="mt-1 text-xs text-muted-foreground">原文位置 {item.start + 1}–{item.end}</p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap bg-muted/50 p-3 text-xs text-muted-foreground">{item.text}</pre>
            </li>
          ))}
        </ul>
      </details>

      {hasEmptyTitle ? <p role="alert" className="text-sm text-destructive">请为大纲和每个节点填写标题后再确认。</p> : null}
      {hasInvalidFactScope ? <p role="alert" className="text-sm text-destructive">请为指定范围的固定设定选择对应的卷或章节。</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "导入确认失败，请重试。"}</p> : null}
      <Button onClick={() => onConfirm(document)} disabled={isConfirming || hasEmptyTitle || hasInvalidFactScope}>{isConfirming ? "正在创建大纲…" : "确认创建大纲"}</Button>
    </section>
  );
}
