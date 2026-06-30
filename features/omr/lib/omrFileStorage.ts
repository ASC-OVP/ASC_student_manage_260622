
import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import path from "path";

export function sanitizeFileName(fileName: string) {
  const ext = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const base = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "omr";
  return Date.now() + "-" + randomUUID() + "-" + base + (ext || ".bin");
}

export function storedOmrPathToDiskPath(filePath: string | null | undefined) {
  if (!filePath || filePath.startsWith("http://") || filePath.startsWith("https://")) return null;

  const relativePath = filePath.replace(/^\/+/, "");
  if (!relativePath.startsWith("uploads/omr/")) return null;

  const omrRoot = path.resolve(process.cwd(), "public", "uploads", "omr");
  const diskPath = path.resolve(process.cwd(), "public", relativePath);
  if (diskPath !== omrRoot && !diskPath.startsWith(omrRoot + path.sep)) return null;

  return diskPath;
}

export async function deleteStoredOmrFile(filePath: string | null | undefined) {
  const diskPath = storedOmrPathToDiskPath(filePath);
  if (!diskPath) return;

  try {
    await unlink(diskPath);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code !== "ENOENT") {
      console.warn("Failed to delete OMR file " + diskPath, error);
    }
  }
}
