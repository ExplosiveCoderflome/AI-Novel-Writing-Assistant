import { randomUUID } from "node:crypto";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { outlineImportParsePrompt } from "../../../../prompting/prompts/outline/outline.prompts";
import { validateOutlineDocument, createEmptyOutlineDocument } from "../domain/outlineDocument";
import { OutlineRepository } from "../infrastructure/OutlineRepository";
import { importOutlineJson } from "./OutlineTransferService";

interface Preview { userId: string; expiresAt: number; title: string; document: unknown; sourceText: string; unclassified: string[]; coverage: Array<{ start: number; end: number; text: string }>; }
const previews = new Map<string, Preview>();

export class OutlineImportPreviewService {
  constructor(private readonly repository: OutlineRepository, private readonly ttlMs = 15 * 60_000) {}
  async preview(userId: string, title: string, text: string, format: "markdown" | "text") {
    const fragments = text.match(/[\s\S]{1,12000}/g) ?? [];
    const outputs: Array<{ nodes: Array<{ clientRef: string; title: string; summary: string; planningDepth: "rough" | "detailed"; nodeType: "volume" | "chapter" | "character" | "payoff" | "fact"; parentRef?: string; sourceFragment: string }>; unclassifiedFragments: string[] }> = [];
    let cursor = 0;
    for (let index = 0; index < fragments.length; index++) {
      const { output } = await runStructuredPrompt({ asset: outlineImportParsePrompt, promptInput: { text: fragments[index], format, chunkIndex: index + 1, chunkCount: fragments.length } });
      outputs.push(output);
      cursor += fragments[index].length;
    }
    const document = createEmptyOutlineDocument(title);
    const refs = new Map<string,string>();
    const coverage: Preview["coverage"] = [];
    let offset = 0;
    for (const item of outputs.flatMap(x=>x.nodes)) {
      refs.set(item.clientRef, randomUUID());
      const start = text.indexOf(item.sourceFragment, offset);
      if (item.sourceFragment && start >= 0) { coverage.push({ start, end: start + item.sourceFragment.length, text: item.sourceFragment }); offset = start + item.sourceFragment.length; }
    }
    const volumes = outputs.flatMap(x=>x.nodes).filter(x=>x.nodeType==="volume");
    document.volumes = volumes.map((x,order)=>({ nodeId: refs.get(x.clientRef)!, title: x.title, order, planningDepth: x.planningDepth, summary: x.summary, chapterNodeIds: [] }));
    const volumeFor = new Map<string,string>();
    for (const item of outputs.flatMap(x=>x.nodes)) if (item.nodeType === "volume") volumeFor.set(item.clientRef, refs.get(item.clientRef)!);
    let chapterOrder = 0;
    document.chapters = outputs.flatMap(x=>x.nodes).filter(x=>x.nodeType==="chapter").map(x=>({ nodeId: refs.get(x.clientRef)!, volumeNodeId: volumeFor.get(x.parentRef ?? "") ?? document.volumes[0]?.nodeId ?? "", title: x.title, order: chapterOrder++, planningDepth: x.planningDepth, summary: x.summary, characterNodeIds: [], payoffNodeIds: [] })).filter(x=>!!x.volumeNodeId);
    document.volumes.forEach(v=>v.chapterNodeIds=document.chapters.filter(c=>c.volumeNodeId===v.nodeId).map(c=>c.nodeId));
    for (const item of outputs.flatMap(x=>x.nodes)) {
      if (item.nodeType === "character") document.characters.push({ nodeId: refs.get(item.clientRef)!, name: item.title, role: item.summary, appearanceNodeIds: [] });
      if (item.nodeType === "payoff") document.payoffs.push({ nodeId: refs.get(item.clientRef)!, title: item.title, kind: "other", setupDescription: item.summary, payoffDescription: "", setupChapterNodeIds: [], payoffChapterNodeIds: [], relatedNodeIds: [] });
      if (item.nodeType === "fact") document.facts.push({ nodeId: refs.get(item.clientRef)!, title: item.title, content: item.summary, scope: { type: "story" }, relatedNodeIds: [], immutable: false });
    }
    validateOutlineDocument(document);
    const token = randomUUID();
    const unclassified = outputs.flatMap(x=>x.unclassifiedFragments);
    previews.set(token, { userId, expiresAt: Date.now()+this.ttlMs, title, document, sourceText: text, unclassified, coverage });
    return { token, document, unclassified, coverage, sourceLength: text.length, coveredLength: coverage.reduce((n,x)=>n+x.end-x.start,0) };
  }
  async confirm(userId: string, token: string, target: { projectId?: string; expectedVersion?: number }) {
    const preview = previews.get(token);
    if (!preview || preview.userId !== userId || preview.expiresAt < Date.now()) throw new Error("导入预览已失效，请重新解析");
    const document = validateOutlineDocument(preview.document);
    previews.delete(token);
    if (target.projectId) {
      if (target.expectedVersion === undefined) throw new Error("缺少大纲版本号");
      return this.repository.saveImport(target.projectId, target.expectedVersion, document, preview.sourceText);
    }
    return this.repository.createImport(preview.title, document, preview.sourceText);
  }
  async importJson(input: string, target: { projectId?: string; expectedVersion?: number }) {
    const { title, document } = importOutlineJson(input);
    if (target.projectId) {
      if (target.expectedVersion === undefined) throw new Error("缺少大纲版本号");
      return this.repository.saveImport(target.projectId, target.expectedVersion, document, input);
    }
    return this.repository.createImport(title, document, input);
  }
}
