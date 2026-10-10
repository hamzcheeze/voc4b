// Runs the real migration in embedded PostgreSQL. Live parallel connections require the optional external check.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const alice = "00000000-0000-0000-0000-000000000001",
  bob = "00000000-0000-0000-0000-000000000002";
const syllables = JSON.stringify([
  { text: "ruh", stressed: false },
  { text: "sind", stressed: true },
]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${alice}'),('${bob}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(readFileSync("supabase/migrations/001_vocabulary.sql", "utf8"));
}, 30000);
afterAll(async () => {
  if (db) await db.close();
});
async function asUser(id: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function save(word: string) {
  return db.query("select * from public.save_vocabulary($1,$2::jsonb,$3,$4)", [
    word,
    syllables,
    "To cancel a decision.",
    "ยกเลิกการตัดสินใจ",
  ]);
}
it("unauthenticated RPC is denied", async () => {
  await db.exec("set role anon");
  await expect(save("rescind")).rejects.toThrow();
});
it("direct inserts cannot bypass RPC", async () => {
  await asUser(alice);
  await expect(
    db.query(
      "insert into public.vocabulary(user_id,word,day,slot,syllables,explanation,thai) values($1,$2,current_date,1,$3::jsonb,$4,$5)",
      [alice, "rescind", syllables, "Cancel.", "ยกเลิก"],
    ),
  ).rejects.toThrow();
});
it("saves exactly two then rejects third", async () => {
  await asUser(alice);
  await save("rescind");
  await save("serene");
  await expect(save("thrive")).rejects.toThrow(/daily_limit/);
  const { rows } = await db.query("select * from public.vocabulary");
  expect(rows).toHaveLength(2);
});
it("RLS isolates users; another user has their own quota", async () => {
  await asUser(bob);
  expect((await db.query("select * from public.vocabulary")).rows).toHaveLength(
    0,
  );
  await save("rescind");
  expect((await db.query("select * from public.vocabulary")).rows).toHaveLength(
    1,
  );
});
it("rejects bad syllables without consuming the second slot", async () => {
  await asUser(bob);
  await expect(
    db.query("select * from public.save_vocabulary($1,$2::jsonb,$3,$4)", [
      "thrive",
      '[{"text":"θraɪv","stressed":true}]',
      "To grow.",
      "เติบโต",
    ]),
  ).rejects.toThrow();
  expect((await db.query("select * from public.vocabulary")).rows).toHaveLength(
    1,
  );
});
