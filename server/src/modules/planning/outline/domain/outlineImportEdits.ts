import { validateOutlineDocument, type OutlineDocument } from "./outlineDocument";

const editableCollections = ["volumes", "chapters", "characters", "payoffs", "facts"] as const;

function assertSameNodeIds(original: OutlineDocument, edited: OutlineDocument) {
  if (original.story.nodeId !== edited.story.nodeId) throw new Error("导入确认不能替换总纲节点 ID");
  for (const collection of editableCollections) {
    const originalIds = original[collection].map(node => node.nodeId);
    const editedIds = new Set(edited[collection].map(node => node.nodeId));
    if (originalIds.length !== editedIds.size || originalIds.some(nodeId => !editedIds.has(nodeId))) {
      throw new Error("导入确认只能调整解析出的节点，不能增删节点或替换节点 ID");
    }
  }
}

function unique(ids: string[]) {
  return [...new Set(ids)];
}

function assertTargets(ids: string[], allowed: Set<string>, label: string) {
  for (const nodeId of ids) if (!allowed.has(nodeId)) throw new Error(`${label}包含无效的节点引用`);
}

export function applyOutlineImportEdits(originalInput: unknown, editedInput: unknown): OutlineDocument {
  const original = validateOutlineDocument(originalInput);
  const edited = validateOutlineDocument(editedInput);
  assertSameNodeIds(original, edited);

  const volumes: OutlineDocument["volumes"] = original.volumes.map(volume => ({
    ...volume,
    title: edited.volumes.find(item => item.nodeId === volume.nodeId)!.title,
    chapterNodeIds: [],
  }));
  const chapters = original.chapters.map(chapter => {
    const next = edited.chapters.find(item => item.nodeId === chapter.nodeId)!;
    return {
      ...chapter,
      title: next.title,
      volumeNodeId: next.volumeNodeId,
      characterNodeIds: unique(next.characterNodeIds),
      payoffNodeIds: unique(next.payoffNodeIds),
    };
  });
  const characters = original.characters.map(character => {
    const next = edited.characters.find(item => item.nodeId === character.nodeId)!;
    return { ...character, name: next.name, appearanceNodeIds: unique(next.appearanceNodeIds) };
  });
  const payoffs = original.payoffs.map(payoff => {
    const next = edited.payoffs.find(item => item.nodeId === payoff.nodeId)!;
    return {
      ...payoff,
      title: next.title,
      setupChapterNodeIds: unique(next.setupChapterNodeIds),
      payoffChapterNodeIds: unique(next.payoffChapterNodeIds),
      relatedNodeIds: unique(next.relatedNodeIds),
    };
  });
  const facts = original.facts.map(fact => {
    const next = edited.facts.find(item => item.nodeId === fact.nodeId)!;
    return {
      ...fact,
      title: next.title,
      scope: { ...next.scope },
      relatedNodeIds: unique(next.relatedNodeIds),
    };
  });

  const volumeIds = new Set(volumes.map(node => node.nodeId));
  const chapterIds = new Set(chapters.map(node => node.nodeId));
  const characterIds = new Set(characters.map(node => node.nodeId));
  const payoffIds = new Set(payoffs.map(node => node.nodeId));
  const allNodeIds = new Set([
    original.story.nodeId,
    ...volumeIds,
    ...chapterIds,
    ...characterIds,
    ...payoffIds,
    ...facts.map(node => node.nodeId),
  ]);
  for (const chapter of chapters) {
    if (!volumeIds.has(chapter.volumeNodeId)) throw new Error("章节必须归属到一个已解析的卷");
    assertTargets(chapter.characterNodeIds, characterIds, "章节人物");
    assertTargets(chapter.payoffNodeIds, payoffIds, "章节伏笔");
  }
  for (const character of characters) assertTargets(character.appearanceNodeIds, new Set([...volumeIds, ...chapterIds]), "人物出场位置");
  for (const payoff of payoffs) {
    assertTargets(payoff.setupChapterNodeIds, chapterIds, "伏笔埋设章节");
    assertTargets(payoff.payoffChapterNodeIds, chapterIds, "伏笔回收章节");
    assertTargets(payoff.relatedNodeIds, allNodeIds, "伏笔关联节点");
  }
  for (const fact of facts) {
    assertTargets(fact.relatedNodeIds, allNodeIds, "设定关联节点");
    if (fact.scope.type === "volume" && (!fact.scope.nodeId || !volumeIds.has(fact.scope.nodeId))) throw new Error("固定设定的卷范围无效");
    if (fact.scope.type === "chapter" && (!fact.scope.nodeId || !chapterIds.has(fact.scope.nodeId))) throw new Error("固定设定的章节范围无效");
    if (fact.scope.type === "story") delete fact.scope.nodeId;
  }

  for (const volume of volumes) {
    volume.chapterNodeIds = chapters.filter(chapter => chapter.volumeNodeId === volume.nodeId).map(chapter => chapter.nodeId);
  }
  return validateOutlineDocument({
    ...original,
    story: { ...original.story, title: edited.story.title },
    volumes,
    chapters,
    characters,
    payoffs,
    facts,
  });
}
