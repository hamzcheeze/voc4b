import nextEnv from "@next/env";
import { z } from "zod";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const dayArgument = process.argv.indexOf("--day");
const requestedDay =
  dayArgument >= 0 ? process.argv[dayArgument + 1] : undefined;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDay || "") || requestedDay !== today())
  throw new Error(
    "The authorized date must match today's Bangkok date. No rows were deleted.",
  );
const cookie = process.env.AUTH_SESSION_COOKIE;
if (!cookie || !/(?:^|;\s*)(?:__Secure-)?authjs\.session-token=.+/.test(cookie))
  throw new Error(
    "Set AUTH_SESSION_COOKIE to your signed-in browser's NextAuth session cookie.",
  );
const base = new URL(process.env.LIVE_APP_URL || "http://localhost:3000");
if (
  base.protocol !== "https:" &&
  !(
    base.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
  )
)
  throw new Error(
    "Use HTTPS or a local loopback URL to protect the session cookie.",
  );
const endpoint = new URL("/api/words", base);
const response = await fetch(endpoint, {
  headers: { Cookie: cookie },
  redirect: "error",
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok)
  throw new Error(
    "Couldn't read your words. Check the app URL and session cookie.",
  );
const rows = z
  .object({ entries: z.array(z.object({ id: z.uuid(), day: z.string() })) })
  .parse(await response.json());
let removed = 0;
for (const row of rows.entries.filter((entry) => entry.day === requestedDay)) {
  if (today() !== requestedDay)
    throw new Error(
      `The Bangkok date changed after removing ${removed} words.`,
    );
  const target = new URL(endpoint);
  target.searchParams.set("id", row.id);
  const result = await fetch(target, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: base.origin },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (result.status === 404) continue;
  if (!result.ok)
    throw new Error(
      `Removal stopped after ${removed} words. The app did not confirm the next deletion.`,
    );
  removed++;
}
console.log(
  `Deleted ${removed} vocabulary rows for the signed-in user on ${requestedDay}.`,
);
