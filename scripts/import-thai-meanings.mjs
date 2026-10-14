import env from "@next/env";
import { createClient } from "@supabase/supabase-js";
import {
  createReadStream,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

const args = process.argv.slice(2);
const option = (key, fallback) => {
  const index = args.indexOf(key);
  return index < 0 ? fallback : args[index + 1];
};
const folder = "output/imports/vocab2words/thai/";
const sourcePath = option("--source", folder + "transcription.json");
const reportPath = option("--report", folder + "import-report.json");
const limit = z.coerce
  .number()
  .int()
  .positive()
  .parse(option("--limit", "100000"));
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = read("output/imports/vocab2words/manifest.json");
const original = read("output/imports/vocab2words/final-report.json");
const baseline = read(folder + "baseline.json");
const pdfDigest = createHash("sha256");
for await (const chunk of createReadStream(manifest.sourcePdf))
  pdfDigest.update(chunk);
if (pdfDigest.digest("hex") !== manifest.sha256)
  throw Error("The PDF differs from the reviewed source.");
if (
  original.accountEmail !== manifest.accountEmail ||
  baseline.account.id !== manifest.accountId ||
  baseline.account.email !== manifest.accountEmail
)
  throw Error("Import target does not match the captured account.");
const sourceSchema = z.array(
  z
    .object({
      order: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      day: z.string(),
      sourceWord: z.string(),
      word: z.string(),
      thaiMeaning: z.string().nullable(),
      confidence: z.enum(["clear", "uncertain", "missing"]),
      note: z.string(),
    })
    .strict(),
);
const source = sourceSchema.parse(read(sourcePath));
if (new Set(source.map((row) => row.order)).size !== source.length)
  throw Error("Repeated source identity.");
if (!args.includes("--allow-partial") && source.length !== manifest.rows.length)
  throw Error("The source must cover every reviewed PDF row.");
const savedRows = new Map(original.records.map((row) => [row.order, row]));
const baselineRows = new Map(baseline.rows.map((row) => [row.id, row]));
const groups = new Map();
const excluded = [];
for (const row of source) {
  const reviewed = manifest.rows.find((item) => item.order === row.order);
  if (
    !reviewed ||
    ["page", "day", "sourceWord", "word"].some(
      (key) => reviewed[key] !== row[key],
    )
  )
    throw Error("Transcription identity changed at source order " + row.order);
  const saved = savedRows.get(row.order);
  if (!saved?.id) {
    if (saved?.status !== "skipped_unavailable")
      throw Error(
        "Unexpected source row without a saved identity: " + row.order,
      );
    excluded.push({ ...row, status: "excluded_dictionary_entry" });
    continue;
  }
  const target = baselineRows.get(saved.id);
  if (!target) {
    excluded.push({ ...row, status: "record_missing" });
    continue;
  }
  if (target.word.toLowerCase() !== row.word.toLowerCase())
    throw Error("Saved-word identity mismatch at " + row.order);
  const group = groups.get(saved.id) ?? {
    id: saved.id,
    word: target.word,
    day: target.day,
    sources: [],
  };
  group.sources.push(row);
  groups.set(saved.id, group);
}
const planned = [...groups.values()]
  .map((group) => {
    const clear = group.sources.filter(
      (row) => row.confidence === "clear" && row.thaiMeaning,
    );
    const meanings = [
      ...new Set(
        clear.map((row) =>
          row.thaiMeaning.normalize("NFC").trim().replace(/\s+/gu, " "),
        ),
      ),
    ];
    const thaiMeaning = meanings.join(" / ");
    if (
      thaiMeaning &&
      (!/[ก-๿]/u.test(thaiMeaning) ||
        /[\p{Cc}]/u.test(thaiMeaning) ||
        [...thaiMeaning].length > 600)
    )
      throw Error("Invalid meaning for " + group.word);
    return {
      ...group,
      thaiMeaning,
      status: meanings.length ? "planned" : "needs_review",
    };
  })
  .slice(0, limit);
const sourceHash = createHash("sha256")
  .update(readFileSync(sourcePath))
  .digest("hex");
const partial =
  source.length !== manifest.rows.length || planned.length < groups.size;
const sourceUncertainties = planned.flatMap((group) =>
  group.sources.filter((row) => row.confidence !== "clear" || !row.thaiMeaning),
);
if (!args.includes("--apply") && !args.includes("--verify")) {
  writeFileSync(
    option("--plan", folder + "write-plan.json"),
    JSON.stringify(
      {
        account: baseline.account,
        sourcePath,
        sourceHash,
        partial,
        sourceUncertainties,
        planned,
        excluded,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      status: "dry_run",
      target: baseline.account.email,
      sourceRows: source.length,
      planned: planned.length,
      needsReview: planned.filter((row) => row.status === "needs_review")
        .length,
      excluded: excluded.length,
    }),
  );
  process.exit(0);
}
env.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const configuration = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SECRET_KEY: z.string().min(1),
  })
  .parse(process.env);
