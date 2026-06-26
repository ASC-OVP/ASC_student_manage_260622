import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prismaCli = join(root, "node_modules", "prisma", "build", "index.js");
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

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

function ensureDependencies() {
  if (existsSync(prismaCli) && existsSync(nextCli)) return;

  console.log("node_modules is missing or incomplete. Running npm install before starting dev server...");
  run(npmCommand, ["install"]);

  if (!existsSync(prismaCli) || !existsSync(nextCli)) {
    console.error("Dependencies are still missing after npm install. Please remove node_modules and run npm install again.");
    process.exit(1);
  }
}

run(process.execPath, ["scripts/ensure-dev-env.mjs"]);
ensureDependencies();
run(process.execPath, [prismaCli, "generate", "--schema=prisma/schema.prisma"], { allowLockedPrismaEngine: true });
run(process.execPath, [prismaCli, "migrate", "deploy", "--schema=prisma/schema.prisma"]);
