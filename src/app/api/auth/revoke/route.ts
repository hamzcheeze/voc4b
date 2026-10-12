import { SupabaseAdapter } from "@auth/supabase-adapter";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appMode } from "../../../../application/config";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`;
  if (
    request.headers.get("origin") !== expectedOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return NextResponse.json(
      { error: "Requests from other websites are not allowed." },
      { status: 403, headers },
    );
  }

  const tokens = new Set(
    ["authjs.session-token", "__Secure-authjs.session-token"]
      .map((name) => request.cookies.get(name)?.value)
      .flatMap((value) => (value ? [value] : [])),
  );
  if (tokens.size === 0)
    return new NextResponse(null, { status: 204, headers });

  try {
    if (appMode(process.env) !== "live") throw new Error("Live auth required");
    const adapter = SupabaseAdapter(
      z.object({ url: z.url(), secret: z.string().min(1) }).parse({
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        secret: process.env.SUPABASE_SECRET_KEY,
      }),
    );
    if (!adapter.deleteSession || !adapter.getSessionAndUser)
      throw new Error("Session revocation unavailable");
    for (const token of tokens) {
      await adapter.deleteSession(token);
      if (await adapter.getSessionAndUser(token))
        throw new Error("Session revocation failed");
    }
    return new NextResponse(null, { status: 204, headers });
  } catch {
    return NextResponse.json(
      { error: "Could not sign out. Please try again." },
      { status: 503, headers },
    );
  }
}
