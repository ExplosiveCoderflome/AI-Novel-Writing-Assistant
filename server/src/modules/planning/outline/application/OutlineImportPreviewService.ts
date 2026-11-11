import { randomUUID } from "node:crypto";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { outlineImportParsePrompt } from "../../../../prompting/prompts/outline/outline.prompts";
import { validateOutlineDocument, createEmptyOutlineDocument } from "../domain/outlineDocument";
import { OutlineRepository } from "../infrastructure/OutlineRepository";
import { importOutlineJson } from "./OutlineTransferService";

interface ImportNode {
  clientRef: string;
  title: string;
  summary: string;
  planningDepth: "rough" | "detailed";
  nodeType: "volume" | "chapter" | "character" | "payoff" | "fact";
  parentRef?: string;
  sourceFragment: string;
}

interface SourceCoverage {
  nodeId: string;
  clientRef: string;
  chunkIndex: number;
  start: number;
  end: number;
  text: string;
}

interface UnmatchedSource {
  nodeId: string;
  clientRef: string;
  chunkIndex: number;
  sourceFragment: string;
}

interface Preview {
  userId: string;
  expiresAt: number;
  title: string;
  document: unknown;
  sourceText: string;
  unclassified: string[];
  coverage: SourceCoverage[];
  unmatchedSources: UnmatchedSource[];
}

const previews = new Map<string, Preview>();

function countCoveredLength(coverage: SourceCoverage[]) {
  const ranges = [...coverage].sort((left, right) => left.start - right.start || left.end - right.end);
  let coveredLength = 0;
  let currentStart = -1;
  let currentEnd = -1;
  for (const range of ranges) {
    if (range.start > currentEnd) {
      if (currentEnd >= 0) coveredLength += currentEnd - currentStart;
      currentStart = range.start;
      currentEnd = range.end;
    } else {
      currentEnd = Math.max(currentEnd, range.end);
    }
  }
  return currentEnd >= 0 ? coveredLength + currentEnd - currentStart : 0;
}

export class OutlineImportPreviewService {
  constructor(private readonly repository: OutlineRepository, private readonly ttlMs = 15 * 60_000) {}
  async preview(userId: string, title: string, text: string, format: "markdown" | "text") {
    const fragments = text.match(/[\s\S]{1,12000}/g) ?? [];
    const outputs: Array<{ nodes: ImportNode[]; unclassifiedFragments: string[] }> = [];
    for (let index = 0; index < fragments.length; index++) {
      const { output } = await runStructuredPrompt({ asset: outlineImportParsePrompt, promptInput: { text: fragments[index], format, chunkIndex: index + 1, chunkCount: fragments.length } });
      outputs.push(output);
    }

    const nodes = outputs.flatMap((output, chunkIndex) => output.nodes.map(node => ({ node, chunkIndex })));
    const nodeIds = new Map<ImportNode, string>();
    const refs = new Map<string, string>();
    for (const { node } of nodes) {
      const nodeId = randomUUID();
      nodeIds.set(node, nodeId);
      refs.set(node.clientRef, nodeId);
    }

    let nextChunkStart = 0;
    const chunkStarts = fragments.map(fragment => {
      const start = nextChunkStart;
      nextChunkStart += fragment.length;
      return start;
    });
    const coverage: SourceCoverage[] = [];
    const unmatchedSources: UnmatchedSource[] = [];
    for (const { node, chunkIndex } of nodes) {
      const nodeId = nodeIds.get(node)!;
      const localStart = node.sourceFragment ? fragments[chunkIndex].indexOf(node.sourceFragment) : -1;
      if (localStart < 0) {
        unmatchedSources.push({ nodeId, clientRef: node.clientRef, chunkIndex: chunkIndex + 1, sourceFragment: node.sourceFragment });
        continue;
      }
      const start = chunkStarts[chunkIndex] + localStart;
      coverage.push({ nodeId, clientRef: node.clientRef, chunkIndex: chunkIndex + 1, start, end: start + node.sourceFragment.length, text: node.sourceFragment });
    }

    const document = createEmptyOutlineDocument(title);
    document.volumes = nodes.filter(item => item.node.nodeType === "volume").map(({ node }, order) => ({
      nodeId: nodeIds.get(node)!,
      title: node.title,
      order,
      planningDepth: node.planningDepth,
      summary: node.summary,
      chapterNodeIds: [],
    }));
    const volumeFor = new Map<string, string>();
    for (const { node } of nodes) {
      if (node.nodeType === "volume") volumeFor.set(node.clientRef, nodeIds.get(node)!);
    }
    let chapterOrder = 0;
    document.chapters = nodes.filter(item => item.node.nodeType === "chapter").map(({ node }) => ({
      nodeId: nodeIds.get(node)!,
      volumeNodeId: volumeFor.get(node.parentRef ?? "") ?? document.volumes[0]?.nodeId ?? "",
      title: node.title,
      order: chapterOrder++,
      planningDepth: node.planningDepth,
      summary: node.summary,
      characterNodeIds: [],
      payoffNodeIds: [],
    })).filter(chapter => !!chapter.volumeNodeId);
    document.volumes.forEach(volume => {
      volume.chapterNodeIds = document.chapters.filter(chapter => chapter.volumeNodeId === volume.nodeId).map(chapter => chapter.nodeId);
    });
    for (const { node } of nodes) {
      const nodeId = nodeIds.get(node)!;
      if (node.nodeType === "character") document.characters.push({ nodeId, name: node.title, role: node.summary, appearanceNodeIds: [] });
      if (node.nodeType === "payoff") document.payoffs.push({ nodeId, title: node.title, kind: "other", setupDescription: node.summary, payoffDescription: "", setupChapterNodeIds: [], payoffChapterNodeIds: [], relatedNodeIds: [] });
      if (node.nodeType === "fact") document.facts.push({ nodeId, title: node.title, content: node.summary, scope: { type: "story" }, relatedNodeIds: [], immutable: false });
    }
    validateOutlineDocument(document);

    const token = randomUUID();
    const unclassified = outputs.flatMap(output => output.unclassifiedFragments);
    previews.set(token, { userId, expiresAt: Date.now() + this.ttlMs, title, document, sourceText: text, unclassified, coverage, unmatchedSources });
    return { token, document, unclassified, coverage, unmatchedSources, sourceLength: text.length, coveredLength: countCoveredLength(coverage) };
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
