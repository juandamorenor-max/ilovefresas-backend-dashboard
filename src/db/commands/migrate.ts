import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createPostgresClient } from "../postgres.js";

const db = createPostgresClient();
if (!db.configured) {
  throw new Error("DATABASE_URL is required to run migrations");
}

await db.query(`
  create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`);

const baseSchemaPath = path.join(process.cwd(), "src", "db", "schema.sql");
await db.query(await readFile(baseSchemaPath, "utf8"));

const migrationsPath = path.join(process.cwd(), "src", "db", "migrations");
const migrationFiles = (await readdir(migrationsPath))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const applied = new Set(
  (await db.query<{ name: string }>("select name from schema_migrations"))
    .map((row) => row.name)
);

for (const file of migrationFiles) {
  if (applied.has(file)) continue;
  const sql = await readFile(path.join(migrationsPath, file), "utf8");
  await db.transaction(async (transaction) => {
    await transaction.query(sql);
    await transaction.query("insert into schema_migrations (name) values ($1)", [file]);
  });
  console.log(`Applied ${file}`);
}

console.log("Database migrations are up to date");
