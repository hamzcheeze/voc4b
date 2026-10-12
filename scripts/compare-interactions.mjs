import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
for (const name of ["--before", "--after", "--output"]) {
  if (!args.includes(name)) throw new Error(`Missing ${name}`);
}
const directory = mkdtempSync(join(tmpdir(), "voc4b-interactions-"));
const result = { before: [], after: [], order: [], inputPauseMs: 1600 };
try {
  for (const [index, word] of [
    "tranquil",
    "earnest",
    "humble",
    "brisk",
    "nimble",
  ].entries()) {
    for (const side of index % 2 === 0
      ? ["before", "after"]
      : ["after", "before"]) {
      const output = join(directory, `${index}-${side}.json`);
      const child = spawnSync(
        process.execPath,
        [
          "scripts/measure-interactions.mjs",
          "--url",
          option(`--${side}`),
          "--output",
          output,
          "--words",
          word,
        ],
        { encoding: "utf8" },
      );
      if (child.status !== 0)
        throw new Error(child.stderr || "Measurement failed.");
      const measurement = JSON.parse(readFileSync(output, "utf8"));
      if (
        measurement.runs.length !== 1 ||
        !measurement.runs[0].saved ||
        !measurement.runs[0].sessionRevoked
      )
        throw new Error("Measurement did not complete the user actions.");
      result[side].push(measurement.runs[0]);
      result.order.push({ side, word });
    }
  }
  for (const side of ["before", "after"]) {
    result[`${side}Summary`] = Object.fromEntries(
      ["historyMs", "todayMs", "addMs", "signedOutMs", "signInDepartureMs"].map(
        (key) => {
          const values = result[side]
            .map((run) => run[key])
            .sort((a, b) => a - b);
          return [
            key,
            {
              median: values[2],
              min: values[0],
              max: values.at(-1),
              count: values.length,
            },
          ];
        },
      ),
    );
  }
  writeFileSync(option("--output"), JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify({
      before: result.beforeSummary,
      after: result.afterSummary,
    }),
  );
} finally {
  rmSync(directory, { recursive: true });
}
