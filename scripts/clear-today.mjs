import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const requestedDay = process.argv[process.argv.indexOf("--day") + 1];
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDay || "") || requestedDay !== today)
  throw new Error(
    "The authorized date must match today's Bangkok date. No rows were deleted.",
  );
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const token = process.env.SUPABASE_USER_ACCESS_TOKEN;
if (!url || !key || !token)
  throw new Error(
    "Supabase URL, public key and SUPABASE_USER_ACCESS_TOKEN are required.",
  );
const client = createClient(url, key, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const { data: user, error: authError } = await client.auth.getUser(token);
if (authError || !user.user)
  throw new Error("A valid signed-in user access token is required.");
const currentDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
if (currentDay !== requestedDay)
  throw new Error("The Bangkok date changed. No rows were deleted.");
const { data, error } = await client.rpc("clear_vocabulary_today", {
  p_expected_day: requestedDay,
});
if (error)
  throw new Error(
    error.code === "PGRST202"
      ? "Apply migration 002_dictionary.sql first."
      : "The database did not confirm the deletion.",
  );
console.log(
  `Deleted ${data} vocabulary rows for the authenticated user on ${requestedDay}.`,
);
