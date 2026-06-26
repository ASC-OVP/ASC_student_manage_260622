import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const nodeModules = join(root, "node_modules");
const nextPackage = join(nodeModules, "next", "package.json");
const prismaPackage = join(nodeModules, "prisma", "package.json");
const prismaClientPackage = join(nodeModules, "@prisma", "client", "package.json");
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
  if (existsSync(nextPackage) && existsSync(prismaPackage) && existsSync(prismaClientPackage)) return;

  console.log("node_modules is missing or incomplete. Running npm install before starting dev server...");
  runNpm(["install"]);

  if (!existsSync(nextPackage) || !existsSync(prismaPackage) || !existsSync(prismaClientPackage)) {
    console.error("Dependencies are still missing after npm install. Please remove node_modules and run npm install again.");
    process.exit(1);
  }
}

function runNpm(args, options = {}) {
  if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", npmCommand, ...args], options);
    return;
  }
  run(npmCommand, args, options);
}

function runPrisma(args) {
  runNpm(["exec", "--", "prisma", ...args], { allowLockedPrismaEngine: true });
}

run(process.execPath, ["scripts/ensure-dev-env.mjs"]);
ensureDependencies();
runPrisma(["generate", "--schema=prisma/schema.prisma"]);
runPrisma(["migrate", "deploy", "--schema=prisma/schema.prisma"]);
