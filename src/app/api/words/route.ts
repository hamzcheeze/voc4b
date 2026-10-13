import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticatedRepository,
  RepositoryError,
} from "../../../application/authenticated-repository";
import { addWord } from "../../../application/add-word";
import {
  historicalDaySchema,
  importHistoricalWord,
} from "../../../application/import-historical-word";
import {
  DAILY_LIMIT,
  thaiMeaningSchema,
  dayKey,
  validateDictionaryTerm,
  validateWord,
} from "../../../domain/vocabulary";
import { CambridgeDictionary } from "../../../adapters/dictionary";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
const dictionary = new CambridgeDictionary();
const warmups = new Map<string, { nextAt: number; pending: boolean }>();
const WARMUP_INTERVAL = 2000;
const WARMUP_USERS_LIMIT = 1000;
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
    {
      status:
        error instanceof ApiError || error instanceof RepositoryError
          ? error.status
          : 422,
      headers,
    },
  );
}
function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  // Next's bound address can be 0.0.0.0 while the browser uses localhost.
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`;
  if (origin && origin !== expectedOrigin)
    throw new ApiError("Requests from other websites are not allowed.", 403);
}
export async function GET() {
  try {
    return NextResponse.json(
      {
        entries: await (
          await authenticatedRepository()
        ).repo.listToday(dayKey()),
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
async function wordRequest(request: NextRequest) {
  assertSameOrigin(request);
  if (Number(request.headers.get("content-length") || 0) > 2048)
    throw new ApiError("Request is too large.", 413);
  const authenticated = await authenticatedRepository();
  const text = await request.text();
  if (text.length > 2048) throw new ApiError("Request is too large.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError("Invalid request format.", 400);
  }
  const parsed = z
    .object({ word: z.string(), day: z.string().optional() })
    .safeParse(body);
  if (!parsed.success) throw new ApiError("Enter a word.", 400);
  return {
    ...authenticated,
    word: parsed.data.word,
    day: parsed.data.day,
  };
}
export async function POST(request: NextRequest) {
  try {
    const { repo, word, day, userId } = await wordRequest(request);
    if (day !== undefined) {
      if (process.env.HISTORY_IMPORT_USER_ID !== userId)
        throw new ApiError(
          "Historical imports are not enabled for this account.",
          403,
        );
      const parsed = historicalDaySchema.safeParse(day);
      if (!parsed.success)
        throw new ApiError("Choose a valid date before today.", 400);
      const result = await importHistoricalWord(
        validateDictionaryTerm(word),
        parsed.data,
        {
          repository: repo,
          dictionary,
        },
      );
      return NextResponse.json(result, {
        status: result.skipped ? 200 : 201,
        headers,
      });
    }
    const entry = await addWord(validateWord(word), {
      repository: repo,
      dictionary,
    });
    return NextResponse.json({ entry }, { status: 201, headers });
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: NextRequest) {
  let release: (() => void) | undefined;
  try {
    const { repo, userId, word: input } = await wordRequest(request);
    const word = validateWord(input);
    const now = Date.now();
    for (const [id, warmup] of warmups) {
      if (!warmup.pending && warmup.nextAt <= now) warmups.delete(id);
    }
    const previous = warmups.get(userId);
    if (previous && (previous.pending || previous.nextAt > now))
      throw new ApiError("Please wait before checking another word.", 429);
    if (warmups.size >= WARMUP_USERS_LIMIT)
      throw new ApiError("The dictionary is busy. Please try again.", 429);
    const warmup = { nextAt: now + WARMUP_INTERVAL, pending: true };
    warmups.set(userId, warmup);
    release = () => {
      warmup.pending = false;
    };
    const [count, duplicate] = await Promise.all([
      repo.countToday(),
      repo.hasWord(word),
    ]);
    if (count < DAILY_LIMIT && !duplicate) await dictionary.lookup(word);
    return new NextResponse(null, { status: 204, headers });
  } catch (error) {
    return failure(error);
  } finally {
    release?.();
  }
}
export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const id = z
      .string()
      .uuid()
      .safeParse(request.nextUrl.searchParams.get("id"));
    if (!id.success) throw new ApiError("Choose a word to remove.", 400);
    const removed = await (
      await authenticatedRepository()
    ).repo.removeToday(id.data);
    if (!removed)
      throw new ApiError("This word is no longer in today's list.", 404);
    return new NextResponse(null, { status: 204, headers });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 4096)
      throw new ApiError("Request is too large.", 413);
    const { repo } = await authenticatedRepository();
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 4096)
      throw new ApiError("Request is too large.", 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError("Invalid request format.", 400);
    }
    const parsed = z
      .object({ id: z.string().uuid(), thaiMeaning: thaiMeaningSchema })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      throw new ApiError(
        "Enter a meaning of 1–600 characters for a saved word.",
        400,
      );
    const entry = await repo.updateMeaning(
      parsed.data.id,
      parsed.data.thaiMeaning,
    );
    if (!entry)
      throw new ApiError("This word is no longer in your library.", 404);
    return NextResponse.json({ entry }, { headers });
  } catch (error) {
    return failure(error);
  }
}
