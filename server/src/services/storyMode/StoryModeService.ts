import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { buildStoryModePromptBlock, normalizeStoryModeOutput, sanitizeStoryModeProfile, serializeStoryModeProfile } from "./storyModeProfile";
import type { StoryModeTreeDraft } from "./storyModeGenerate";

export interface StoryModeTreeNode {
  id: string;
  name: string;
  description: string | null;
  template: string | null;
  parentId: string | null;
  profile: ReturnType<typeof sanitizeStoryModeProfile>;
  createdAt: string;
  updatedAt: string;
  childCount: number;
  novelCount: number;
  children: StoryModeTreeNode[];
}

export interface CreateStoryModeTreeInput {
  name: string;
  description?: string;
  template?: string;
  profile: unknown;
  parentId?: string | null;
  children?: CreateStoryModeTreeNodeInput[];
}

export interface CreateStoryModeTreeNodeInput {
  name: string;
  description?: string;
  template?: string;
  profile: unknown;
  children?: CreateStoryModeTreeNodeInput[];
}

export interface UpdateStoryModeInput {
  name?: string;
  description?: string | null;
  template?: string | null;
  profile?: unknown;
  parentId?: string | null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeRequiredName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("流派模式名称不能为空。", 400);
  }
  return trimmed;
}

function normalizeDraft(input: CreateStoryModeTreeNodeInput): StoryModeTreeDraft {
  return {
    name: normalizeRequiredName(input.name),
    description: normalizeOptionalText(input.description) ?? undefined,
    template: normalizeOptionalText(input.template) ?? undefined,
    profile: sanitizeStoryModeProfile(input.profile),
    children: (input.children ?? []).map((child) => normalizeDraft(child)),
  };
}

function validateDraftSubtree(draft: StoryModeTreeDraft, depth = 1): void {
  if (depth > 2) {
    throw new AppError("流派模式树最多只支持两级结构。", 400);
  }

  const seen = new Set<string>();
  for (const child of draft.children) {
    const key = child.name.trim().toLocaleLowerCase("zh-CN");
    if (seen.has(key)) {
      throw new AppError(`同一层下存在重复的流派模式名称：${child.name}。`, 400);
    }
    seen.add(key);
    validateDraftSubtree(child, depth + 1);
  }
}

function sortTree(nodes: StoryModeTreeNode[]): StoryModeTreeNode[] {
  nodes.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  for (const node of nodes) {
    sortTree(node.children);
  }
  return nodes;
}

