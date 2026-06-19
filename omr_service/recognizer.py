from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageFilter, ImageOps

try:
    from .engines import choose_template_engine, engine_capabilities
except ImportError:  # pragma: no cover - CLI execution
    from engines import choose_template_engine, engine_capabilities

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    cv2 = None


STATUS_OK = "OK"
STATUS_BLANK = "BLANK"
STATUS_MULTI = "MULTI_MARK"
STATUS_LOW = "LOW_CONFIDENCE"
STATUS_REVIEW = "REVIEW_NEEDED"

PHONE_STATUS_WAITING = "WAITING"
PHONE_STATUS_OK = "OK"
PHONE_STATUS_LOW = "LOW_CONFIDENCE"
PHONE_STATUS_FAILED = "FAILED"

UMARIA_LAYOUT_ID = "UMARIA_A4_TEST"


@dataclass
class MarkResult:
    question_no: int
    recognized_answer: str | None
    confidence: float
    status: str
    scores: list[float]
    bounds: dict[str, float] | None


@dataclass
class PhoneResult:
    phone_last8: str | None
    confidence: float
    status: str
    scores: list[list[float]]
    bounds: list[dict[str, float]]


def recognize_file(file_path: str, template_type: str, output_dir: str | None = None) -> dict[str, Any]:
    template = load_template(template_type)
    image = load_first_page_image(file_path)
    requested_template_type = template_type.upper()
    if is_umaria_test_form(image):
        umaria_template = load_template("OTHER")
        if umaria_template.get("layoutId") == UMARIA_LAYOUT_ID:
            template = umaria_template

    capabilities = engine_capabilities()
    engine_name = choose_template_engine(capabilities, cv2 is not None)
    processed = preprocess_image(image)
    phone_result = recognize_phone_last8(processed, template)
    answers: list[MarkResult] = []
    logs = [
        f"requested_template={requested_template_type}",
        f"template={template['templateType']}",
        f"layout={template.get('layoutId', 'default')}",
        f"input_size={image.size[0]}x{image.size[1]}",
        f"engine={engine_name}",
        f"capabilities={json.dumps(capabilities, ensure_ascii=False, sort_keys=True)}",
        f"preprocess={'opencv-adaptive-threshold' if cv2 is not None else 'pillow-numpy-threshold'}",
        f"phoneLast8={phone_result.phone_last8 or ''}",
        f"phoneStatus={phone_result.status}",
        f"phoneConfidence={round(phone_result.confidence, 4)}",
    ]
    if engine_name in {"omrchecker-adapter", "formscanner-adapter"}:
        logs.append(f"{engine_name}: adapter detected; current ASC template pipeline used for 수능형 OMR coordinates")

    for group in template["answerGroups"]:
        if group["type"] != "choice":
            for question_no in range(group["startQuestionNo"], group["endQuestionNo"] + 1):
                answers.append(
                    MarkResult(
                        question_no=question_no,
                        recognized_answer=None,
                        confidence=0.0,
                        status=STATUS_REVIEW,
                        scores=[],
                        bounds=None,
                    )
                )
            logs.append(f"{group['name']}: short-answer group left for manual review")
            continue

        for question_no, centers in iter_choice_centers(group):
            answers.append(score_question(processed, template, question_no, centers))

    preview_path = None
    if output_dir:
        try:
            preview_path = save_preview(image, output_dir, template_type, file_path)
        except Exception as exc:
            logs.append(f"preview_save_failed={exc}")

    answers.sort(key=lambda item: item.question_no)
    return {
        "success": True,
        "templateType": template["templateType"],
        "requestedTemplateType": requested_template_type,
        "layoutId": template.get("layoutId"),
        "phoneLast8": phone_result.phone_last8,
        "displayPhoneLast8": format_phone_last8(phone_result.phone_last8),
        "phoneConfidence": round(phone_result.confidence, 4),
        "phoneRecognizeStatus": phone_result.status,
        "phoneBounds": phone_result.bounds,
        "answers": [
            {
                "questionNo": item.question_no,
                "recognizedAnswer": item.recognized_answer,
                "confidence": round(item.confidence, 4),
                "status": item.status,
                "scores": [round(score, 4) for score in item.scores],
                "bounds": item.bounds,
            }
            for item in answers
        ],
        "previewImagePath": preview_path,
        "warnings": [],
        "error": None,
        "logs": logs,
        "engine": {
            "name": engine_name,
            "usesOpenCV": cv2 is not None,
            "usesOmrChecker": engine_name == "omrchecker-adapter",
            "usesFormScanner": engine_name == "formscanner-adapter",
            "usesPdfium": True,
            "usesPillow": True,
            "usesNumpy": True,
        },
    }


