"use server";

import { signIn } from "../auth";
import { authProviderOptions } from "./auth-providers";
import { z } from "zod";

export async function startSignIn(input: string) {
  const provider = z.enum(["google", "facebook", "chatgpt"]).parse(input);
  if (
    !authProviderOptions(process.env).some(
      (option) => option.id === provider && option.enabled,
    )
  )
    throw new Error("This sign-in provider is unavailable.");
  await signIn(provider, { redirectTo: "/" });
}
