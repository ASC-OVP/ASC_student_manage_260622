"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import type { CSSProperties } from "react";

const LABEL_NO_PREVIEW = "\uBBF8\uB9AC\uBCF4\uAE30 \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";
const LABEL_ZOOM_OUT = "\uCD95\uC18C";
const LABEL_ZOOM_IN = "\uD655\uB300";
const LABEL_OPEN_NEW = "\uC0C8 \uCC3D";
const LABEL_PREVIEW = "\uBBF8\uB9AC\uBCF4\uAE30";
const LABEL_OPEN_PDF = "PDF \uC5F4\uAE30";
const LABEL_OPEN_FILE = "\uD30C\uC77C \uC5F4\uAE30";

type Props = {
  filePath: string | null;
  fileType: string | null;
  fileName: string;
};

export default function OmrReviewPreview({ filePath, fileType, fileName }: Props) {
  const [zoom, setZoom] = useState(1);

  if (!filePath) {
    return (
      <div style={emptyBox}>
        <b>{fileName}</b>
        <span>{LABEL_NO_PREVIEW}</span>
      </div>
    );
  }

  const isImage = fileType?.startsWith("image/");
  const isPdf = fileType === "application/pdf" || filePath.toLowerCase().endsWith(".pdf");

  return (
    <div style={previewShell}>
      <div style={toolbar}>
        <span style={zoomText}>{Math.round(zoom * 100)}%</span>
        <button type="button" style={toolButton} onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}>
          {LABEL_ZOOM_OUT}
        </button>
        <button type="button" style={toolButton} onClick={() => setZoom((value) => Math.min(2.4, value + 0.2))}>
          {LABEL_ZOOM_IN}
        </button>
        <a href={filePath} target="_blank" rel="noreferrer" style={openLink}>
          {LABEL_OPEN_NEW}
        </a>
      </div>
      <div style={viewport}>
        <div style={{ ...scaledContent, transform: `scale(${zoom})`, width: `${100 / zoom}%`, height: isPdf ? `${680 / zoom}px` : "auto" }}>
          {isImage && <img src={filePath} alt={`${fileName} ${LABEL_PREVIEW}`} style={image} />}
          {isPdf && (
            <object data={filePath} type="application/pdf" style={pdf}>
              <a href={filePath} target="_blank" rel="noreferrer">
                {LABEL_OPEN_PDF}
              </a>
            </object>
          )}
          {!isImage && !isPdf && (
            <div style={emptyBox}>
              <b>{fileName}</b>
              <a href={filePath} target="_blank" rel="noreferrer" style={openLink}>
                {LABEL_OPEN_FILE}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const previewShell: CSSProperties = { display: "grid", gap: 8, minHeight: 0 };
const toolbar: CSSProperties = { display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" };
const zoomText: CSSProperties = { color: "#6b7280", fontSize: 12, fontWeight: 900, marginRight: "auto" };
const toolButton: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", padding: "6px 8px", fontSize: 12, fontWeight: 900, cursor: "pointer" };
const openLink: CSSProperties = { ...toolButton, color: "#083891", textDecoration: "none" };
const viewport: CSSProperties = { height: 620, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb" };
const scaledContent: CSSProperties = { transformOrigin: "top left", transition: "transform .12s ease" };
const image: CSSProperties = { width: "100%", display: "block", background: "#fff" };
const pdf: CSSProperties = { width: "100%", height: "100%", border: 0, background: "#fff" };
const emptyBox: CSSProperties = { border: "1px dashed #d1d5db", borderRadius: 8, padding: 16, textAlign: "center", color: "#6b7280", display: "grid", gap: 6 };
