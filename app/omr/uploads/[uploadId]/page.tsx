import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import OmrUploadReview from "@/components/OmrUploadReview";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ uploadId: string }>;
};

export const dynamic = "force-dynamic";

export default async function OmrUploadReviewPage({ params }: Props) {
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
        <header style={topBar}>
          <div>
            <p style={eyebrow}>OMR 결과 검수</p>
            <h1 style={title}>{upload.student?.name ?? "학생 매칭 필요"}</h1>
            <p style={desc}>{upload.exam?.title ?? "검사 미지정"} / {upload.fileName}</p>
          </div>
          <Link href={listHref} style={backButton}>결과 목록</Link>
        </header>
        <OmrUploadReview upload={upload} reviewUploads={reviewUploads} students={students} exams={exams} />
      </section>
    </main>
  );
}

const page: CSSProperties = { minHeight: "100vh", background: "#f3f4f6", color: "#111827" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, padding: 14, display: "grid", gap: 12 };
const topBar: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 };
const eyebrow: CSSProperties = { margin: 0, color: "var(--asc-primary-deep)", fontSize: 12, fontWeight: 950 };
const title: CSSProperties = { margin: "3px 0", fontSize: 25, fontWeight: 950 };
const desc: CSSProperties = { margin: 0, color: "#6b7280" };
const backButton: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827", padding: "10px 12px", fontWeight: 950, textDecoration: "none", whiteSpace: "nowrap" };
