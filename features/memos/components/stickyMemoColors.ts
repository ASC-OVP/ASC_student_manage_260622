export const defaultStickyMemoColor = "#FEF3C7";

export type StickyMemoColorTheme = {
  value: string;
  label: string;
  surface: string;
  input: string;
  border: string;
  accent: string;
  shadow: string;
};

export const stickyMemoColors: StickyMemoColorTheme[] = [
  {
    value: "#FEF3C7",
    label: "노랑",
    surface: "#fffbeb",
    input: "#fffdf4",
    border: "#facc15",
    accent: "#a16207",
    shadow: "rgba(202, 138, 4, .16)",
  },
  {
    value: "#DBEAFE",
    label: "파랑",
    surface: "#eff6ff",
    input: "#f8fbff",
    border: "#93c5fd",
    accent: "#2563eb",
    shadow: "rgba(37, 99, 235, .14)",
  },
  {
    value: "#DCFCE7",
    label: "초록",
    surface: "#f0fdf4",
    input: "#f8fffb",
    border: "#86efac",
    accent: "#16a34a",
    shadow: "rgba(22, 163, 74, .14)",
  },
  {
    value: "#FCE7F3",
    label: "분홍",
    surface: "#fdf2f8",
    input: "#fff8fc",
    border: "#f9a8d4",
    accent: "#db2777",
    shadow: "rgba(219, 39, 119, .14)",
  },
  {
    value: "#EDE9FE",
    label: "보라",
    surface: "#f5f3ff",
    input: "#fbfaff",
    border: "#c4b5fd",
    accent: "#7c3aed",
    shadow: "rgba(124, 58, 237, .14)",
  },
  {
    value: "#FFE4E6",
    label: "장미",
    surface: "#fff1f2",
    input: "#fff8f9",
    border: "#fda4af",
    accent: "#e11d48",
    shadow: "rgba(225, 29, 72, .14)",
  },
];

export function normalizeStickyMemoColor(value?: string | null) {
  const normalized = (value || defaultStickyMemoColor).trim().toUpperCase();
  return stickyMemoColors.some((color) => color.value === normalized) ? normalized : defaultStickyMemoColor;
}

export function getStickyMemoColorTheme(value?: string | null) {
  const normalized = normalizeStickyMemoColor(value);
  return stickyMemoColors.find((color) => color.value === normalized) ?? stickyMemoColors[0];
}
