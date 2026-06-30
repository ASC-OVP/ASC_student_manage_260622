import { CLASS_STATUS_LABELS, CLASS_STATUS_OPTIONS } from "../constants";

export type ClassStatus = (typeof CLASS_STATUS_OPTIONS)[number];

export function isClassStatus(status: string): status is ClassStatus {
  return CLASS_STATUS_OPTIONS.includes(status as ClassStatus);
}

export function getClassStatusLabel(status: string | null | undefined) {
  if (!status || !isClassStatus(status)) {
    return "미지정";
  }

  return CLASS_STATUS_LABELS[status];
}

