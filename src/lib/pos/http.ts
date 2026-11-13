import "server-only";
import { NextResponse } from "next/server";
import { AdminAuthError, handleAdminError } from "@/lib/admin/auth";
import { isDynamicServerUsage } from "@/lib/supabase/server";
import { explainPosError } from "./server";

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** For the catch block of a POS/stock/customer route: auth errors keep their status, the rest are explained. */
export function failed(error: unknown): NextResponse {
  if (error instanceof AdminAuthError || isDynamicServerUsage(error)) return handleAdminError(error);
  if (error instanceof Error) {
    console.error("POS route error:", error);
    return NextResponse.json({ error: explainPosError(error.message) }, { status: 500 });
  }
  return handleAdminError(error);
}
