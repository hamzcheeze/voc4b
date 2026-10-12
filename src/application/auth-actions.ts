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
  const destination: unknown = await signIn(provider, {
    redirectTo: "/",
    redirect: false,
  });
  if (typeof destination !== "string" || !destination)
    throw new Error("Sign-in did not return a destination.");
  return destination;
}
