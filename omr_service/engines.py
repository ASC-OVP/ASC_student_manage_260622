from __future__ import annotations

import os
from importlib.util import find_spec
from typing import Any


def module_available(name: str) -> bool:
    return find_spec(name) is not None


def engine_capabilities() -> dict[str, Any]:
    return {
        "requested": os.environ.get("ASC_OMR_ENGINE", "auto"),
        "omrCheckerAvailable": module_available("omrchecker") or module_available("OMRChecker"),
        "formScannerAvailable": module_available("formscanner") or module_available("form_scanner"),
        "openCvAvailable": module_available("cv2"),
        "pdfiumAvailable": module_available("pypdfium2"),
        "pillowAvailable": module_available("PIL"),
        "numpyAvailable": module_available("numpy"),
    }


def choose_template_engine(capabilities: dict[str, Any], has_opencv: bool) -> str:
    requested = str(capabilities.get("requested") or "auto").lower()

    if requested in {"omrchecker", "omr-checker"} and capabilities.get("omrCheckerAvailable"):
        return "omrchecker-adapter"

    if requested in {"formscanner", "form-scanner"} and capabilities.get("formScannerAvailable"):
        return "formscanner-adapter"

    if has_opencv:
        return "opencv-template"

    return "pillow-numpy-template"
