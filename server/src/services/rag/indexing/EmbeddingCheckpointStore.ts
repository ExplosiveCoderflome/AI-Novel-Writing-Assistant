import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataRoot } from "../../../runtime/appPaths";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isEmbeddingVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0
    && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

/** Paid results survive job failure; files contain vectors and hashes, never source text or credentials. */
export class EmbeddingCheckpointStore {
  private readonly directory: string;
  private preparation: Promise<void> | null = null;

  constructor(scope: string, target: { provider: string; model: string; baseUrl: string; version: number }) {
    this.directory = path.join(resolveDataRoot(), "rag-embedding-checkpoints", "v1", digest(scope), digest(JSON.stringify(target)));
  }

  async prepare(): Promise<void> {
    // A long document may have thousands of batches. Never rescan all checkpoint
    // files for every batch (quadratic filesystem work).
    this.preparation ??= this.prepareDirectory().catch((error: unknown) => {
      this.preparation = null;
      throw error;
    });
    return this.preparation;
  }

  private async prepareDirectory(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    // Check writability before sending paid requests, including on read-only installations.
    const probe = path.join(this.directory, `${randomUUID()}.tmp`);
    await fs.writeFile(probe, "", { flag: "wx", mode: 0o600 });
    await fs.unlink(probe);
    for (const name of await fs.readdir(this.directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name) && !name.endsWith(".tmp")) continue;
      const file = path.join(this.directory, name);
      try {
        if (Date.now() - (await fs.stat(file)).mtimeMs > RETENTION_MS) await fs.unlink(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  async read(text: string): Promise<number[] | null> {
    const key = digest(text);
    const file = path.join(this.directory, `${key}.json`);
    try {
      const record = JSON.parse(await fs.readFile(file, "utf8")) as {
        key?: string; vector?: unknown; savedAt?: number;
      };
      if (record.key === key && typeof record.savedAt === "number" && Number.isFinite(record.savedAt) && isEmbeddingVector(record.vector)) {
        if (Date.now() - record.savedAt > RETENTION_MS) {
          await fs.unlink(file);
          return null;
        }
        return record.vector;
      }
      // A damaged checkpoint must not silently cause another paid request.
      throw new Error("Embedding checkpoint is invalid; indexing stopped to avoid duplicate paid requests.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async write(text: string, vector: number[]): Promise<void> {
    if (!isEmbeddingVector(vector)) throw new Error("Cannot checkpoint an invalid embedding vector.");
    const key = digest(text);
    const destination = path.join(this.directory, `${key}.json`);
    const temporary = path.join(this.directory, `${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, JSON.stringify({ key, vector, savedAt: Date.now() }), { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, destination);
    } finally {
      await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}
