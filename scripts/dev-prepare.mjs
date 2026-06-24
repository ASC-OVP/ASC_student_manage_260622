import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prismaCli = join(root, "node_modules", "prisma", "build", "index.js");

function hasGeneratedPrismaClient() {
  return existsSync(join(root, "lib", "generated", "prisma", "index.js"));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: Boolean(options.shell),
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(result.error.message);
  if (result.status === 0) return;

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const lockedPrismaEngine =
    options.allowLockedPrismaEngine &&
    process.platform === "win32" &&
    hasGeneratedPrismaClient() &&
    /EPERM|operation not permitted|query_engine/i.test(output);

  if (lockedPrismaEngine) {
    console.warn("Prisma generate was skipped because the local Windows query engine file is locked. Existing generated client will be reused.");
    return;
  }

  process.exit(result.status ?? 1);
}

run(process.execPath, ["scripts/ensure-dev-env.mjs"]);
run(process.execPath, [prismaCli, "generate", "--schema=prisma/schema.prisma"], { allowLockedPrismaEngine: true });
run(process.execPath, [prismaCli, "migrate", "deploy", "--schema=prisma/schema.prisma"]);
