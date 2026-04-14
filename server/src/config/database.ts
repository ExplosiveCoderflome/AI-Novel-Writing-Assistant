const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/ai_novel";

function normalizePsycopgScheme(rawValue: string): string {
  return rawValue
    .replace(/^postgresql\+psycopg:\/\//i, "postgresql://")
    .replace(/^postgres\+psycopg:\/\//i, "postgres://");
}

export function normalizeDatabaseUrl(rawValue: string | undefined): string {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return DEFAULT_DATABASE_URL;
  }
  return normalizePsycopgScheme(normalized);
}

export function getDatabaseUrl(options?: { allowDefault?: boolean }): string {
  const normalized = process.env.DATABASE_URL?.trim();
  if (normalized) {
    return normalizeDatabaseUrl(normalized);
  }
  if (options?.allowDefault ?? process.env.NODE_ENV !== "production") {
    return DEFAULT_DATABASE_URL;
  }
  throw new Error("DATABASE_URL is required in production.");
}

export { DEFAULT_DATABASE_URL };
