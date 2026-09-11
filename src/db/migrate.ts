import "dotenv/config";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createDb, type Database } from "./client";

export async function runMigrations(db: Database) {
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
}

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./data/paros.db";
  if (url.startsWith("file:")) {
    mkdirSync(path.dirname(url.replace(/^file:/, "")), { recursive: true });
  }
  const { db, client } = createDb(url);
  await runMigrations(db);
  console.log(`[db] migrations applied → ${url}`);
  client.close();
}

const isDirectRun =
  typeof process.argv[1] === "string" && /migrate\.ts$/.test(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
