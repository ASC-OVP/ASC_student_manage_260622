import { NextResponse } from "next/server";
import { createClassGroupFromFormData } from "@/app/classes/actions";

export async function POST(request: Request) {
  const formData = await request.formData();
  const createdClassGroupId = await createClassGroupFromFormData(formData);
  const redirectUrl = new URL(
    createdClassGroupId ? `/classes?classGroupId=${createdClassGroupId}` : "/classes",
    request.url,
  );
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
