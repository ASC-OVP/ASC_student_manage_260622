from __future__ import annotations

import argparse
import json
import sys

from recognizer import recognize_file


def main() -> int:
    parser = argparse.ArgumentParser(description="Recognize ASC OMR PDF/image file.")
    parser.add_argument("--file", required=True)
    parser.add_argument("--template", required=True)
    parser.add_argument("--output-dir")
    args = parser.parse_args()

    try:
        result = recognize_file(args.file, args.template, args.output_dir)
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        sys.stdout.write(
            json.dumps(
                {
                    "success": False,
                    "templateType": args.template,
                    "answers": [],
                    "warnings": [str(exc)],
                    "error": str(exc),
                    "logs": [str(exc)],
                },
                ensure_ascii=False,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
