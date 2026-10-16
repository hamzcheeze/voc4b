import { NextRequest, NextResponse } from "next/server";
import {
  authenticatedRepository,
  RepositoryError,
} from "../../../application/authenticated-repository";
import { historyQuerySchema } from "../../../application/history-query";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const parameters = request.nextUrl.searchParams;
  const parsed = historyQuerySchema.safeParse({
    page: parameters.get("page") ?? "1",
    search: parameters.get("search") ?? "",
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid history search." },
      { status: 400, headers },
    );
  try {
    const result = await (
      await authenticatedRepository()
    ).repo.listHistoryPage(parsed.data);
    return NextResponse.json(result, {
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Couldn't load your history.",
      },
      {
        status: error instanceof RepositoryError ? error.status : 422,
        headers,
      },
    );
  }
}
