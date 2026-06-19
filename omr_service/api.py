from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile

from .recognizer import recognize_file

app = FastAPI(title="ASC OMR Service")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/omr/recognize")
async def recognize_omr(file: UploadFile = File(...), templateType: str = Form(...)):
    suffix = Path(file.filename or "omr.pdf").suffix or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        return recognize_file(tmp_path, templateType)
    except Exception as exc:
        return {
            "success": False,
            "templateType": templateType,
            "answers": [],
            "warnings": [str(exc)],
            "error": str(exc),
            "logs": [str(exc)],
        }
    finally:
        Path(tmp_path).unlink(missing_ok=True)
