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
    },
    transaction: async <T>(
      operation: (transaction: {
        query: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<R[]>;
      }) => Promise<T>
    ): Promise<T> => {
      const pool = getPool();
      if (!pool) {
        throw new Error("DATABASE_URL is not configured");
      }
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await operation({
          query: async <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => {
            const queryResult = await client.query<R>(sql, params);
            return queryResult.rows;
          }
        });
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

export function getPostgresStatus() {
  return {
    configured: Boolean(env.DATABASE_URL),
    mode: env.DATABASE_URL ? "postgres" : "disabled"
  };
}
