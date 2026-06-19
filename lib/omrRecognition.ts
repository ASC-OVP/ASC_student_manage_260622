import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import sharp from "sharp";
import { OmrAnswerStatus, OmrTemplateType } from "@/lib/generated/prisma";
import { getOmrTemplate } from "@/lib/omrTemplates";

const execFileAsync = promisify(execFile);
const BASE_WIDTH = 1225;
const BASE_HEIGHT = 1582;

type ChoiceCenter = {
  x: number;
  y: number;
};

type ChoiceQuestionMap = Record<number, ChoiceCenter[]>;

export type RecognizedOmrAnswer = {
  questionNo: number;
  recognizedAnswer: string | null;
  confidence: number;
  status: OmrAnswerStatus;
};

type RawImage = {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
};

export async function recognizeOmrFile(filePath: string | null, templateType: OmrTemplateType): Promise<RecognizedOmrAnswer[]> {
  const template = getOmrTemplate(templateType);
  const image = await loadRawImage(filePath);
  const choiceMap = buildChoiceMap(templateType);

  return template.questions.map((question) => {
    if (question.kind !== "CHOICE" || !choiceMap[question.no]) {
      return {
        questionNo: question.no,
        recognizedAnswer: null,
        confidence: 0,
        status: OmrAnswerStatus.REVIEW_NEEDED,
      };
    }

    return recognizeChoiceQuestion(image, question.no, choiceMap[question.no]);
  });
}

async function loadRawImage(filePath: string | null): Promise<RawImage> {
  if (!filePath) throw new Error("OMR file path is missing.");

  const diskPath = publicPathToDiskPath(filePath);
  const ext = path.extname(diskPath).toLowerCase();
  const input = ext === ".pdf" ? await renderPdfFirstPage(diskPath) : diskPath;
  const { data, info } = await sharp(input)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function publicPathToDiskPath(filePath: string) {
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(process.cwd(), "public", filePath.replace(/^\/+/, ""));
}

async function renderPdfFirstPage(diskPath: string) {
  const script = [
    "import sys",
    "import pypdfium2 as pdfium",
    "doc = pdfium.PdfDocument(sys.argv[1])",
    "page = doc[0]",
    "bitmap = page.render(scale=2.0)",
    "image = bitmap.to_pil()",
    "image.save(sys.stdout.buffer, format='PNG')",
  ].join("\n");

  let lastError: unknown = null;
  for (const python of pythonCandidates()) {
    try {
      const { stdout } = await execFileAsync(python.command, [...python.args, "-c", script, diskPath], {
        encoding: "buffer",
        maxBuffer: 50 * 1024 * 1024,
        windowsHide: true,
      });
      return stdout as Buffer;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`PDF render failed: ${lastError instanceof Error ? lastError.message : "no python renderer"}`);
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

function recognizeChoiceQuestion(image: RawImage, questionNo: number, centers: ChoiceCenter[]): RecognizedOmrAnswer {
  const scores = centers.map((center, index) => ({
    answer: String(index + 1),
    score: markScore(image, center),
  }));
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1] ?? { answer: "", score: 0 };
  const gap = best.score - second.score;

  if (best.score < 0.08) {
    return {
      questionNo,
      recognizedAnswer: null,
      confidence: Math.max(0, 1 - best.score / 0.08),
      status: OmrAnswerStatus.BLANK,
    };
  }

  if (second.score >= 0.08 && (gap < 0.035 || second.score >= best.score * 0.78)) {
    return {
      questionNo,
      recognizedAnswer: best.answer,
      confidence: clamp(gap / 0.08),
      status: OmrAnswerStatus.MULTIPLE,
    };
  }

  return {
    questionNo,
    recognizedAnswer: best.answer,
    confidence: clamp(0.55 + gap * 2.2),
    status: best.score >= 0.13 ? OmrAnswerStatus.RECOGNIZED : OmrAnswerStatus.REVIEW_NEEDED,
  };
}

function markScore(image: RawImage, center: ChoiceCenter) {
  const sx = image.width / BASE_WIDTH;
  const sy = image.height / BASE_HEIGHT;
  const x = Math.round(center.x * sx);
  const y = Math.round(center.y * sy);
  const radius = Math.max(5, Math.round(10 * Math.min(sx, sy)));
  let total = 0;
  let dark = 0;
  let darkness = 0;

  for (let py = y - radius; py <= y + radius; py += 1) {
    if (py < 0 || py >= image.height) continue;
    for (let px = x - radius; px <= x + radius; px += 1) {
      if (px < 0 || px >= image.width) continue;
      const dx = px - x;
      const dy = py - y;
      if (dx * dx + dy * dy > radius * radius) continue;

      const offset = (py * image.width + px) * image.channels;
      const r = image.data[offset] ?? 255;
      const g = image.data[offset + 1] ?? r;
      const b = image.data[offset + 2] ?? r;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);

      total += 1;
      if (luma < 150 && chroma < 80) dark += 1;
      if (luma < 205 && chroma < 95) darkness += (205 - luma) / 205;
    }
  }

  if (total === 0) return 0;
  return dark / total + (darkness / total) * 0.55;
}

function buildChoiceMap(templateType: OmrTemplateType): ChoiceQuestionMap {
  if (templateType === OmrTemplateType.KOREAN || templateType === OmrTemplateType.ENGLISH) return koreanChoiceMap();
  if (templateType === OmrTemplateType.INQUIRY) return inquiryChoiceMap();
  if (templateType === OmrTemplateType.MATH) return mathChoiceMap();
  return {};
}

function koreanChoiceMap() {
  return {
    ...choiceBlock(1, 20, 192, 48, [903, 876, 849, 822, 795]),
    ...choiceBlock(21, 34, 192, 48, [704, 677, 650, 623, 596]),
    ...choiceBlock(35, 45, 192, 48, [343, 316, 289, 262, 235]),
  };
}

function inquiryChoiceMap() {
  return {
    ...choiceBlock(1, 20, 192, 48, [903, 876, 849, 822, 795]),
    ...choiceBlock(21, 40, 192, 48, [270, 243, 216, 189, 162]),
  };
}

function mathChoiceMap() {
  return {
    ...choiceBlock(1, 10, 192, 48, [903, 876, 849, 822, 795]),
    ...choiceBlock(11, 15, 192, 48, [704, 677, 650, 623, 596]),
    ...choiceBlock(23, 28, 720, 48, [489, 462, 435, 408, 381]),
  };
}

function choiceBlock(start: number, end: number, firstX: number, stepX: number, yByAnswer: number[]) {
  const map: ChoiceQuestionMap = {};
  for (let questionNo = start; questionNo <= end; questionNo += 1) {
    const x = firstX + (questionNo - start) * stepX;
    map[questionNo] = yByAnswer.map((y) => ({ x, y }));
  }
  return map;
}

function clamp(value: number) {
  return Math.max(0, Math.min(0.99, value));
}

export function recognitionRunId() {
  return randomUUID();
}
