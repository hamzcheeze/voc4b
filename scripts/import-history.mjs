import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { SupabaseAdapter } from "@auth/supabase-adapter";
import { z } from "zod";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const base = new URL(option("--url", "http://127.0.0.1:3001"));
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error("Historical imports require an isolated local app server.");
const source = z
  .object({
    accountId: z.uuid(),
    accountEmail: z.email(),
    sha256: z.string(),
    rows: z.array(
      z
        .object({
          order: z.number().int().nonnegative(),
          page: z.number().int().positive(),
          day: z.iso.date(),
          word: z.string().min(1).max(80),
          sourceWord: z.string(),
        })
        .passthrough(),
    ),
  })
  .parse(
    JSON.parse(
      readFileSync(
        option("--manifest", "output/imports/vocab2words/manifest.json"),
        "utf8",
      ),
    ),
  );
const target = z.uuid().parse(option("--user-id", source.accountId));
if (target !== source.accountId)
  throw new Error("Manifest account does not match the import target.");
const output = option(
  "--output",
  "output/imports/vocab2words/import-report.json",
);
const concurrency = z.coerce
  .number()
  .int()
  .min(1)
  .max(4)
  .parse(option("--concurrency", "3"));
const limit = z.coerce
  .number()
  .int()
  .positive()
  .parse(option("--limit", String(source.rows.length)));
const retryReport = option("--only-errors");
const retryOrders = retryReport
  ? new Set(
      JSON.parse(readFileSync(retryReport, "utf8"))
        .records.filter((row) => row.status === "error")
        .map((row) => row.order),
    )
  : undefined;
const rows = source.rows
  .filter((row) => !retryOrders || retryOrders.has(row.order))
  .slice(0, limit);
const perDay = new Map();
for (const row of rows) perDay.set(row.day, (perDay.get(row.day) ?? 0) + 1);
if ([...perDay.values()].some((count) => count > 2))
  throw new Error("Source exceeds two words on a learning date.");
if (args.includes("--dry-run")) {
  console.log(
    JSON.stringify({
      target: source.accountEmail,
      rows: rows.length,
      days: perDay.size,
      concurrency,
    }),
  );
  process.exit(0);
}
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const configuration = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SECRET_KEY: z.string().min(1),
  })
  .parse(process.env);
