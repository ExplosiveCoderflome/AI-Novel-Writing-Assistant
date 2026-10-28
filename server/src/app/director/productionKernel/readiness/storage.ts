import type {Prisma} from "@prisma/client";

export interface KernelReadinessIssue {
  code: "production_storage_not_ready" | "production_model_capability_missing";
  message: string;
}
export type KernelReadiness = {ready: true} | {ready: false; issues: KernelReadinessIssue[]};
export type StorageReader = Pick<Prisma.TransactionClient, "$queryRawUnsafe">;
const columns = ["id", "ownerKey", "novelId", "chapterId", "profileSnapshotJson", "policySnapshotJson", "modelSnapshotJson",
  "progressJson", "stageArtifactsJson", "activeStage", "activeRequestKey", "version", "createdAt", "updatedAt"];
const unavailable = (): KernelReadiness => ({ready: false, issues: [{code: "production_storage_not_ready",
  message: "正文运行存储尚未就绪，请先检查数据库结构、索引和外键。"}]});

/** Metadata only. Does not migrate, create missing objects, baseline history or read manuscripts. */
export async function inspectProductionStorage(db: StorageReader, provider: "sqlite" | "postgresql"): Promise<KernelReadiness> {
  try {
    if (provider === "sqlite") {
      const info = await db.$queryRawUnsafe<Array<{name: string; pk: number}>>('PRAGMA table_info("ProductionUnitRun")');
      if (columns.some(column => !info.some(row => row.name === column)) || !info.some(row => row.name === "id" && Number(row.pk) === 1)) return unavailable();
      const indexes = await db.$queryRawUnsafe<Array<{name: string; unique: number; partial: number}>>('PRAGMA index_list("ProductionUnitRun")');
      const definitions = await Promise.all(indexes.filter(index => Number(index.partial) === 0).map(async index => ({unique: Number(index.unique) === 1,
        columns: (await db.$queryRawUnsafe<Array<{seqno: number; name: string}>>('SELECT * FROM pragma_index_info(?)', index.name))
          .sort((a,b) => Number(a.seqno)-Number(b.seqno)).map(row => row.name).join(",")})));
      if (!definitions.some(index => index.unique && index.columns === "ownerKey,chapterId")
        || !definitions.some(index => index.columns === "novelId,chapterId")) return unavailable();
      const foreign = await db.$queryRawUnsafe<Array<{from: string; table: string; to: string; on_update: string; on_delete: string}>>('PRAGMA foreign_key_list("ProductionUnitRun")');
      if ([["novelId","Novel"],["chapterId","Chapter"]].some(([column, table]) => !foreign.some(row => row.from === column
        && row.table === table && row.to === "id" && row.on_delete === "CASCADE" && row.on_update === "CASCADE"))) return unavailable();
    } else {
      const info = await db.$queryRawUnsafe<Array<{column_name: string}>>(`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ProductionUnitRun'`);
      if (columns.some(column => !info.some(row => row.column_name === column))) return unavailable();
      const indexes = await db.$queryRawUnsafe<Array<{columns: string; is_unique: boolean; is_primary: boolean}>>(`SELECT string_agg(a.attname, ',' ORDER BY k.ordinality) AS columns, i.indisunique AS is_unique, i.indisprimary AS is_primary
        FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
        WHERE c.relname='ProductionUnitRun' AND n.nspname=current_schema() AND i.indisvalid AND i.indpred IS NULL
        GROUP BY i.indexrelid,i.indisunique,i.indisprimary`);
      if (!indexes.some(row => row.is_primary && row.columns === "id") || !indexes.some(row => row.is_unique && row.columns === "ownerKey,chapterId")
        || !indexes.some(row => row.columns === "novelId,chapterId")) return unavailable();
      const foreign = await db.$queryRawUnsafe<Array<{column_name: string; target: string; target_column: string}>>(`SELECT a.attname AS column_name, target.relname AS target, ta.attname AS target_column
        FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_class target ON target.oid=f.confrelid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=f.conkey[1]
        JOIN pg_attribute ta ON ta.attrelid=target.oid AND ta.attnum=f.confkey[1]
        WHERE c.relname='ProductionUnitRun' AND n.nspname=current_schema() AND f.contype='f' AND f.confdeltype='c' AND f.confupdtype='c'
          AND cardinality(f.conkey)=1 AND cardinality(f.confkey)=1`);
      if ([["novelId","Novel"],["chapterId","Chapter"]].some(([column, table]) => !foreign.some(row => row.column_name === column
        && row.target === table && row.target_column === "id"))) return unavailable();
    }
    return {ready: true};
  } catch {return unavailable();}
}

/** Translate only Prisma's missing table/column errors for this model. Other failures retain their identity. */
export function isMissingProductionStorage(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {code?: string; meta?: {modelName?: string; table?: string; column?: string}};
  return ["P2021", "P2022"].includes(value.code ?? "") && (value.meta?.modelName === "ProductionUnitRun"
    || [value.meta?.table, value.meta?.column].some(name => name?.split(/[.\"]/).includes("ProductionUnitRun")));
}
