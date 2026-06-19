# ASC OMR Service

Python-side OMR recognition layer for ASC.

The Next.js app owns upload, review, grading, and persistence. This service owns PDF/image rendering, preprocessing, mark detection, and JSON recognition output.

## Runtime modes

- CLI fallback used by the Next.js app without extra server setup:
  `python omr_service/recognize.py --file <path> --template KOREAN`
- Optional FastAPI server:
  `pip install -r omr_service/requirements.txt`
  `uvicorn omr_service.api:app --host 127.0.0.1 --port 8010`
  Then set `OMR_SERVER_URL=http://127.0.0.1:8010`.
- Engine selection:
  `ASC_OMR_ENGINE=auto` uses OpenCV when available and falls back to Pillow/numpy.
  `ASC_OMR_ENGINE=omrchecker` or `ASC_OMR_ENGINE=formscanner` records adapter availability and keeps the ASC template pipeline as a safe fallback until a matching template adapter is configured.

## Notes

- OpenCV, OMRChecker, and FormScanner are optional extension points. The CLI works with `pypdfium2`, `Pillow`, and `numpy`.
- Template coordinates are stored as JSON under `omr_service/templates`.
- Recognition output is always meant to be reviewed by a user before grading.
- CLI mode writes a rendered preview image when `--output-dir` is provided. The Next.js fallback stores it under `public/uploads/omr/previews`.
