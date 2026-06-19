import { execFile } from "child_process";
import { existsSync } from "fs";
import { mkdir, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { OmrTemplateType } from "@/lib/generated/prisma";

const execFileAsync = promisify(execFile);

export type PythonOmrStatus = "OK" | "BLANK" | "MULTI_MARK" | "LOW_CONFIDENCE" | "REVIEW_NEEDED" | "FAILED";
export type PythonPhoneRecognizeStatus = "WAITING" | "OK" | "LOW_CONFIDENCE" | "FAILED" | "MANUAL";

export type PythonOmrAnswer = {
  questionNo: number;
  recognizedAnswer: string | null;
  confidence: number;
  status: PythonOmrStatus;
  scores?: number[];
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
};

export type PythonOmrResult = {
  success?: boolean;
  templateType: string;
  requestedTemplateType?: string;
  layoutId?: string | null;
  phoneLast8?: string | null;
  displayPhoneLast8?: string | null;
  phoneConfidence?: number | null;
  phoneRecognizeStatus?: PythonPhoneRecognizeStatus | string | null;
  phoneBounds?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  answers: PythonOmrAnswer[];
  previewImagePath?: string | null;
  warnings?: string[];
  logs?: string[];
  error?: string | null;
  engine?: {
    name: string;
    usesOpenCV?: boolean;
    usesOmrChecker?: boolean;
    usesFormScanner?: boolean;
    usesPdfium?: boolean;
    usesPillow?: boolean;
    usesNumpy?: boolean;
  };
};

export async function recognizeWithPythonOmr(filePath: string | null, templateType: OmrTemplateType): Promise<PythonOmrResult> {
  if (!filePath) throw new Error("OMR file path is missing.");

  const diskPath = publicPathToDiskPath(filePath);
  const serverUrl = process.env.OMR_SERVER_URL?.replace(/\/+$/, "");

  if (serverUrl) {
    return recognizeViaServer(serverUrl, diskPath, templateType);
  }

  return recognizeViaCli(diskPath, templateType);
}

function publicPathToDiskPath(filePath: string) {
  if (path.isAbsolute(filePath) && !filePath.startsWith("/")) return filePath;
  return path.join(process.cwd(), "public", filePath.replace(/^\/+/, ""));
}

async function recognizeViaServer(serverUrl: string, diskPath: string, templateType: OmrTemplateType) {
  const fileBytes = await readFile(diskPath);
  const form = new FormData();
  form.set("templateType", templateType);
  form.set("file", new Blob([fileBytes]), path.basename(diskPath));

  const response = await fetch(`${serverUrl}/omr/recognize`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Python OMR server failed: ${response.status} ${await response.text()}`);
  }

  return normalizePythonResult(await response.json());
}

async function recognizeViaCli(diskPath: string, templateType: OmrTemplateType) {
  let lastError: unknown = null;
  const script = path.join(process.cwd(), "omr_service", "recognize.py");
  const previewDir = path.join(process.cwd(), "public", "uploads", "omr", "previews");
  const previewArgs = await preparePreviewArgs(previewDir);

  for (const python of pythonCandidates()) {
    try {
      const { stdout } = await execFileAsync(python.command, [...python.args, script, "--file", diskPath, "--template", templateType, ...previewArgs], {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, PYTHONUTF8: "1" },
      });
      return normalizePythonResult(JSON.parse(stdout));
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Python OMR CLI failed: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

async function preparePreviewArgs(previewDir: string) {
  try {
    await mkdir(previewDir, { recursive: true });
    return ["--output-dir", previewDir];
  } catch {
    return [];
  }
}

function pythonCandidates() {
  const homes = Array.from(
    new Set(
      [
        os.homedir(),
        process.env.USERPROFILE,
        process.env.HOME,
        process.env.HOMEDRIVE && process.env.HOMEPATH ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}` : null,
        "C:\\Users\\shsh0",
      ].filter(Boolean) as string[]
    )
  );
  const bundledCandidates = homes
    .map((home) => path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe"))
    .filter((pythonPath) => existsSync(pythonPath));
  const candidates = [
    process.env.ASC_PYTHON_PATH ? { command: process.env.ASC_PYTHON_PATH, args: [] as string[] } : null,
    ...bundledCandidates.map((command) => ({ command, args: [] as string[] })),
    { command: "python", args: [] as string[] },
    { command: "py", args: ["-3"] },
  ].filter(Boolean) as Array<{ command: string; args: string[] }>;

  return candidates.length > 0 ? candidates : [{ command: "python", args: [] as string[] }];
}

function normalizePythonResult(raw: unknown): PythonOmrResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("Python OMR returned invalid JSON.");
  }

  const result = raw as PythonOmrResult;
  if (result.success === false || result.error) throw new Error(result.error || "Python OMR recognition failed.");
  if (!Array.isArray(result.answers)) {
    throw new Error("Python OMR result is missing answers.");
  }

  result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
  result.logs = Array.isArray(result.logs) ? result.logs : [];
  result.previewImagePath = normalizePreviewPath(result.previewImagePath);
  return result;
}

function normalizePreviewPath(previewPath: string | null | undefined) {
  if (!previewPath) return null;
  if (previewPath.startsWith("http://") || previewPath.startsWith("https://") || previewPath.startsWith("/")) return previewPath;

  const publicRoot = path.join(process.cwd(), "public");
  const relative = path.relative(publicRoot, previewPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `/${relative.replace(/\\/g, "/")}`;
  }

  return null;
}
