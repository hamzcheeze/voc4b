// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, afterEach, it, expect } from "vitest";
import { dictionaryEntry } from "./fixtures/dictionary";

const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const migration = readFileSync("supabase/migrations/005_nextauth.sql", "utf8");
let db: PGlite;
async function bootstrap() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    insert into auth.users values ('${alice}', 'Alice@Gmail.com', now(), '{}'), ('${bob}', 'bob@gmail.com', now(), '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  for (const file of [
    "001_vocabulary.sql",
    "002_dictionary.sql",
    "003_unique_words.sql",
    "004_remove_today_word.sql",
  ]) {
    await database.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  return database;
}
beforeAll(async () => {
  db = await bootstrap();
  await db.exec(migration);
  await db.exec(
    readFileSync("supabase/migrations/006_history_pagination.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/007_thai_meaning.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/007_thai_meaning.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/008_phrasal_verbs.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/008_phrasal_verbs.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  if (db) await db.close();
});
afterEach(async () => {
  await db.exec("reset role; truncate public.vocabulary;");
});
it("indexes owner-scoped History order", async () => {
  const result = await db.query<{ indexdef: string }>(
    "select indexdef from pg_indexes where schemaname='public' and indexname='vocabulary_history_page'",
  );
  expect(result.rows[0].indexdef).toContain(
    "(user_id, day DESC, created_at DESC, word DESC, id DESC)",
  );
});
async function service() {
  await db.exec("reset role; set role service_role;");
}
async function save(owner = alice, word = "ought") {
  return db.query<{ id: string; user_id: string; word: string; slot: number }>(
    "select * from public.save_vocabulary($1::uuid,$2,$3::jsonb)",
    [owner, word, JSON.stringify({ ...dictionaryEntry, headword: word })],
  );
}
it("imports the old UUID and words unchanged, normalizes email, and reruns safely", async () => {
  const old = await bootstrap();
  try {
    await old.query(
      "insert into public.vocabulary(user_id,day,slot,word,content) values($1,current_date-1,1,'ought',$2::jsonb)",
      [alice, JSON.stringify({ kind: "dictionary", entry: dictionaryEntry })],
    );
    const before = (await old.query("select * from public.vocabulary")).rows;
    await old.exec(migration);
    await old.exec(migration);
    expect((await old.query("select * from public.vocabulary")).rows).toEqual(
      before,
    );
    expect(
      (await old.query("select id,email from next_auth.users order by id"))
        .rows,
    ).toEqual([
      { id: alice, email: "alice@gmail.com" },
      { id: bob, email: "bob@gmail.com" },
    ]);
    expect(
      (await old.query("select id from auth.users order by id")).rows,
    ).toEqual([{ id: alice }, { id: bob }]);
    const foreignKey = await old.query<{ parent: string }>(
      "select confrelid::regclass::text as parent from pg_constraint where conrelid='public.vocabulary'::regclass and contype='f'",
    );
    expect(foreignKey.rows).toEqual([{ parent: "next_auth.users" }]);
  } finally {
    await old.close();
  }
}, 30000);
it("aborts on case-insensitive collisions without repointing ownership", async () => {
  const old = await bootstrap();
  try {
    await old.exec(
      "update auth.users set email='ALICE@gmail.com' where email='bob@gmail.com'",
    );
    await expect(old.exec(migration)).rejects.toThrow("auth_email_collision");
    await old.exec("rollback");
    expect(
      (
        await old.query(
          "select to_regclass('next_auth.users')::text as table_name",
        )
      ).rows,
    ).toEqual([{ table_name: null }]);
    expect(
      (
        await old.query(
          "select confrelid::regclass::text as parent from pg_constraint where conrelid='public.vocabulary'::regclass and contype='f'",
        )
      ).rows,
    ).toEqual([{ parent: "auth.users" }]);
  } finally {
    await old.close();
  }
}, 30000);
it.each(["anon", "authenticated"])(
  "denies %s vocabulary and identity access and all trusted-owner RPCs",
  async (role) => {
    await db.exec(`set role ${role}`);
    await expect(save()).rejects.toThrow("permission denied");
    await expect(
      db.query("select public.vocabulary_today_count($1::uuid)", [alice]),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query("select public.delete_vocabulary_today($1::uuid,$2::uuid)", [
        alice,
        bob,
      ]),
    ).rejects.toThrow("permission denied");
    await expect(db.exec("select * from public.vocabulary")).rejects.toThrow(
      "permission denied",
    );
    await expect(db.exec("select * from next_auth.sessions")).rejects.toThrow(
      "permission denied",
    );
  },
);
it("removes old browser-authorized RPC overloads", async () => {
  const result = await db.query(
    "select to_regprocedure('public.save_vocabulary(text,jsonb)')::text as save, to_regprocedure('public.delete_vocabulary_today(uuid)')::text as remove, to_regprocedure('public.vocabulary_today_count()')::text as count, to_regprocedure('public.clear_vocabulary_today(date)')::text as clear",
  );
  expect(result.rows).toEqual([
    { save: null, remove: null, count: null, clear: null },
  ]);
});
it("keeps separate owner quotas and preserves duplicate/compaction rules", async () => {
  await service();
  const first = (await save()).rows[0];
  await save(alice, "rescind");
  await expect(save(alice, "serene")).rejects.toThrow("daily_limit");
  expect(
    (
      await db.query(
        "select public.delete_vocabulary_today($1::uuid,$2::uuid) as removed",
        [bob, first.id],
      )
    ).rows,
  ).toEqual([{ removed: false }]);
  expect(
    (
      await db.query(
        "select public.delete_vocabulary_today($1::uuid,$2::uuid) as removed",
        [alice, first.id],
      )
    ).rows,
  ).toEqual([{ removed: true }]);
  expect((await save(alice, "serene")).rows[0].slot).toBe(2);
  await expect(save(alice, "RESCIND")).rejects.toThrow("duplicate_word");
  expect((await save(bob)).rows[0].user_id).toBe(bob);
  expect(
    (
      await db.query(
        "select public.vocabulary_today_count($1::uuid) as count",
        [bob],
      )
    ).rows,
  ).toEqual([{ count: 1 }]);
  expect(
    (
      await db.query(
        "select word from public.vocabulary where user_id=$1 order by word",
        [alice],
      )
    ).rows,
  ).toEqual([{ word: "rescind" }, { word: "serene" }]);
});
it("refuses unrecognized owners and malformed dictionary payloads", async () => {
  await service();
  await expect(save("00000000-0000-4000-8000-000000000099")).rejects.toThrow(
    "authentication_required",
  );
  await expect(
    db.query(
      "select * from public.save_vocabulary($1::uuid,'ought','{}'::jsonb)",
      [alice],
    ),
  ).rejects.toThrow("invalid_entry");
  expect((await db.query("select * from public.vocabulary")).rows).toEqual([]);
});

it("saves phrases with normalized spaces and preserves duplicate and quota rules", async () => {
  await service();
  const saved = (await save(alice, "  WEAR   OFF  ")).rows[0];
  expect(saved.word).toBe("wear off");
  await expect(save(alice, "wear off")).rejects.toThrow("duplicate_word");
  expect((await save(alice, "turn down")).rows[0].slot).toBe(2);
  await expect(save(alice, "look up")).rejects.toThrow("daily_limit");
  expect((await save(bob, "wear off")).rows[0].user_id).toBe(bob);
});
it.each(["turn something/someone down", "turn (sb/sth) down"])(
  "accepts Cambridge object placeholders in %s",
  async (headword) => {
    await service();
    const saved = await db.query<{ word: string }>(
      "select * from public.save_vocabulary($1::uuid,$2,$3::jsonb)",
      [alice, "turn down", JSON.stringify({ ...dictionaryEntry, headword })],
    );
    expect(saved.rows[0].word).toBe("turn down");
  },
);
it.each([
  ["rely upon", "rely on/upon something/someone"],
  ["rely on", "rely on/upon something/someone"],
  ["blend into", "blend in/blend into something"],
  ["blend in", "blend in/blend into something"],
  ["the icing on the cake", "the icing on the cake"],
  ["icing on the cake", "the icing on the cake"],
  ["wear off", "wear-off"],
  ["wear-off", "wear off"],
  ["ought", "ought to"],
  ["wear", "wear something"],
])("saves %s with Cambridge headword %s", async (word, headword) => {
  await service();
  const saved = await db.query<{ word: string }>(
    "select * from public.save_vocabulary($1::uuid,$2,$3::jsonb)",
    [alice, word, JSON.stringify({ ...dictionaryEntry, headword })],
  );
  expect(saved.rows[0].word).toBe(word);
});
it.each([
  ["rely beyond", "rely on/upon something/someone"],
  ["blend out", "blend in/blend into something"],
  ["turn down", "turn something up"],
  ["wear off", "wear-off something else"],
  ["blend into", "blend in/fade into something"],
])(
  "refuses %s with unrelated Cambridge headword %s",
  async (word, headword) => {
    await service();
    await expect(
      db.query("select * from public.save_vocabulary($1::uuid,$2,$3::jsonb)", [
        alice,
        word,
        JSON.stringify({ ...dictionaryEntry, headword }),
      ]),
    ).rejects.toThrow("invalid_entry");
    expect((await db.query("select * from public.vocabulary")).rows).toEqual(
      [],
    );
  },
);
it.each([
  "wear\toff",
  "wear\noff",
  "wear off\n",
  "wear/off",
  "wear 123",
  "wear --off",
  "wear_ off",
  "a".repeat(81),
])("refuses malformed phrases: %j", async (word) => {
  await service();
  await expect(save(alice, word)).rejects.toThrow("invalid_entry");
  expect((await db.query("select * from public.vocabulary")).rows).toEqual([]);
});
it("refuses unrelated dictionary headwords for a phrase", async () => {
  await service();
  await expect(
    db.query("select * from public.save_vocabulary($1::uuid,$2,$3::jsonb)", [
      alice,
      "turn down",
      JSON.stringify({ ...dictionaryEntry, headword: "turn something up" }),
    ]),
  ).rejects.toThrow("invalid_entry");
});

it("updates only the owner's annotation and preserves dictionary, slots and dates", async () => {
  await service();
  const saved = (await save()).rows[0];
  await save(alice, "rescind");
  const before = (
    await db.query<Record<string, unknown>>(
      "select * from public.vocabulary where id=$1",
      [saved.id],
    )
  ).rows[0];
  const result = await db.query<{ content: unknown }>(
    "select * from public.update_vocabulary_meaning($1::uuid,$2::uuid,$3)",
    [alice, saved.id, "  ควร  "],
  );
  expect(result.rows[0].content).toEqual({
    kind: "dictionary",
    entry: { ...dictionaryEntry, headword: "ought" },
    thaiMeaning: "ควร",
  });
  expect(
    (
      await db.query<Record<string, unknown>>(
        "select * from public.vocabulary where id=$1",
        [saved.id],
      )
    ).rows[0],
  ).toEqual({
    ...before,
    content: {
      kind: "dictionary",
      entry: { ...dictionaryEntry, headword: "ought" },
      thaiMeaning: "ควร",
    },
  });
  expect(
    (
      await db.query(
        "select * from public.update_vocabulary_meaning($1::uuid,$2::uuid,$3)",
        [bob, saved.id, "wrong owner"],
      )
    ).rows,
  ).toEqual([]);
  expect(
    (
      await db.query(
        "select public.vocabulary_today_count($1::uuid) as count",
        [alice],
      )
    ).rows,
  ).toEqual([{ count: 2 }]);
  for (const invalid of ["", "  ", "a".repeat(601), "bad\nmeaning"])
    await expect(
      db.query(
        "select * from public.update_vocabulary_meaning($1::uuid,$2::uuid,$3)",
        [alice, saved.id, invalid],
      ),
    ).rejects.toThrow(/invalid_meaning/);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role}`);
    await expect(
      db.query(
        "select * from public.update_vocabulary_meaning($1::uuid,$2::uuid,$3)",
        [alice, saved.id, "ควร"],
      ),
    ).rejects.toThrow(/permission denied/);
  }
});