def load_template(template_type: str) -> dict[str, Any]:
    normalized = template_type.upper()
    template_path = Path(__file__).parent / "templates" / f"{normalized}.json"
    if not template_path.exists():
        template_path = Path(__file__).parent / "templates" / "OTHER.json"
    return json.loads(template_path.read_text(encoding="utf-8"))


def is_umaria_test_form(image: Image.Image) -> bool:
    width, height = image.size
    return width > height and width >= 1400 and height >= 900


def load_first_page_image(file_path: str) -> Image.Image:
    path = Path(file_path)
    if path.suffix.lower() == ".pdf":
        doc = pdfium.PdfDocument(str(path))
        bitmap = doc[0].render(scale=2.0)
        return bitmap.to_pil().convert("RGB")
    return Image.open(path).convert("RGB")


def preprocess_image(image: Image.Image) -> np.ndarray:
    if cv2 is not None:
        rgb = np.array(image)
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        gray = deskew_gray(gray)
        gray = cv2.GaussianBlur(gray, (3, 3), 0)
        binary = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            31,
            9,
        )
        kernel = np.ones((2, 2), np.uint8)
        return cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

    gray = ImageOps.grayscale(image)
    gray = gray.filter(ImageFilter.MedianFilter(size=3))
    arr = np.asarray(gray, dtype=np.uint8)
    threshold = max(90, min(180, float(np.percentile(arr, 8)) + 45))
    return np.where(arr < threshold, 255, 0).astype(np.uint8)


