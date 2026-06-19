import { clearSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function GET() {
  await clearSession();
  redirect("/login");
}
