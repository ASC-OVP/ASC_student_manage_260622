import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OmrUploadReview from "./OmrUploadReview";

type Props = {
  params: Promise<{ uploadId: string }>;
};

export default async function OmrUploadReviewPageView({ params }: Props) {
  const user = await requireUser();
  const { uploadId } = await params;

  const upload = await prisma.omrUpload.findFirst({
    where: { id: uploadId, academyId: user.academyId },
    include: {
      student: { select: { id: true, name: true, schoolName: true, grade: true, phone: true, parentPhone: true } },
      exam: {
        select: {
          id: true,
          title: true,
          templateType: true,
          questionCount: true,
          answerKeys: { orderBy: { questionNo: "asc" }, select: { questionNo: true, answer: true, score: true } },
        },
      },
      recognizedAnswers: { orderBy: { questionNo: "asc" } },
      results: { orderBy: { createdAt: "desc" }, take: 1, include: { items: { orderBy: { questionNo: "asc" } } } },
    },
  });

  if (!upload) notFound();

  const [reviewUploads, students, exams] = await Promise.all([
    prisma.omrUpload.findMany({
      where: upload.examId ? { academyId: user.academyId, examId: upload.examId } : { academyId: user.academyId, id: upload.id },
      include: {
        student: { select: { id: true, name: true, schoolName: true, grade: true } },
        recognizedAnswers: { select: { status: true } },
        results: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.student.findMany({
      where: { academyId: user.academyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, schoolName: true, grade: true, phone: true, parentPhone: true },
    }),
    prisma.exam.findMany({
      where: { academyId: user.academyId },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, title: true },
    }),
  ]);

  const listHref = upload.examId ? `/omr?examId=${upload.examId}&mode=results` : "/omr";

  return (
    <main style={page}>
      <section style={container}>
        <div style={topBar}>
          <PageHeader
            eyebrow="OMR 결과 검수"
            title={upload.student?.name ?? "학생 매칭 필요"}
            description={`${upload.exam?.title ?? "검사 미지정"} / ${upload.fileName}`}
            meta={<StatusBadge status={upload.status} />}
            actions={<ButtonLink href={listHref} variant="secondary" size="sm">결과 목록</ButtonLink>}
          />
        </div>
        <OmrUploadReview upload={upload} reviewUploads={reviewUploads} students={students} exams={exams} />
      </section>
    </main>
  );
}

const page: CSSProperties = { minHeight: "100vh", background: "var(--asc-bg-subtle)", color: "var(--asc-text)" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, padding: 12, display: "grid", gap: 12 };
const topBar: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 14 };
