import { Pool } from "pg";
import type { QueryResult, QueryResultRow } from "pg";
import { env } from "../config/env.js";

let pool: Pool | null = null;

function getPool() {
  if (!env.DATABASE_URL) {
    return null;
  }

  pool ??= new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_URL.includes("railway.internal")
      ? undefined
      : { rejectUnauthorized: false }
  });

  return pool;
}

export function createPostgresClient() {
  return {
    configured: Boolean(env.DATABASE_URL),
    query: async <T extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: unknown[]
    ): Promise<T[]> => {
      const client = getPool();
      if (!client) {
        return [];
      }

      const result = await client.query<T>(sql, params);
      if (Array.isArray(result)) {
        return (result as QueryResult<T>[]).flatMap((entry) => entry.rows);
      }

      return result.rows;
    }
  };
}

export function getPostgresStatus() {
  return {
    configured: Boolean(env.DATABASE_URL),
    mode: env.DATABASE_URL ? "postgres" : "disabled"
  };
}
