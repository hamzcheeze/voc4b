import { spawn } from "node:child_process";
import assert from "node:assert/strict";
if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    "Set TEST_DATABASE_URL for a disposable local PostgreSQL database",
  );
const uid = "00000000-0000-0000-0000-000000000003";
function sql(query) {
  return new Promise((resolve) => {
    const p = spawn("psql", [
      process.env.TEST_DATABASE_URL,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atc",
      query,
    ]);
    let out = "",
      err = "";
    p.stdout.on("data", (x) => (out += x));
    p.stderr.on("data", (x) => (err += x));
    p.on("close", (code) => resolve({ code, out, err }));
  });
}
let result = await sql(`insert into next_auth.users(id) values('${uid}');`);
assert.equal(result.code, 0, result.err);
const prefix = "set role service_role;";
const call = (word) => {
  const entry = {
    headword: word,
    partsOfSpeech: ["noun"],
    pronunciations: [],
    definitions: [
      {
        id: "0",
        pos: "noun",
        source: "test",
        text: "A simple English example.",
        examples: [],
      },
    ],
    verbForms: [],
  };
  return `${prefix}select word from public.save_vocabulary('${uid}','${word}','${JSON.stringify(entry)}'::jsonb);`;
};
const results = await Promise.all(
  ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"].map(
    (word) => sql(call(word)),
  ),
);
assert.equal(
  results.filter((x) => x.code === 0).length,
  2,
  JSON.stringify(results),
);
assert.equal(results.filter((x) => x.err.includes("daily_limit")).length, 6);
result = await sql(
  `select count(*) from public.vocabulary where user_id='${uid}';`,
);
assert.equal(result.out.trim(), "2");
console.log(
  "PASS: 8 simultaneous connections, exactly 2 saved, 6 daily_limit rejections.",
);
