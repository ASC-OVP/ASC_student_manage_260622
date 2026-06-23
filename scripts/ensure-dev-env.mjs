import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, ".env");

if (!existsSync(envPath)) {
  writeFileSync(envPath, 'DATABASE_URL="file:./dev.db"\n', "utf8");
  console.log("Created .env with SQLite DATABASE_URL.");
} else {
  console.log(".env already exists.");
}
