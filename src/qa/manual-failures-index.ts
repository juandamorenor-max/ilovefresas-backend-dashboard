import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type ManualQaRecord = {
  id: string;
  date: string;
  chatId: number;
  customerId: string;
  conversationId?: string;
  result: "success" | "failure";
  comment: string | null;
  closedAt: string;
  snapshot?: unknown;
};

const qaOutputDir = join(process.cwd(), "qa-output");
const outputPath = join(qaOutputDir, "manual-failures-index.json");

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function isManualQaRecord(value: unknown): value is ManualQaRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<ManualQaRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.date === "string" &&
    typeof record.customerId === "string" &&
    record.result === "failure" &&
    typeof record.closedAt === "string"
  );
}

function readFailureRecords() {
  if (!existsSync(qaOutputDir)) {
    return [];
  }

  const files = readdirSync(qaOutputDir)
    .filter((file) => /^telegram-manual-qa-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();

  return files.flatMap((file) => {
    const value = readJsonFile(join(qaOutputDir, file));
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(isManualQaRecord).map((record) => ({
      sourceFile: file,
      ...record
    }));
  });
}

const failures = readFailureRecords();
const byDate = failures.reduce<Record<string, number>>((acc, failure) => {
  acc[failure.date] = (acc[failure.date] ?? 0) + 1;
  return acc;
}, {});

mkdirSync(qaOutputDir, { recursive: true });
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalFailures: failures.length,
      byDate,
      failures
    },
    null,
    2
  )
);

console.log(`Manual failure index written: ${outputPath}`);
console.log(`Total failures indexed: ${failures.length}`);