const admin = createClient(
  configuration.NEXT_PUBLIC_SUPABASE_URL,
  configuration.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const adapter = SupabaseAdapter({
  url: configuration.NEXT_PUBLIC_SUPABASE_URL,
  secret: configuration.SUPABASE_SECRET_KEY,
});
const owner = await admin
  .schema("next_auth")
  .from("users")
  .select("id,email")
  .eq("id", target)
  .single();
if (owner.error || owner.data.email !== source.accountEmail)
  throw new Error("Could not verify the target account.");
const baseline = [];
for (let offset = 0; ; offset += 500) {
  const result = await admin
    .from("vocabulary")
    .select("id,word,day,created_at,content")
    .eq("user_id", target)
    .order("id")
    .range(offset, offset + 499);
  if (result.error) throw new Error(result.error.message);
  baseline.push(...result.data);
  if (result.data.length < 500) break;
}
const report = {
  accountEmail: source.accountEmail,
  accountId: target,
  sourceSha256: source.sha256,
  startedAt: new Date().toISOString(),
  baseline: baseline.map((row) => ({
    id: row.id,
    word: row.word,
    day: row.day,
    hash: createHash("sha256").update(JSON.stringify(row)).digest("hex"),
  })),
  records: [],
  status: "running",
};
mkdirSync(dirname(output), { recursive: true });
function checkpoint() {
  writeFileSync(`${output}.tmp`, JSON.stringify(report, null, 2) + "\n");
  renameSync(`${output}.tmp`, output);
}
checkpoint();
const token = randomUUID();
const session = await adapter.createSession({
  sessionToken: token,
  userId: target,
  expires: new Date(Date.now() + 86400000),
});
if (!session) throw new Error("Could not create the temporary import session.");
const delay = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));
const groups = new Map();
const seen = new Map();
for (const row of rows.toSorted(
  (a, b) => a.day.localeCompare(b.day) || a.order - b.order,
)) {
  const key = row.word.toLowerCase();
  if (seen.has(key)) {
    report.records.push({
      ...row,
      status: "duplicate_source",
      firstOrder: seen.get(key),
    });
    continue;
  }
  seen.set(key, row.order);
  const group = groups.get(row.day) ?? [];
  group.push(row);
  groups.set(row.day, group);
}
let completed = 0;
const queue = [...groups.values()];
async function add(row) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(new URL("/api/words", base), {
      method: "POST",
      headers: {
        Cookie: `authjs.session-token=${token}`,
        Origin: base.origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ word: row.word, day: row.day }),
      signal: AbortSignal.timeout(45000),
    });
    const body = await response.json();
    if (response.ok) {
      if (
        !body.entry?.id ||
        (response.status === 201 && body.entry.day !== row.day)
      )
        throw new Error("API returned an unexpected historical record.");
      return {
        ...row,
        status: response.status === 201 ? "created" : "existing",
        id: body.entry.id,
        savedDay: body.entry.day,
        headword: body.entry.content.entry?.headword,
      };
    }
    if (
      attempt < 2 &&
      (response.status >= 500 ||
        response.status === 429 ||
        /unavailable|reach the dictionary|changed during import|try again/i.test(
          body.error ?? "",
        ))
    ) {
      await delay((attempt + 1) * 1500);
      continue;
    }
    return {
      ...row,
      status: "error",
      httpStatus: response.status,
      error: body.error ?? "Unknown API failure",
    };
  }
}
try {
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const group = queue.shift();
        if (!group) return;
        for (const row of group) {
          let result;
          try {
            result = await add(row);
          } catch (error) {
            result = {
              ...row,
              status: "error",
              error: error instanceof Error ? error.message : String(error),
            };
          }
          report.records.push(result);
          completed++;
          checkpoint();
          if (completed % 25 === 0)
            console.log(
              JSON.stringify({
                completed,
                remainingDays: queue.length,
                created: report.records.filter(
                  (row) => row.status === "created",
                ).length,
                errors: report.records.filter((row) => row.status === "error")
                  .length,
              }),
            );
          await delay(250);
        }
      }
    }),
  );
  const response = await fetch(new URL("/api/words", base), {
    headers: { Cookie: `authjs.session-token=${token}` },
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json();
  if (!response.ok || !Array.isArray(body.entries))
    throw new Error("Could not verify imported history through the API.");
  const saved = new Map(body.entries.map((row) => [row.id, row]));
  for (const row of report.records.filter((row) => row.status === "created")) {
    const entry = saved.get(row.id);
    if (
      !entry ||
      entry.day !== row.day ||
      entry.word.toLowerCase() !== row.word.toLowerCase() ||
      entry.content.kind !== "dictionary"
    )
      throw new Error(
        `Historical read-back failed at page ${row.page}, ${row.word}.`,
      );
  }
  const errorCount = report.records.filter(
    (row) => row.status === "error",
  ).length;
  report.status = errorCount ? "completed_with_errors" : "verified";
  report.verifiedImported = report.records.filter(
    (row) => row.status === "created",
  ).length;
  report.totalAfter = body.entries.length;
  report.completedAt = new Date().toISOString();
  checkpoint();
  if (errorCount) process.exitCode = 1;
  console.log(
    JSON.stringify({
      status: report.status,
      created: report.records.filter((row) => row.status === "created").length,
      existing: report.records.filter((row) => row.status === "existing")
        .length,
      duplicates: report.records.filter(
        (row) => row.status === "duplicate_source",
      ).length,
      errors: report.records.filter((row) => row.status === "error").length,
      totalAfter: report.totalAfter,
      report: output,
    }),
  );
} finally {
  await adapter.deleteSession(token);
}