export class StoryModeService {
  async listStoryModeTree(): Promise<StoryModeTreeNode[]> {
    const rows = await prisma.novelStoryMode.findMany({
      include: {
        _count: {
          select: {
            children: true,
            primaryNovels: true,
            secondaryNovels: true,
          },
        },
      },
      orderBy: [{ name: "asc" }],
    });

    const nodeMap = new Map<string, StoryModeTreeNode>();
    for (const row of rows) {
      const normalized = normalizeStoryModeOutput(row);
      nodeMap.set(row.id, {
        ...normalized,
        childCount: row._count.children,
        novelCount: row._count.primaryNovels + row._count.secondaryNovels,
        children: [],
      });
    }

    const roots: StoryModeTreeNode[] = [];
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

  async createStoryModeTree(input: CreateStoryModeTreeInput) {
    const draft = normalizeDraft({
      name: input.name,
      description: input.description,
      template: input.template,
      profile: input.profile,
      children: input.children ?? [],
    });
    const parentId = normalizeOptionalText(input.parentId);

    validateDraftSubtree(draft, parentId ? 2 : 1);

    return prisma.$transaction(async (tx) => {
      if (parentId) {
        await this.ensureParentCanAcceptChild(tx, parentId);
      }
      await this.ensureSiblingNameUnique(tx, draft.name, parentId, undefined);
      const created = await this.createStoryModeNodeRecursive(tx, draft, parentId);
      return normalizeStoryModeOutput(created);
    });
  }

  async updateStoryMode(id: string, input: UpdateStoryModeInput) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.novelStoryMode.findUnique({
        where: { id },
        include: {
          _count: {
            select: { children: true },
          },
        },
      });
      if (!existing) {
        throw new AppError("流派模式不存在。", 404);
      }

      const nextParentId = input.parentId === undefined
        ? existing.parentId
        : normalizeOptionalText(input.parentId);

      if (nextParentId) {
        await this.ensureParentCanAcceptChild(tx, nextParentId);
        await this.ensureNoCycle(tx, id, nextParentId);
        if (existing._count.children > 0) {
          throw new AppError("带子节点的流派模式不能移动到其他父类下，否则会超过两级结构。", 400);
        }
      }

      const nextName = input.name === undefined
        ? existing.name
        : normalizeRequiredName(input.name);

      await this.ensureSiblingNameUnique(tx, nextName, nextParentId, id);

      const updated = await tx.novelStoryMode.update({
        where: { id },
        data: {
          name: nextName,
          description: input.description === undefined
            ? existing.description
            : normalizeOptionalText(input.description),
          template: input.template === undefined
            ? existing.template
            : normalizeOptionalText(input.template),
          profileJson: input.profile === undefined
            ? existing.profileJson
            : serializeStoryModeProfile(input.profile),
          parentId: nextParentId ?? null,
        },
      });

      return normalizeStoryModeOutput(updated);
    });
  }

  async deleteStoryMode(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.novelStoryMode.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              children: true,
              primaryNovels: true,
              secondaryNovels: true,
            },
          },
        },
      });

      if (!existing) {
        throw new AppError("流派模式不存在。", 404);
      }

      if (existing._count.children > 0) {
        throw new AppError("当前流派模式下还有子节点，请先移动或删除子节点。", 400);
      }

      if (existing._count.primaryNovels + existing._count.secondaryNovels > 0) {
        throw new AppError("当前流派模式已被小说引用，不能直接删除。", 400);
      }

      await tx.novelStoryMode.delete({
        where: { id },
      });
    });
  }

  async getStoryModePromptContext(novelId: string): Promise<string> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        primaryStoryMode: true,
        secondaryStoryMode: true,
      },
    });
    if (!novel) {
      throw new AppError("小说不存在。", 404);
    }
    return buildStoryModePromptBlock({
      primary: novel.primaryStoryMode ? normalizeStoryModeOutput(novel.primaryStoryMode) : null,
      secondary: novel.secondaryStoryMode ? normalizeStoryModeOutput(novel.secondaryStoryMode) : null,
    });
  }

  private async createStoryModeNodeRecursive(
    tx: Prisma.TransactionClient,
    draft: StoryModeTreeDraft,
    parentId: string | null,
  ) {
    const created = await tx.novelStoryMode.create({
      data: {
        name: draft.name,
        description: normalizeOptionalText(draft.description),
        template: normalizeOptionalText(draft.template),
        profileJson: serializeStoryModeProfile(draft.profile),
        parentId,
      },
    });

    for (const child of draft.children) {
      await this.createStoryModeNodeRecursive(tx, child, created.id);
    }

    return created;
  }

  private async ensureParentCanAcceptChild(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const existing = await tx.novelStoryMode.findUnique({
      where: { id },
      select: { id: true, parentId: true },
    });
    if (!existing) {
      throw new AppError("父级流派模式不存在。", 400);
    }
    if (existing.parentId) {
      throw new AppError("流派模式树最多两级，只能挂在根节点下面。", 400);
    }
  }

  private async ensureSiblingNameUnique(
    tx: Prisma.TransactionClient,
    name: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<void> {
    const existing = await tx.novelStoryMode.findFirst({
      where: {
        name,
        parentId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("同一父级下已存在相同名称的流派模式。", 400);
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
        throw new AppError("不能把流派模式移动到自己的子树下。", 400);
      }
      const current: { parentId: string | null } | null = await tx.novelStoryMode.findUnique({
        where: { id: cursorId },
        select: { parentId: true },
      });
      cursorId = current?.parentId ?? null;
    }
  }
}
