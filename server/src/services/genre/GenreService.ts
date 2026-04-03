import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import type { GenreTreeDraft } from "./genreGenerate";

export interface GenreTreeNode {
  id: string;
  name: string;
  description: string | null;
  template: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  childCount: number;
  novelCount: number;
  children: GenreTreeNode[];
}

export interface CreateGenreTreeInput {
  name: string;
  description?: string;
  template?: string;
  parentId?: string | null;
  children?: CreateGenreTreeNodeInput[];
}

export interface CreateGenreTreeNodeInput {
  name: string;
  description?: string;
  template?: string;
  children?: CreateGenreTreeNodeInput[];
}

export interface UpdateGenreInput {
  name?: string;
  description?: string | null;
  template?: string | null;
  parentId?: string | null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeRequiredName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("类型名称不能为空。", 400);
  }
  return trimmed;
}

function validateDraftSubtree(draft: GenreTreeDraft, depth = 1): void {
  if (depth > 3) {
    throw new AppError("类型树最多支持 3 级结构。", 400);
  }

  const seen = new Set<string>();
  for (const child of draft.children) {
    const key = child.name.trim().toLocaleLowerCase("zh-CN");
    if (seen.has(key)) {
      throw new AppError(`同一级下存在重复的类型名称：${child.name}。`, 400);
    }
    seen.add(key);
    validateDraftSubtree(child, depth + 1);
  }
}

function normalizeDraft(input: CreateGenreTreeNodeInput): GenreTreeDraft & { template?: string } {
  return {
    name: normalizeRequiredName(input.name),
    description: normalizeOptionalText(input.description) ?? undefined,
    template: normalizeOptionalText(input.template) ?? undefined,
    children: (input.children ?? []).map((child) => normalizeDraft(child)),
  };
}

function sortTree(nodes: GenreTreeNode[]): GenreTreeNode[] {
  nodes.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  for (const node of nodes) {
    sortTree(node.children);
  }
  return nodes;
}

function collectSubtreeRows<T extends { id: string; parentId: string | null }>(
  rows: T[],
  rootId: string,
): T[] {
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  if (!rowMap.has(rootId)) {
    return [];
  }

  const childrenByParent = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.parentId) {
      continue;
    }
    const siblings = childrenByParent.get(row.parentId) ?? [];
    siblings.push(row);
    childrenByParent.set(row.parentId, siblings);
  }

  const subtree: T[] = [];
  const visit = (nodeId: string) => {
    for (const child of childrenByParent.get(nodeId) ?? []) {
      visit(child.id);
    }
    const current = rowMap.get(nodeId);
    if (current) {
      subtree.push(current);
    }
  };

  visit(rootId);
  return subtree;
}

export class GenreService {
  async listGenreTree(): Promise<GenreTreeNode[]> {
    const rows = await prisma.novelGenre.findMany({
      include: {
        _count: {
          select: {
            children: true,
            novels: true,
          },
        },
      },
      orderBy: [{ name: "asc" }],
    });

    const nodeMap = new Map<string, GenreTreeNode>();
    for (const row of rows) {
      nodeMap.set(row.id, {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        template: row.template ?? null,
        parentId: row.parentId ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        childCount: row._count.children,
        novelCount: row._count.novels,
        children: [],
      });
    }

    const roots: GenreTreeNode[] = [];
    for (const row of rows) {
      const node = nodeMap.get(row.id);
      if (!node) {
        continue;
      }
      if (row.parentId && nodeMap.has(row.parentId)) {
        nodeMap.get(row.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return sortTree(roots);
  }

  async createGenreTree(input: CreateGenreTreeInput) {
    const draft = normalizeDraft({
      name: input.name,
      description: input.description,
      children: input.children ?? [],
    });
    const template = normalizeOptionalText(input.template);
    const parentId = normalizeOptionalText(input.parentId);

    validateDraftSubtree(draft);

    return prisma.$transaction(async (tx) => {
      if (parentId) {
        await this.ensureGenreExists(tx, parentId);
      }
      await this.ensureSiblingNameUnique(tx, draft.name, parentId, undefined);

      return this.createGenreNodeRecursive(tx, {
        ...draft,
        template,
      }, parentId);
    });
  }

  async updateGenre(id: string, input: UpdateGenreInput) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.novelGenre.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new AppError("类型不存在。", 404);
      }

      const nextParentId = input.parentId === undefined
        ? existing.parentId
        : normalizeOptionalText(input.parentId);

      if (nextParentId) {
        await this.ensureGenreExists(tx, nextParentId);
        await this.ensureNoCycle(tx, id, nextParentId);
      }

      const nextName = input.name === undefined
        ? existing.name
        : normalizeRequiredName(input.name);

      await this.ensureSiblingNameUnique(tx, nextName, nextParentId, id);

      return tx.novelGenre.update({
        where: { id },
        data: {
          name: nextName,
          description: input.description === undefined
            ? existing.description
            : normalizeOptionalText(input.description),
          template: input.template === undefined
            ? existing.template
            : normalizeOptionalText(input.template),
          parentId: nextParentId ?? null,
        },
      });
    });
  }

  async deleteGenre(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.novelGenre.findMany({
        select: {
          id: true,
          parentId: true,
          _count: {
            select: {
              novels: true,
            },
          },
        },
      });

      const existing = rows.find((row) => row.id === id);
      if (!existing) {
        throw new AppError("类型不存在。", 404);
      }

      const subtree = collectSubtreeRows(rows, id);
      const boundNovelCount = subtree.reduce((total, row) => total + row._count.novels, 0);
      if (boundNovelCount > 0) {
        throw new AppError("当前题材基底树已绑定小说，请先解绑相关小说后再删除。", 400);
      }

      for (const row of subtree) {
        await tx.novelGenre.delete({
          where: { id: row.id },
        });
      }
    });
  }

  private async createGenreNodeRecursive(
    tx: Prisma.TransactionClient,
    draft: GenreTreeDraft & { template?: string | null },
    parentId: string | null,
  ) {
    const created = await tx.novelGenre.create({
      data: {
        name: draft.name,
        description: normalizeOptionalText(draft.description),
        template: normalizeOptionalText(draft.template),
        parentId,
      },
    });

    for (const child of draft.children) {
      await this.createGenreNodeRecursive(tx, child, created.id);
    }

    return created;
  }

  private async ensureGenreExists(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const existing = await tx.novelGenre.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError("父级类型不存在。", 400);
    }
  }

  private async ensureSiblingNameUnique(
    tx: Prisma.TransactionClient,
    name: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<void> {
    const existing = await tx.novelGenre.findFirst({
      where: {
        name,
        parentId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("同一父级下已存在相同名称的类型。", 400);
    }
  }

  private async ensureNoCycle(
    tx: Prisma.TransactionClient,
    id: string,
    parentId: string,
  ): Promise<void> {
    let cursorId: string | null = parentId;
    while (cursorId) {
      if (cursorId === id) {
        throw new AppError("不能把类型移动到自己的子树下。", 400);
      }
      const current: { parentId: string | null } | null = await tx.novelGenre.findUnique({
        where: { id: cursorId },
        select: { parentId: true },
      });
      cursorId = current?.parentId ?? null;
    }
  }
}
