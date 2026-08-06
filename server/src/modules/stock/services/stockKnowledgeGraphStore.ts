import { prisma } from "../../../db/prisma";
import { StockKnowledgeGraphItem, KnowledgeGraphEntityNode, KnowledgeGraphRelationEdge } from "../types/stockTypes";

export class StockKnowledgeGraphStoreService {
  /**
   * 从数据库获取特定股票的专属知识图谱记录 (Stock-specific KG from DB)
   */
  public async getKnowledgeGraph(portfolioId: string, symbol: string): Promise<StockKnowledgeGraphItem | null> {
    const symbolUpper = symbol.toUpperCase();
    const record = await prisma.stockKnowledgeGraphStore.findUnique({
      where: {
        portfolioId_symbol: {
          portfolioId,
          symbol: symbolUpper,
        },
      },
    });

    if (!record) return null;

    let nodes: KnowledgeGraphEntityNode[] = [];
    let edges: KnowledgeGraphRelationEdge[] = [];
    let newsCatalysts: string[] = [];

    try { nodes = JSON.parse(record.nodesJson || "[]"); } catch (e) {}
    try { edges = JSON.parse(record.edgesJson || "[]"); } catch (e) {}
    try { newsCatalysts = JSON.parse(record.newsCatalystsJson || "[]"); } catch (e) {}

    return {
      symbol: symbolUpper,
      companyName: symbolUpper,
      positionCategory: "EXISTING",
      industrySector: "数据库持久化知识图谱",
      nodes,
      edges,
      newsCatalysts,
      actionAdvice: "HOLD",
      guidanceText: record.guidanceText || `已成功从数据库加载 ${symbolUpper} 专属知识图谱`,
    };
  }

  /**
   * 将每日 AI/OpenD/网络搜索 蒸馏产生的股票图谱持久化保存至数据库
   */
  public async upsertKnowledgeGraph(portfolioId: string, item: StockKnowledgeGraphItem): Promise<void> {
    const symbolUpper = item.symbol.toUpperCase();

    // 先查询现有 DB 记录，合并用户人工修改过的自定义节点 (Preserve Custom Nodes Across Daily Updates)
    const existing = await prisma.stockKnowledgeGraphStore.findUnique({
      where: { portfolioId_symbol: { portfolioId, symbol: symbolUpper } },
    });

    let mergedNodes = item.nodes || [];
    let mergedEdges = item.edges || [];

    if (existing) {
      try {
        const existingNodes: KnowledgeGraphEntityNode[] = JSON.parse(existing.nodesJson || "[]");
        const existingEdges: KnowledgeGraphRelationEdge[] = JSON.parse(existing.edgesJson || "[]");
        
        // 保留 ID 带有 "CUSTOM_" 的人工修改实体节点与关系边
        const customNodes = existingNodes.filter((n) => n.id.startsWith("CUSTOM_"));
        const customEdges = existingEdges.filter((e) => e.target.startsWith("CUSTOM_") || e.source.startsWith("CUSTOM_"));

        customNodes.forEach((cn) => {
          if (!mergedNodes.some((n) => n.id === cn.id)) mergedNodes.push(cn);
        });
        customEdges.forEach((ce) => {
          if (!mergedEdges.some((e) => e.source === ce.source && e.target === ce.target)) mergedEdges.push(ce);
        });
      } catch (e) {
        console.warn("[StockKnowledgeGraphStore] Failed to merge existing custom nodes:", e);
      }
    }

    await prisma.stockKnowledgeGraphStore.upsert({
      where: {
        portfolioId_symbol: {
          portfolioId,
          symbol: symbolUpper,
        },
      },
      create: {
        portfolioId,
        symbol: symbolUpper,
        nodesJson: JSON.stringify(mergedNodes),
        edgesJson: JSON.stringify(mergedEdges),
        newsCatalystsJson: JSON.stringify(item.newsCatalysts || []),
        guidanceText: item.guidanceText,
      },
      update: {
        nodesJson: JSON.stringify(mergedNodes),
        edgesJson: JSON.stringify(mergedEdges),
        newsCatalystsJson: JSON.stringify(item.newsCatalysts || []),
        guidanceText: item.guidanceText,
      },
    });
  }

  /**
   * 保存用户在前端发起的【人工修改图谱】至数据库
   */
  public async addCustomEntityToDb(
    portfolioId: string,
    symbol: string,
    newNode: KnowledgeGraphEntityNode,
    newEdge: KnowledgeGraphRelationEdge
  ): Promise<StockKnowledgeGraphItem> {
    const symbolUpper = symbol.toUpperCase();
    const existingRecord = await this.getKnowledgeGraph(portfolioId, symbolUpper);

    const nodes = existingRecord?.nodes || [
      { id: symbolUpper, name: symbolUpper, type: "ROOT_STOCK", marketSymbol: symbolUpper },
    ];
    const edges = existingRecord?.edges || [];
    const newsCatalysts = existingRecord?.newsCatalysts || [];

    if (!nodes.some((n) => n.id === newNode.id)) {
      nodes.push(newNode);
    }
    if (!edges.some((e) => e.source === newEdge.source && e.target === newEdge.target)) {
      edges.push(newEdge);
    }

    const updatedItem: StockKnowledgeGraphItem = {
      symbol: symbolUpper,
      companyName: existingRecord?.companyName || symbolUpper,
      positionCategory: existingRecord?.positionCategory || "EXISTING",
      industrySector: existingRecord?.industrySector || "美股研判资产",
      nodes,
      edges,
      newsCatalysts,
      actionAdvice: "HOLD",
      guidanceText: `包含人工编辑修改的数据库专属图谱 (${symbolUpper})`,
    };

    await this.upsertKnowledgeGraph(portfolioId, updatedItem);
    return updatedItem;
  }
}

export const stockKnowledgeGraphStoreService = new StockKnowledgeGraphStoreService();
