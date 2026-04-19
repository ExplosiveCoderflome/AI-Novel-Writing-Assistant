import { prisma } from "../../../db/prisma";
import type { SecretStore, SecretStoreListOptions, SecretStoreRecord, SecretStoreWriteInput } from "./SecretStore";

function toPrismaWriteInput(input: SecretStoreWriteInput): Record<string, unknown> {
  return {
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.key !== undefined ? { key: input.key } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.baseURL !== undefined ? { baseURL: input.baseURL } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.reasoningEnabled !== undefined ? { reasoningEnabled: input.reasoningEnabled } : {}),
  };
}

export class DatabaseSecretStore implements SecretStore {
  async listProviders(options?: SecretStoreListOptions): Promise<SecretStoreRecord[]> {
    return prisma.aPIKey.findMany({
      where: {
        ...(options?.onlyActive ? { isActive: true } : {}),
        ...(options?.providers?.length
          ? {
            provider: {
              in: options.providers,
            },
          }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }],
    });
  }

  async getProvider(provider: string): Promise<SecretStoreRecord | null> {
    return prisma.aPIKey.findUnique({
      where: { provider },
    });
  }

  async hasProvider(provider: string): Promise<boolean> {
    const existing = await prisma.aPIKey.findUnique({
      where: { provider },
      select: { id: true },
    });
    return existing != null;
  }

  async createProvider(provider: string, input: SecretStoreWriteInput): Promise<SecretStoreRecord> {
    return prisma.aPIKey.create({
      data: ({
        provider,
        ...toPrismaWriteInput(input),
      } as Record<string, unknown>) as never,
    });
  }

  async updateProvider(provider: string, input: SecretStoreWriteInput): Promise<SecretStoreRecord> {
    return prisma.aPIKey.update({
      where: { provider },
      data: toPrismaWriteInput(input) as never,
    });
  }

  async upsertProvider(provider: string, input: SecretStoreWriteInput): Promise<SecretStoreRecord> {
    const writeInput = toPrismaWriteInput(input);
    return prisma.aPIKey.upsert({
      where: { provider },
      update: writeInput as never,
      create: ({
        provider,
        ...writeInput,
      } as Record<string, unknown>) as never,
    });
  }

  async deleteProvider(provider: string): Promise<void> {
    await prisma.aPIKey.delete({
      where: { provider },
    });
  }
}
