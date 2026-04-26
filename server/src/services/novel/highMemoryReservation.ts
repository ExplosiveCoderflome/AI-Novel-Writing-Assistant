import { randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma";
import { withSqliteRetry } from "../../db/sqliteRetry";

const RESERVATION_KEY_PREFIX = "runtime.highMemoryReservation";

interface ReservationRecord {
  kind?: string;
  namespace?: string;
  scopeKey?: string;
  ownerId?: string;
  token?: string;
  acquiredAt?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface HighMemoryReservationHandle {
  key: string;
  ownerId: string;
  token: string;
  release: () => Promise<void>;
  renew: (ttlMs: number) => Promise<boolean>;
}

export type HighMemoryReservationAcquireResult =
  | {
    acquired: true;
    handle: HighMemoryReservationHandle;
  }
  | {
    acquired: false;
    key: string;
    ownerId: string | null;
    expiresAt: Date | null;
  };

export type ScopedHighMemoryReservationAcquireResult = HighMemoryReservationAcquireResult;

function sanitizeNamespace(namespace: string): string {
  return namespace.trim().replace(/[^a-zA-Z0-9_.:-]/g, "_") || "default";
}

export function buildHighMemoryReservationKey(namespace: string, scopeKey: string): string {
  const encodedScope = Buffer.from(scopeKey.trim() || "default", "utf8").toString("base64url");
  return `${RESERVATION_KEY_PREFIX}.${sanitizeNamespace(namespace)}.${encodedScope}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === "P2002";
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function parseReservationValue(value: string | null | undefined): ReservationRecord | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as ReservationRecord;
  } catch {
    return null;
  }
}

function getReservationMetadataString(record: ReservationRecord | null, field: string): string | null {
  const value = record?.metadata?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isReservationExpired(input: {
  record: ReservationRecord | null;
  updatedAt?: Date | null;
  now: Date;
  ttlMs: number;
}): boolean {
  const expiresAt = parseDate(input.record?.expiresAt);
  if (expiresAt) {
    return expiresAt.getTime() <= input.now.getTime();
  }
  const updatedAtMs = input.updatedAt instanceof Date ? input.updatedAt.getTime() : Number.NaN;
  return Number.isFinite(updatedAtMs) && updatedAtMs + input.ttlMs <= input.now.getTime();
}

function buildReservationValue(input: {
  namespace: string;
  scopeKey: string;
  ownerId: string;
  token: string;
  acquiredAt: string;
  ttlMs: number;
  now: Date;
  metadata?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    kind: "high_memory_reservation",
    namespace: input.namespace,
    scopeKey: input.scopeKey,
    ownerId: input.ownerId,
    token: input.token,
    acquiredAt: input.acquiredAt,
    expiresAt: new Date(input.now.getTime() + input.ttlMs).toISOString(),
    processId: process.pid,
    metadata: input.metadata ?? {},
  });
}

function createHandle(input: {
  key: string;
  namespace: string;
  scopeKey: string;
  ownerId: string;
  token: string;
  acquiredAt: string;
  ttlMs: number;
  value: string;
  metadata?: Record<string, unknown>;
}): HighMemoryReservationHandle {
  let currentValue = input.value;
  let released = false;
  return {
    key: input.key,
    ownerId: input.ownerId,
    token: input.token,
    release: async () => {
      if (released) {
        return;
      }
      released = true;
      await withSqliteRetry(
        () => prisma.appSetting.deleteMany({
          where: {
            key: input.key,
            value: currentValue,
          },
        }),
        { label: "high-memory-reservation-release" },
      ).catch((error) => {
        console.warn("[high-memory.reservation] release_failed", {
          key: input.key,
          ownerId: input.ownerId,
          reason: error instanceof Error ? error.message : String(error),
        });
      });
    },
    renew: async (ttlMs: number) => {
      if (released) {
        return false;
      }
      const nextValue = buildReservationValue({
        namespace: input.namespace,
        scopeKey: input.scopeKey,
        ownerId: input.ownerId,
        token: input.token,
        acquiredAt: input.acquiredAt,
        ttlMs,
        now: new Date(),
        metadata: input.metadata,
      });
      const result = await withSqliteRetry(
        () => prisma.appSetting.updateMany({
          where: {
            key: input.key,
            value: currentValue,
          },
          data: {
            value: nextValue,
          },
        }),
        { label: "high-memory-reservation-renew" },
      );
      if (result.count !== 1) {
        return false;
      }
      currentValue = nextValue;
      return true;
    },
  };
}

export async function acquireHighMemoryReservation(input: {
  namespace: string;
  scopeKey: string;
  ownerId?: string | null;
  ttlMs: number;
  metadata?: Record<string, unknown>;
  now?: Date;
}): Promise<HighMemoryReservationAcquireResult> {
  const namespace = sanitizeNamespace(input.namespace);
  const scopeKey = input.scopeKey.trim() || "default";
  const key = buildHighMemoryReservationKey(namespace, scopeKey);
  const ownerId = input.ownerId?.trim() || `${namespace}:${process.pid}:${randomUUID()}`;
  const token = randomUUID();
  const now = input.now ?? new Date();
  const acquiredAt = now.toISOString();
  const value = buildReservationValue({
    namespace,
    scopeKey,
    ownerId,
    token,
    acquiredAt,
    ttlMs: input.ttlMs,
    now,
    metadata: input.metadata,
  });

  try {
    await withSqliteRetry(
      () => prisma.appSetting.create({
        data: {
          key,
          value,
        },
      }),
      { label: "high-memory-reservation-create" },
    );
    return {
      acquired: true,
      handle: createHandle({
        key,
        namespace,
        scopeKey,
        ownerId,
        token,
        acquiredAt,
        ttlMs: input.ttlMs,
        value,
        metadata: input.metadata,
      }),
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }

  const existing = await prisma.appSetting.findUnique({
    where: { key },
  });
  const existingRecord = parseReservationValue(existing?.value);
  const canReplace = existing
    && (
      existingRecord?.ownerId === ownerId
      || isReservationExpired({
        record: existingRecord,
        updatedAt: existing.updatedAt,
        now,
        ttlMs: input.ttlMs,
      })
    );

  if (!canReplace || !existing) {
    return {
      acquired: false,
      key,
      ownerId: existingRecord?.ownerId ?? null,
      expiresAt: parseDate(existingRecord?.expiresAt),
    };
  }

  const result = await withSqliteRetry(
    () => prisma.appSetting.updateMany({
      where: {
        key,
        value: existing.value,
      },
      data: { value },
    }),
    { label: "high-memory-reservation-takeover" },
  );
  if (result.count !== 1) {
    return {
      acquired: false,
      key,
      ownerId: existingRecord?.ownerId ?? null,
      expiresAt: parseDate(existingRecord?.expiresAt),
    };
  }
  return {
    acquired: true,
    handle: createHandle({
      key,
      namespace,
      scopeKey,
      ownerId,
      token,
      acquiredAt,
      ttlMs: input.ttlMs,
      value,
      metadata: input.metadata,
    }),
  };
}

function reservationScopesOverlap(requestedScope: string | null | undefined, existingScope: string | null | undefined): boolean {
  const requested = requestedScope?.trim() || null;
  const existing = existingScope?.trim() || null;
  if (!requested || !existing) {
    return true;
  }
  if (requested === "book" || existing === "book") {
    return true;
  }
  return requested === existing;
}

export async function acquireScopedHighMemoryReservation(input: {
  namespace: string;
  novelId: string;
  scope: string;
  ownerId?: string | null;
  ttlMs: number;
  metadata?: Record<string, unknown>;
  now?: Date;
}): Promise<ScopedHighMemoryReservationAcquireResult> {
  const namespace = sanitizeNamespace(input.namespace);
  const novelId = input.novelId.trim();
  const scope = input.scope.trim() || "book";
  const ownerId = input.ownerId?.trim() || `${namespace}:${novelId}:${process.pid}:${randomUUID()}`;
  const now = input.now ?? new Date();
  const gate = await acquireHighMemoryReservation({
    namespace: `${namespace}.gate`,
    scopeKey: novelId,
    ownerId: `${ownerId}:gate`,
    ttlMs: Math.min(Math.max(input.ttlMs, 1000), 10_000),
    metadata: {
      novelId,
      scope: "gate",
    },
    now,
  });
  if (!gate.acquired) {
    return gate;
  }

  try {
    const prefix = `${RESERVATION_KEY_PREFIX}.${namespace}.`;
    const rows = await prisma.appSetting.findMany({
      where: {
        key: {
          startsWith: prefix,
        },
      },
    });
    for (const row of rows) {
      if (row.key === gate.handle.key) {
        continue;
      }
      const record = parseReservationValue(row.value);
      if (!record || record.namespace !== namespace) {
        continue;
      }
      if (record.ownerId === ownerId) {
        continue;
      }
      if (getReservationMetadataString(record, "novelId") !== novelId) {
        continue;
      }
      if (isReservationExpired({
        record,
        updatedAt: row.updatedAt,
        now,
        ttlMs: input.ttlMs,
      })) {
        await prisma.appSetting.deleteMany({
          where: {
            key: row.key,
            value: row.value,
          },
        });
        continue;
      }
      const existingScope = getReservationMetadataString(record, "scope") ?? record.scopeKey;
      if (reservationScopesOverlap(scope, existingScope)) {
        return {
          acquired: false,
          key: row.key,
          ownerId: record.ownerId ?? null,
          expiresAt: parseDate(record.expiresAt),
        };
      }
    }

    return await acquireHighMemoryReservation({
      namespace,
      scopeKey: `${novelId}:${scope}`,
      ownerId,
      ttlMs: input.ttlMs,
      metadata: {
        ...input.metadata,
        novelId,
        scope,
      },
      now,
    });
  } finally {
    await gate.handle.release();
  }
}

export function startHighMemoryReservationRenewal(
  handle: HighMemoryReservationHandle,
  options: {
    ttlMs: number;
    intervalMs: number;
  },
): () => void {
  const timer = setInterval(() => {
    void handle.renew(options.ttlMs).then((renewed) => {
      if (!renewed) {
        console.warn("[high-memory.reservation] renew_lost", {
          key: handle.key,
          ownerId: handle.ownerId,
        });
      }
    }).catch((error) => {
      console.warn("[high-memory.reservation] renew_failed", {
        key: handle.key,
        ownerId: handle.ownerId,
        reason: error instanceof Error ? error.message : String(error),
      });
    });
  }, options.intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
