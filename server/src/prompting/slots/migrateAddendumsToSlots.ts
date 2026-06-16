/**
 * One-time migration: reads enabled PromptAddendum rows and writes them as
 * `append` slot overrides in PromptSlotOverride.
 *
 * Run: npx tsx src/prompting/slots/migrateAddendumsToSlots.ts [--dry-run]
 *
 * Safety guarantees:
 * - Only migrates enabled=true addendums (disabled = "off" = omit).
 * - Multiple addendums for the same (scope, novelId, promptId) are merged.
 * - If a PromptSlotOverride already has the target append key, the migration
 *   skips that entry (non-destructive). Pass --force to overwrite.
 * - Dry-run mode (--dry-run) prints what would be written without touching DB.
 */

import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma";
import { hashSlotDefault } from "./slotResolution";
import type { PromptSlotOverrideEntry, PromptSlotOverrideMap } from "./slotTypes";

const PROMPT_APPEND_KEY_MAP: Record<string, string> = {
  "novel.chapter.writer": "writer.customConstraints",
  "audit.chapter.light": "audit.light.customConstraints",
  "audit.chapter.full": "audit.full.customConstraints",
  "novel.review.repair": "repair.customConstraints",
  "novel.review.patch": "patch.customConstraints",
};

const EMPTY_APPEND_DEFAULT = "";

function dryRun(): boolean {
  return process.argv.includes("--dry-run");
}

function force(): boolean {
  return process.argv.includes("--force");
}

function log(...args: unknown[]) {
  console.log("[migrateAddendumsToSlots]", ...args);
}

type AddendumRow = {
  id: string;
  scope: string;
  novelId: string | null;
  promptId: string;
  title: string;
  content: string;
  enabled: boolean;
};

async function main() {
  const isDry = dryRun();
  const isForce = force();
  log(isDry ? "DRY RUN — no DB writes." : "LIVE RUN — writing to DB.");
  log(isForce ? "FORCE mode — will overwrite existing overrides." : "SAFE mode — skipping existing overrides.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addendums: AddendumRow[] = await (prisma as any).promptAddendum.findMany({
    where: { enabled: true },
    orderBy: [{ scope: "asc" }, { novelId: "asc" }, { promptId: "asc" }, { createdAt: "asc" }],
  });

  if (addendums.length === 0) {
    log("No enabled addendums found. Nothing to migrate.");
    return;
  }
  log(`Found ${addendums.length} enabled addendum(s).`);

  // Group by (scope, novelId, promptId)
  const grouped = new Map<string, AddendumRow[]>();
  for (const row of addendums) {
    const key = `${row.scope}||${row.novelId ?? ""}||${row.promptId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  let migrated = 0;
  let skipped = 0;

  for (const [groupKey, rows] of grouped) {
    const [scope, novelIdRaw, promptId] = groupKey.split("||");
    const novelId = novelIdRaw === "" ? null : novelIdRaw;

    const appendKey = PROMPT_APPEND_KEY_MAP[promptId];
    if (!appendKey) {
      log(`  SKIP (no append key mapping): promptId=${promptId}`);
      skipped++;
      continue;
    }

    // Merge all addendum contents
    const merged = rows
      .map((r) => r.content.trim())
      .filter(Boolean)
      .join("\n\n---\n\n");

    if (!merged) {
      log(`  SKIP (empty content after merge): ${groupKey}`);
      skipped++;
      continue;
    }

    log(`  Migrating: scope=${scope} novelId=${novelId ?? "null"} promptId=${promptId}`);
    log(`    append key: ${appendKey}`);
    log(`    merged length: ${merged.length} chars from ${rows.length} addendum(s)`);

    if (isDry) {
      log(`    [DRY] would write: ${merged.slice(0, 80)}${merged.length > 80 ? "…" : ""}`);
      migrated++;
      continue;
    }

    // Load existing PromptSlotOverride
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).promptSlotOverride.findFirst({
      where: { scope, novelId, promptId },
    });

    let existingSlots: PromptSlotOverrideMap = {};
    if (existing) {
      try {
        const parsed = JSON.parse(existing.slots as string);
        if (parsed && typeof parsed === "object") existingSlots = parsed as PromptSlotOverrideMap;
      } catch {
        // fall through
      }
    }

    if (existingSlots[appendKey] && !isForce) {
      log(`    SKIP (append key already exists, use --force to overwrite)`);
      skipped++;
      continue;
    }

    const baseHash = hashSlotDefault(EMPTY_APPEND_DEFAULT);
    const newSlots: PromptSlotOverrideMap = {
      ...existingSlots,
      [appendKey]: {
        value: merged,
        baseHash,
      } satisfies PromptSlotOverrideEntry,
    };
    const slotsJson = JSON.stringify(newSlots);

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).promptSlotOverride.update({
        where: { id: existing.id },
        data: { slots: slotsJson },
      });
      log(`    UPDATED existing override (id=${existing.id})`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).promptSlotOverride.create({
        data: {
          scope,
          novelId,
          promptId,
          baseVersion: "v1",
          slots: slotsJson,
        },
      });
      log(`    CREATED new override`);
    }

    migrated++;
  }

  log(`\nDone. migrated=${migrated}, skipped=${skipped}.`);
  if (isDry) log("(Dry run — no actual writes were made.)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrateAddendumsToSlots] FATAL:", err);
    process.exit(1);
  });
