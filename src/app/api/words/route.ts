import { NextRequest, NextResponse } from "next/server";
import { appMode } from "../../../application/config";
import { addWord } from "../../../application/add-word";
import { CambridgeDictionary } from "../../../adapters/dictionary";
import { SupabaseRepository, userClient } from "../../../adapters/supabase";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
const dictionary = new CambridgeDictionary();
async function repository(request: NextRequest) {
  if (appMode(process.env) !== "live")
    throw new ApiError("Supabase is not configured for live mode.", 503);
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new ApiError("Please sign in.", 401);
  const client = userClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    token,
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  return new SupabaseRepository(client);
}
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
    },
    { status: error instanceof ApiError ? error.status : 422, headers },
  );
}
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      { entries: await (await repository(request)).list() },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    // Next's bound address can be 0.0.0.0 while the browser uses localhost.
    const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`;
    if (origin && origin !== expectedOrigin)
      throw new ApiError("Requests from other websites are not allowed.", 403);
    if (Number(request.headers.get("content-length") || 0) > 2048)
      throw new ApiError("Request is too large.", 413);
    const repo = await repository(request);
    const text = await request.text();
    if (text.length > 2048) throw new ApiError("Request is too large.", 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError("Invalid request format.", 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("word" in body) ||
      typeof body.word !== "string"
    )
      throw new ApiError("Enter a word.", 400);
    const entry = await addWord(body.word, {
      repository: repo,
      dictionary,
    });
    return NextResponse.json({ entry }, { status: 201, headers });
  } catch (error) {
    return failure(error);
  }
}
