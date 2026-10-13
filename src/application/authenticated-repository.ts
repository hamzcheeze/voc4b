import "server-only";
import { auth } from "../auth";
import { z } from "zod";
import { appMode } from "./config";
import { SupabaseRepository, serviceClient } from "../adapters/supabase";

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function authenticatedRepository() {
  if (appMode(process.env) !== "live")
    throw new RepositoryError(
      "Authentication is not configured for live mode.",
      503,
    );
  const session = await auth();
  if (!session?.user?.id) throw new RepositoryError("Please sign in.", 401);
  const configuration = z
    .object({
      NEXT_PUBLIC_SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(1),
    })
    .parse(process.env);
  const userId = z.uuid().parse(session.user.id);
  return {
    userId,
    repo: new SupabaseRepository(
      serviceClient(
        configuration.NEXT_PUBLIC_SUPABASE_URL,
        configuration.SUPABASE_SECRET_KEY,
      ),
      userId,
    ),
  };
}