const client = createClient(
  configuration.NEXT_PUBLIC_SUPABASE_URL,
  configuration.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const owner = await client
  .schema("next_auth")
  .from("users")
  .select("id,email")
  .eq("id", manifest.accountId)
  .single();
if (owner.error || !isDeepStrictEqual(owner.data, baseline.account))
  throw Error("Could not verify the target account.");
const list = async () => {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const result = await client
      .from("vocabulary")
      .select("*")
      .eq("user_id", manifest.accountId)
      .order("id")
      .range(offset, offset + 499);
    if (result.error) throw Error(result.error.message);
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
};
const before = new Map((await list()).map((row) => [row.id, row]));
const withoutMeaning = (row) => {
  const content = { ...row.content };
  delete content.thaiMeaning;
  return { ...row, content };
};
const report = {
  startedAt: new Date().toISOString(),
  account: owner.data,
  sourcePath,
  sourceHash,
  status: "running",
  partial,
  sourceUncertainties,
  records: [],
  excluded,
};
function checkpoint() {
  writeFileSync(reportPath + ".tmp", JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  renameSync(reportPath + ".tmp", reportPath);
}
let completed = 0;
for (const row of planned) {
  const captured = baselineRows.get(row.id);
  const current = before.get(row.id);
  if (
    !current ||
    !isDeepStrictEqual(withoutMeaning(current), withoutMeaning(captured))
  )
    throw Error("Stored word changed since baseline: " + row.word);
  let result = { ...row };
  if (row.status === "needs_review") result.status = "needs_review";
  else if (current.content.thaiMeaning === row.thaiMeaning)
    result.status = "already_matched";
  else if (
    current.content.thaiMeaning &&
    current.content.thaiMeaning !== row.thaiMeaning
  )
    result.status = "existing_meaning_preserved";
  else if (args.includes("--verify"))
    throw Error("Meaning read-back mismatch: " + row.word);
  else {
    const response = await client
      .from("vocabulary")
      .update({ content: { ...current.content, thaiMeaning: row.thaiMeaning } })
      .eq("user_id", manifest.accountId)
      .eq("id", row.id)
      .eq("content", JSON.stringify(current.content))
      .select("*");
    if (response.error) {
      result.status = "error";
      result.error = response.error.message;
    } else {
      const returned = response.data;
      if (Array.isArray(returned) && returned.length === 0) {
        result.status = "concurrent_change_preserved";
        report.records.push(result);
        checkpoint();
        continue;
      }
      if (
        !Array.isArray(returned) ||
        returned.length !== 1 ||
        returned[0].id !== row.id ||
        returned[0].user_id !== manifest.accountId ||
        returned[0].content.thaiMeaning !== row.thaiMeaning ||
        !isDeepStrictEqual(withoutMeaning(returned[0]), withoutMeaning(current))
      )
        throw Error("Update altered unexpected fields: " + row.word);
      result.status = "updated";
    }
  }
  report.records.push(result);
  checkpoint();
  completed++;
  if (completed % 100 === 0)
    console.log(
      JSON.stringify({
        completed,
        total: planned.length,
        updated: report.records.filter((row) => row.status === "updated")
          .length,
      }),
    );
}
const after = await list();
const actual = new Map(after.map((row) => [row.id, row]));
const importedIds = new Set(
  original.records.map((row) => row.id).filter(Boolean),
);
for (const row of baseline.rows) {
  const saved = actual.get(row.id);
  if (!saved || !isDeepStrictEqual(withoutMeaning(row), withoutMeaning(saved)))
    throw Error("Baseline content or identity changed: " + row.word);
  if (!importedIds.has(row.id) && !isDeepStrictEqual(row, saved))
    throw Error("A word outside the PDF import changed: " + row.word);
}
for (const row of report.records) {
  if (
    ["updated", "already_matched"].includes(row.status) &&
    actual.get(row.id)?.content.thaiMeaning !== row.thaiMeaning
  )
    throw Error("Final read-back mismatch: " + row.word);
}
report.finishedAt = new Date().toISOString();
report.baselineCoreUnchanged = true;
report.unrelatedWordsUnchanged = true;
report.totalRows = after.length;
report.verified = report.records.filter((row) =>
  ["updated", "already_matched", "existing_meaning_preserved"].includes(
    row.status,
  ),
).length;
report.status =
  report.records.some((row) =>
    ["error", "needs_review", "concurrent_change_preserved"].includes(
      row.status,
    ),
  ) ||
  excluded.some((row) => row.status === "record_missing") ||
  sourceUncertainties.length > 0
    ? "completed_with_gaps"
    : partial
      ? "verified_partial"
      : "verified";
checkpoint();
console.log(
  JSON.stringify({
    status: report.status,
    target: owner.data.email,
    updated: report.records.filter((row) => row.status === "updated").length,
    matched: report.records.filter((row) => row.status === "already_matched")
      .length,
    needsReview: report.records.filter((row) => row.status === "needs_review")
      .length,
    errors: report.records.filter((row) => row.status === "error").length,
    excluded: excluded.length,
    totalRows: after.length,
    report: reportPath,
  }),
);
if (report.status === "completed_with_gaps") process.exitCode = 1;
