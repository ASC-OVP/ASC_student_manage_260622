
import type { StudentStatus } from "@/lib/generated/prisma";
import { studentStatusLabel, studentStatusTone } from "@/features/students/lib/studentStatus";

type Props = { status: StudentStatus | string };

export default function StudentStatusBadge({ status }: Props) {
  return <span data-tone={studentStatusTone(status)}>{studentStatusLabel(status)}</span>;
}
