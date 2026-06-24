export function createPostgresClient() {
  return {
    query: async <T>(_sql: string, _params?: unknown[]): Promise<T[]> => {
      throw new Error("Postgres client not wired yet. Use DATABASE_URL and replace the in-memory store.");
    }
  };
}
