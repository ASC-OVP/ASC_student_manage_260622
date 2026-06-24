"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

type ClassGroupOption = {
  id: string;
  name: string;
};

type Props = {
  selectedId: string | null;
  classGroups: ClassGroupOption[];
};

export default function StudentClassGroupSelect({ selectedId, classGroups }: Props) {
  const router = useRouter();

  return (
    <select
      value={selectedId ?? "all"}
      onChange={(event) => {
        const value = event.target.value;
        router.push(value === "all" ? "/students?classGroupId=all" : `/students?classGroupId=${encodeURIComponent(value)}`);
      }}
      style={select}
      aria-label="반 선택"
    >
      <option value="all">전체 학생</option>
      {classGroups.map((classGroup) => (
        <option key={classGroup.id} value={classGroup.id}>
          {classGroup.name}
        </option>
      ))}
    </select>
  );
}

const select: CSSProperties = {
  minWidth: 190,
  height: 30,
  border: "1px solid #d1d5db",
  borderRadius: 7,
  padding: "0 9px",
  background: "#ffffff",
  color: "#111827",
  fontSize: 12,
  fontWeight: 800,
};