def deskew_gray(gray: np.ndarray) -> np.ndarray:
    if cv2 is None:
        return gray

    inverted = cv2.bitwise_not(gray)
    coords = np.column_stack(np.where(inverted > 30))
    if coords.size == 0:
        return gray

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    if abs(angle) < 0.15 or abs(angle) > 8:
        return gray

    height, width = gray.shape[:2]
    matrix = cv2.getRotationMatrix2D((width // 2, height // 2), angle, 1.0)
    return cv2.warpAffine(gray, matrix, (width, height), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def iter_choice_centers(group: dict[str, Any]):
    coord = group["coordinateMap"]
    if "xPositions" in coord and "yPositions" in coord:
        choice_x = [float(x) for x in coord["xPositions"]]
        question_y = [float(y) for y in coord["yPositions"]]
        start = int(group["startQuestionNo"])
        end = int(group["endQuestionNo"])
        for question_no in range(start, end + 1):
            row_index = question_no - start
            if row_index >= len(question_y):
                break
            y = question_y[row_index]
            yield question_no, [{"x": x, "y": y, "size": float(coord.get("boxSize", 22))} for x in choice_x]
        return

    first_x = float(coord["firstX"])
    step_x = float(coord["stepX"])
    choice_y = [float(y) for y in coord["choiceY"]]
    start = int(group["startQuestionNo"])
    end = int(group["endQuestionNo"])
    for question_no in range(start, end + 1):
        x = first_x + (question_no - start) * step_x
        yield question_no, [{"x": x, "y": y, "size": float(coord.get("boxSize", 22))} for y in choice_y]


def coordinate_centers(coord: dict[str, Any]) -> tuple[list[float], list[float], float]:
    if "xPositions" in coord:
        x_positions = [float(x) for x in coord["xPositions"]]
    else:
        count = int(coord.get("columns") or coord.get("digitCount") or 0)
        x_positions = [float(coord["firstX"]) + index * float(coord["stepX"]) for index in range(count)]

    if "yPositions" in coord:
        y_positions = [float(y) for y in coord["yPositions"]]
    else:
        count = int(coord.get("rows") or 10)
        y_positions = [float(coord["firstY"]) + index * float(coord["stepY"]) for index in range(count)]

    return x_positions, y_positions, float(coord.get("boxSize", 22))


def recognize_phone_last8(processed: np.ndarray, template: dict[str, Any]) -> PhoneResult:
    config = template.get("phoneLast8Grid")
    if not config:
        return PhoneResult(None, 0.0, PHONE_STATUS_FAILED, [], [])

    base_w = float(template["pageSize"]["width"])
    base_h = float(template["pageSize"]["height"])
    height, width = processed.shape[:2]
    sx = width / base_w
    sy = height / base_h

    x_positions, digit_y, box_size = coordinate_centers(config["coordinateMap"])
    radius = max(5, int(round((box_size / 2) * min(sx, sy))))
    baseline = config.get("baselineScores") or []
    raw_scores: list[list[float]] = []
    deltas: list[float] = []
    bounds: list[dict[str, float]] = []

    for col_index, x_value in enumerate(x_positions):
        column_scores: list[float] = []
        for row_index, y_value in enumerate(digit_y):
            x = int(round(x_value * sx))
            y = int(round(y_value * sy))
            score = mark_density(processed, x, y, radius)
            column_scores.append(score)
            base_score = safe_baseline(baseline, col_index, row_index)
            deltas.append(score - base_score)
        raw_scores.append(column_scores)

    offset = float(np.median(deltas)) if deltas else 0.0
    mark_threshold = float(config.get("markDeltaThreshold", 0.1))
    low_threshold = float(config.get("lowDeltaThreshold", 0.055))
    digits: list[str] = []
    confidences: list[float] = []
    missing = False
    low_confidence = False

    for col_index, column_scores in enumerate(raw_scores):
        adjusted = [
            max(0.0, score - safe_baseline(baseline, col_index, row_index) - offset)
            for row_index, score in enumerate(column_scores)
        ]
        ranked = sorted(enumerate(adjusted), key=lambda row: row[1], reverse=True)
        best_digit, best_score = ranked[0]
        second_score = ranked[1][1] if len(ranked) > 1 else 0.0
        gap = best_score - second_score

        if best_score < low_threshold:
            missing = True
            confidences.append(0.0)
            digits.append("")
            continue

        confidence = clamp(0.35 + gap * 3.8 + best_score * 1.7)
        if best_score < mark_threshold or confidence < 0.56:
            low_confidence = True

        digits.append(str(best_digit))
        confidences.append(confidence)

        x = int(round(x_positions[col_index] * sx))
        y = int(round(digit_y[best_digit] * sy))
        bounds.append(
            {
                "x": (x - radius) / width,
                "y": (y - radius) / height,
                "width": (radius * 2) / width,
                "height": (radius * 2) / height,
            }
        )

    phone_last8 = "".join(digits) if not missing and len(digits) == 8 and all(digits) else None
    mean_confidence = float(np.mean(confidences)) if confidences else 0.0
    status = PHONE_STATUS_FAILED
    if phone_last8:
        status = PHONE_STATUS_LOW if low_confidence or mean_confidence < 0.62 else PHONE_STATUS_OK

    return PhoneResult(phone_last8, clamp(mean_confidence), status, raw_scores, bounds)


def safe_baseline(baseline: list[Any], first_index: int, second_index: int) -> float:
    try:
        return float(baseline[first_index][second_index])
    except Exception:
        return 0.0


def score_question(processed: np.ndarray, template: dict[str, Any], question_no: int, centers: list[dict[str, float]]) -> MarkResult:
    base_w = float(template["pageSize"]["width"])
    base_h = float(template["pageSize"]["height"])
    blank_threshold = float(template.get("blankThreshold", 0.14))
    marked_threshold = float(template.get("markedThreshold", 0.16))
    multi_threshold = float(template.get("multiThreshold", 0.12))
    height, width = processed.shape[:2]
    sx = width / base_w
    sy = height / base_h
    radius = max(5, int(round(10 * min(sx, sy))))

    scores = []
    bounds = None
    for center in centers:
        x = int(round(center["x"] * sx))
        y = int(round(center["y"] * sy))
        score = mark_density(processed, x, y, radius)
        scores.append(score)
        if score == max(scores):
            bounds = {
                "x": (x - radius) / width,
                "y": (y - radius) / height,
                "width": (radius * 2) / width,
                "height": (radius * 2) / height,
            }

    adjusted_scores = baseline_adjusted_choice_scores(template, question_no, scores)
    ranked = sorted(enumerate(adjusted_scores, start=1), key=lambda row: row[1], reverse=True)
    best_choice, best_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0.0
    gap = best_score - second_score
    if 1 <= best_choice <= len(centers):
        center = centers[best_choice - 1]
        x = int(round(center["x"] * sx))
        y = int(round(center["y"] * sy))
        bounds = {
            "x": (x - radius) / width,
            "y": (y - radius) / height,
            "width": (radius * 2) / width,
            "height": (radius * 2) / height,
        }

    if uses_choice_baseline(template, question_no):
        blank_threshold = float(template.get("baselineBlankThreshold", 0.055))
        marked_threshold = float(template.get("baselineMarkedThreshold", 0.1))
        multi_threshold = float(template.get("baselineMultiThreshold", 0.065))

    if best_score < blank_threshold:
        return MarkResult(question_no, None, clamp(1 - best_score / max(blank_threshold, 0.001)), STATUS_BLANK, adjusted_scores, bounds)

    if second_score >= multi_threshold and (gap < 0.04 or second_score >= best_score * 0.72):
        return MarkResult(question_no, str(best_choice), clamp(gap / max(blank_threshold, 0.001)), STATUS_MULTI, adjusted_scores, bounds)

    confidence = clamp(0.42 + gap * 3.6 + min(0.3, max(0.0, best_score - marked_threshold) * 1.8))
    status = STATUS_OK if best_score >= marked_threshold and confidence >= 0.62 else STATUS_LOW
    return MarkResult(question_no, str(best_choice), confidence, status, adjusted_scores, bounds)


def baseline_adjusted_choice_scores(template: dict[str, Any], question_no: int, scores: list[float]) -> list[float]:
    group = find_choice_group(template, question_no)
    if not group:
        return scores

    baseline = group.get("coordinateMap", {}).get("baselineScores")
    if not baseline:
        return scores

    start = int(group["startQuestionNo"])
    row_index = question_no - start
    row_baseline = baseline[row_index] if 0 <= row_index < len(baseline) else []
    deltas = [score - float(row_baseline[index] if index < len(row_baseline) else 0.0) for index, score in enumerate(scores)]
    offset = float(np.median(deltas)) if deltas else 0.0
    return [max(0.0, delta - offset) for delta in deltas]


def uses_choice_baseline(template: dict[str, Any], question_no: int) -> bool:
    group = find_choice_group(template, question_no)
    return bool(group and group.get("coordinateMap", {}).get("baselineScores"))


def find_choice_group(template: dict[str, Any], question_no: int) -> dict[str, Any] | None:
    for group in template.get("answerGroups", []):
        if group.get("type") == "choice" and int(group["startQuestionNo"]) <= question_no <= int(group["endQuestionNo"]):
            return group
    return None


def mark_density(binary: np.ndarray, x: int, y: int, radius: int) -> float:
    height, width = binary.shape[:2]
    x0 = max(0, x - radius)
    x1 = min(width, x + radius + 1)
    y0 = max(0, y - radius)
    y1 = min(height, y + radius + 1)
    if x0 >= x1 or y0 >= y1:
        return 0.0

    patch = binary[y0:y1, x0:x1]
    yy, xx = np.ogrid[y0:y1, x0:x1]
    mask = (xx - x) ** 2 + (yy - y) ** 2 <= radius**2
    if not np.any(mask):
        return 0.0

    marked = patch[mask] > 0
    return float(np.mean(marked))


def save_preview(image: Image.Image, output_dir: str, template_type: str, file_path: str) -> str:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    stem = Path(file_path).stem[:80] or "upload"
    safe_stem = "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in stem)
    name = f"{safe_stem}-{template_type.lower()}-preview.png"
    path = out / name
    image.save(path)
    return str(path)


def format_phone_last8(value: str | None) -> str | None:
    if not value or len(value) != 8:
        return None
    return f"{value[:4]}-{value[4:]}"


def clamp(value: float) -> float:
    if math.isnan(value):
        return 0.0
    return max(0.0, min(0.99, float(value)))
