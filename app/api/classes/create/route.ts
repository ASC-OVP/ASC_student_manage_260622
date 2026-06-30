import { NextResponse } from "next/server";
import { createClassGroupFromFormData } from "@/features/classes/actions/classActions";

function redirectTo(path: string, request: Request) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}

function classGroupCreateErrorParam(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "CLASS_GROUP_EMPTY_NAME") return "empty";
    if (error.message === "CLASS_GROUP_DUPLICATE_NAME") return "duplicate";
  }

  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    return "duplicate";
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const createdClassGroupId = await createClassGroupFromFormData(formData);
    return redirectTo(createdClassGroupId ? `/classes?classGroupId=${createdClassGroupId}` : "/classes", request);
  } catch (error) {
    const errorParam = classGroupCreateErrorParam(error);
    if (errorParam) return redirectTo(`/classes/new?error=${errorParam}`, request);
    throw error;
  }
}
