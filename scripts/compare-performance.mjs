import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir, cpus, loadavg } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const before = option("--before");
const after = option("--after");
const output = option("--output");
if (!before || !after || !output)
  throw new Error(
    "Usage: bun scripts/compare-performance.mjs --before http://localhost:3002 --after http://localhost:3003 --output docs/performance.json",
  );
const directory = mkdtempSync(join(tmpdir(), "voc4b-performance-"));
const words = ["serene", "ambush", "cite", "misery", "notorious"];
const runs = { before: [], after: [] };
const initialLoadAverage = loadavg();
for (const [index, word] of words.entries()) {
  for (const side of index % 2 === 0
    ? ["before", "after"]
    : ["after", "before"]) {
    const artifact = join(directory, `${side}-${index}.json`);
    const child = spawnSync(
      process.execPath,
      [
        "scripts/measure-performance.mjs",
        "--url",
        side === "before" ? before : after,
        "--output",
        artifact,
        "--words",
        word,
      ],
      { encoding: "utf8" },
    );
    if (child.status !== 0)
      throw new Error(`Measurement failed. Inspect ${artifact}.`);
    const result = JSON.parse(readFileSync(artifact, "utf8"));
    if (
      result.failures.length ||
      result.runs.length !== 1 ||
      !result.runs[0].verifiedWrite
    )
      throw new Error(`Invalid result in ${artifact}.`);
    runs[side].push(result.runs[0]);
    console.log(
      `${side} ${word}: home ${Math.round(result.home.medianMs)} ms, add ${Math.round(result.add.medianMs)} ms`,
    );
  }
}
const summary = Object.fromEntries(
  Object.entries(runs).map(([side, samples]) => [
    side,
    Object.fromEntries(
      ["homeMs", "addMs"].map((metric) => {
        const values = samples
          .map((sample) => sample[metric])
          .sort((a, b) => a - b);
        return [
          metric,
          {
            count: values.length,
            medianMs: values[Math.floor(values.length / 2)],
            rangeMs: [values[0], values.at(-1)],
          },
        ];
      }),
    ),
  ]),
);
const result = {
  method: {
    runtime:
      "Bun / Next.js production builds, local loopback servers without server profiling",
    database:
      "Real Supabase, isolated temporary accounts with one existing word",
    home: "Navigation start to first frame containing saved vocabulary",
    add: "Form submit event to first frame with saved word and closed dialog",
    runs: "Five per version, paired interleaved order, same words and dataset",
    dictionaryCache:
      "Timed words cold in both process caches; seed and warmup outside timed interval",
    validation:
      "Every POST 201, content verified against DB read-back, temporary accounts deleted",
    excludes:
      "Google provider interaction, Vercel cold starts and Playwright polling overhead",
    machineCores: cpus().length,
    initialLoadAverage,
  },
  summary,
  runs,
  failures: [],
};
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
