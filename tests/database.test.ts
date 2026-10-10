import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

let db: PGlite;
const alice = "00000000-0000-0000-0000-000000000001";
const bob = "00000000-0000-0000-0000-000000000002";
const migration = readFileSync(
  "supabase/migrations/002_dictionary.sql",
  "utf8",
);
const legacySyllables = [{ text: "awt", stressed: true }];

function entry(headword = "ought to") {
  return {
    headword,
    partsOfSpeech: ["modal verb"],
    pronunciations: [
      {
        pos: "modal verb",
        region: "us",
        ipa: "ɑːt",
        audioUrl:
          "https://dictionary.cambridge.org/media/english/us_pron/ought.mp3",
      },
    ],
    definitions: [
      {
        id: "sense-1",
        pos: "modal verb",
        source: "Cambridge",
        text: "Used to describe what should happen.",
        examples: [{ id: "example-1", text: "You ought to rest." }],
      },
    ],
    verbForms: [{ id: "verb-1", type: "base", text: "ought" }],
  };
}

async function bootstrap() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${alice}'),('${bob}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await database.exec(
    readFileSync("supabase/migrations/001_vocabulary.sql", "utf8"),
  );
  return database;
}

beforeAll(async () => {
  db = await bootstrap();
  await db.exec(migration);
  await db.exec(migration);
}, 30000);

afterEach(async () => {
  await db.exec("reset role; truncate public.vocabulary;");
});

afterAll(async () => {
  if (db) await db.close();
});

async function asUser(id: string) {
  await db.exec("reset role; set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}

async function save(word: string, data: unknown = entry(word)) {
  return db.query<{
    word: string;
    user_id: string;
    day: string;
    content: unknown;
  }>("select * from public.save_vocabulary($1,$2::jsonb)", [
    word,
    JSON.stringify(data),
  ]);
}

async function clearToday() {
  return db.query<{ deleted: number }>(
    "select public.clear_vocabulary_today() as deleted",
  );
}

async function seedHistory(id: string, word: string) {
  await db.exec("reset role");
  await db.query(
    "insert into public.vocabulary(user_id,day,slot,word,content) values($1,(clock_timestamp() at time zone 'Asia/Bangkok')::date - 1,1,$2,$3::jsonb)",
    [id, word, JSON.stringify({ kind: "dictionary", entry: entry(word) })],
  );
}

it("backfills old English entries before removing the old columns and RPC", async () => {
  const oldDb = await bootstrap();
  try {
    await oldDb.query(
      "insert into public.vocabulary(user_id,day,slot,word,syllables,explanation,thai) values($1,(clock_timestamp() at time zone 'Asia/Bangkok')::date - 1,1,$2,$3::jsonb,$4,$5)",
      [
        alice,
        "ought",
        JSON.stringify(legacySyllables),
        "Used to describe what should happen.",
        "ควร",
      ],
    );
    await oldDb.exec(migration);
    await oldDb.exec(migration);
    expect(
      (await oldDb.query("select word,content from public.vocabulary")).rows,
    ).toEqual([
      {
        word: "ought",
        content: {
          kind: "legacy",
          explanation: "Used to describe what should happen.",
          syllables: legacySyllables,
        },
      },
    ]);
    const columns = await oldDb.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='public' and table_name='vocabulary' order by ordinal_position",
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "id",
      "user_id",
      "day",
      "slot",
      "word",
      "created_at",
      "content",
    ]);
    expect(
      (
        await oldDb.query(
          "select to_regprocedure('public.save_vocabulary(text,jsonb,text,text)')::text as old_rpc",
        )
      ).rows,
    ).toEqual([{ old_rpc: null }]);
  } finally {
    await oldDb.close();
  }
}, 30000);

it("can rerun the migration without changing dictionary content", async () => {
  await asUser(alice);
  const saved = await save("ought", entry());
  await db.exec("reset role");
  await db.exec(migration);
  await db.exec(migration);
  expect((await db.query("select * from public.vocabulary")).rows).toEqual(
    saved.rows,
  );
});

it("stores English meanings, examples and pronunciation unchanged with the canonical headword", async () => {
  const data = entry();
  data.definitions.push({
    id: "sense-2",
    pos: "modal verb",
    source: "Cambridge",
    text: "Used to describe what is expected.",
    examples: [],
  });
  await asUser(alice);
  const saved = await save(" OUGHT ", data);
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0]?.word).toBe("ought");
  expect(saved.rows[0]?.user_id).toBe(alice);
  expect(saved.rows[0]?.content).toEqual({ kind: "dictionary", entry: data });
  expect(
    (await db.query("select public.vocabulary_today_count() as count")).rows,
  ).toEqual([{ count: 1 }]);
});

it("allows missing pronunciation, source and POS, and an empty audio URL", async () => {
  await asUser(alice);
  expect(
    (await save("ought", { ...entry(), pronunciations: [] })).rows,
  ).toHaveLength(1);
  const data = entry("rescind");
  const withMissing = {
    ...data,
    pronunciations: data.pronunciations.map((pronunciation) => ({
      ...pronunciation,
      audioUrl: "",
    })),
    definitions: data.definitions.map((definition) => ({
      ...definition,
      pos: "",
      source: "",
    })),
  };
  expect((await save("rescind", withMissing)).rows).toHaveLength(1);
});

it("denies anonymous calls to save and clear", async () => {
  await db.exec("set role anon");
  await expect(save("ought")).rejects.toThrow(/permission denied/);
  await expect(clearToday()).rejects.toThrow(/permission denied/);
});

it("requires a user identity even for authenticated callers", async () => {
  await asUser("");
  await expect(save("ought")).rejects.toThrow(/authentication_required/);
  await expect(clearToday()).rejects.toThrow(/authentication_required/);
});

it("direct inserts, updates and deletes cannot bypass the RPC", async () => {
  await asUser(alice);
  await expect(
    db.query(
      "insert into public.vocabulary(user_id,word,day,slot,content) values($1,$2,current_date,1,$3::jsonb)",
      [alice, "ought", JSON.stringify({ kind: "dictionary", entry: entry() })],
    ),
  ).rejects.toThrow(/permission denied/);
  await save("ought");
  await expect(
    db.exec("update public.vocabulary set word='other'"),
  ).rejects.toThrow(/permission denied/);
  await expect(db.exec("delete from public.vocabulary")).rejects.toThrow(
    /permission denied/,
  );
});

it("rejects duplicates without consuming a slot and enforces the two-word quota", async () => {
  await asUser(alice);
  await save("ought");
  await expect(save(" OUGHT ", entry("ought"))).rejects.toThrow(
    /duplicate_word/,
  );
  await save("rescind");
  await expect(save("serene")).rejects.toThrow(/daily_limit/);
  expect((await db.query("select * from public.vocabulary")).rows).toHaveLength(
    2,
  );
});

it("RLS isolates users and each user has a separate quota", async () => {
  await asUser(alice);
  await save("ought");
  await save("rescind");
  await asUser(bob);
  expect((await db.query("select * from public.vocabulary")).rows).toEqual([]);
  await save("ought");
  expect(
    (await db.query("select user_id from public.vocabulary")).rows,
  ).toEqual([{ user_id: bob }]);
});

it("clears only today's words for the caller and restores both daily slots", async () => {
  await seedHistory(alice, "older");
  await seedHistory(bob, "past");
  await asUser(bob);
  await save("serene");
  await asUser(alice);
  await save("ought");
  await save("rescind");
  expect((await clearToday()).rows).toEqual([{ deleted: 2 }]);
  expect((await clearToday()).rows).toEqual([{ deleted: 0 }]);
  expect((await db.query("select word from public.vocabulary")).rows).toEqual([
    { word: "older" },
  ]);
  await save("ought");
  await save("rescind");
  await asUser(bob);
  expect(
    (await db.query("select word from public.vocabulary order by word")).rows,
  ).toEqual([{ word: "past" }, { word: "serene" }]);
});

it.each(["", "two words", "ought2", "ควร", "a".repeat(81)])(
  "rejects invalid requested word %s",
  async (word) => {
    await asUser(alice);
    await expect(save(word)).rejects.toThrow(/invalid_entry/);
    expect((await db.query("select * from public.vocabulary")).rows).toEqual(
      [],
    );
  },
);

const valid = entry();
const pronunciation = valid.pronunciations[0];
const definition = valid.definitions[0];
const example = definition?.examples[0];
const form = valid.verbForms[0];
const invalidEntries: [string, unknown][] = [
  ["null payload", null],
  ["array payload", []],
  ["non-string headword", { ...valid, headword: 1 }],
  ["empty headword", { ...valid, headword: " " }],
  ["long headword", { ...valid, headword: `ought ${"a".repeat(160)}` }],
  [
    "padded headword over bound",
    { ...valid, headword: `ought${" ".repeat(160)}` },
  ],
  ["different word", { ...valid, headword: "rescind" }],
  [
    "headword prefix without word boundary",
    { ...valid, headword: "oughtness" },
  ],
  ["Thai field", { ...valid, translation: "ควร" }],
  ["missing top-level fields", { headword: "ought" }],
  ["object definitions", { ...valid, definitions: {} }],
  ["no definitions", { ...valid, definitions: [] }],
  ["null definition", { ...valid, definitions: [null] }],
  [
    "missing definition fields",
    { ...valid, definitions: [{ text: "Should happen." }] },
  ],
  [
    "extra definition field",
    { ...valid, definitions: [{ ...definition, translation: "ควร" }] },
  ],
  [
    "non-English definition",
    { ...valid, definitions: [{ ...definition, text: "ควร" }] },
  ],
  [
    "blank definition",
    { ...valid, definitions: [{ ...definition, text: " " }] },
  ],
  [
    "long definition",
    { ...valid, definitions: [{ ...definition, text: "a".repeat(4001) }] },
  ],
  [
    "padded definition over bound",
    {
      ...valid,
      definitions: [{ ...definition, text: `a${" ".repeat(4000)}` }],
    },
  ],
  [
    "non-string definition id",
    { ...valid, definitions: [{ ...definition, id: 1 }] },
  ],
  [
    "long definition id",
    { ...valid, definitions: [{ ...definition, id: "a".repeat(129) }] },
  ],
  [
    "padded id over bound",
    { ...valid, definitions: [{ ...definition, id: `a${" ".repeat(128)}` }] },
  ],
  [
    "long definition pos",
    { ...valid, definitions: [{ ...definition, pos: "a".repeat(129) }] },
  ],
  [
    "long definition source",
    { ...valid, definitions: [{ ...definition, source: "a".repeat(257) }] },
  ],
  [
    "object examples",
    { ...valid, definitions: [{ ...definition, examples: {} }] },
  ],
  [
    "non-English example",
    {
      ...valid,
      definitions: [{ ...definition, examples: [{ ...example, text: "ควร" }] }],
    },
  ],
  [
    "extra example field",
    {
      ...valid,
      definitions: [
        { ...definition, examples: [{ ...example, translation: "ควร" }] },
      ],
    },
  ],
  [
    "missing example id",
    {
      ...valid,
      definitions: [{ ...definition, examples: [{ text: "Should happen." }] }],
    },
  ],
  [
    "long example id",
    {
      ...valid,
      definitions: [
        { ...definition, examples: [{ ...example, id: "a".repeat(129) }] },
      ],
    },
  ],
  [
    "long example text",
    {
      ...valid,
      definitions: [
        { ...definition, examples: [{ ...example, text: "a".repeat(4001) }] },
      ],
    },
  ],
  ["object parts of speech", { ...valid, partsOfSpeech: {} }],
  ["non-string part of speech", { ...valid, partsOfSpeech: [null] }],
  ["long part of speech", { ...valid, partsOfSpeech: ["a".repeat(129)] }],
  ["object pronunciations", { ...valid, pronunciations: {} }],
  ["null pronunciation", { ...valid, pronunciations: [null] }],
  [
    "missing pronunciation field",
    { ...valid, pronunciations: [{ ipa: "ɑːt" }] },
  ],
  [
    "extra pronunciation field",
    { ...valid, pronunciations: [{ ...pronunciation, translation: "ควร" }] },
  ],
  [
    "invalid region",
    { ...valid, pronunciations: [{ ...pronunciation, region: "au" }] },
  ],
  ["blank IPA", { ...valid, pronunciations: [{ ...pronunciation, ipa: " " }] }],
  [
    "long IPA",
    { ...valid, pronunciations: [{ ...pronunciation, ipa: "a".repeat(257) }] },
  ],
  [
    "long pronunciation pos",
    { ...valid, pronunciations: [{ ...pronunciation, pos: "a".repeat(129) }] },
  ],
  [
    "non-string audio",
    { ...valid, pronunciations: [{ ...pronunciation, audioUrl: null }] },
  ],
  [
    "long audio URL",
    {
      ...valid,
      pronunciations: [
        {
          ...pronunciation,
          audioUrl: `https://dictionary.cambridge.org/${"a".repeat(2048)}`,
        },
      ],
    },
  ],
  [
    "HTTP audio",
    {
      ...valid,
      pronunciations: [
        {
          ...pronunciation,
          audioUrl: "http://dictionary.cambridge.org/media/audio.mp3",
        },
      ],
    },
  ],
  [
    "other audio host",
    {
      ...valid,
      pronunciations: [
        { ...pronunciation, audioUrl: "https://example.com/audio.mp3" },
      ],
    },
  ],
  [
    "deceptive audio host",
    {
      ...valid,
      pronunciations: [
        {
          ...pronunciation,
          audioUrl: "https://dictionary.cambridge.org.evil.test/audio.mp3",
        },
      ],
    },
  ],
  [
    "audio URL credentials",
    {
      ...valid,
      pronunciations: [
        {
          ...pronunciation,
          audioUrl: "https://dictionary.cambridge.org@evil.test/audio.mp3",
        },
      ],
    },
  ],
  ["object verb forms", { ...valid, verbForms: {} }],
  ["null verb form", { ...valid, verbForms: [null] }],
  ["missing verb form field", { ...valid, verbForms: [{ text: "ought" }] }],
  [
    "extra verb form field",
    { ...valid, verbForms: [{ ...form, translation: "ควร" }] },
  ],
  ["blank verb type", { ...valid, verbForms: [{ ...form, type: " " }] }],
  ["long verb id", { ...valid, verbForms: [{ ...form, id: "a".repeat(129) }] }],
  [
    "long verb type",
    { ...valid, verbForms: [{ ...form, type: "a".repeat(129) }] },
  ],
  [
    "long verb text",
    { ...valid, verbForms: [{ ...form, text: "a".repeat(4001) }] },
  ],
  [
    "too many definitions",
    { ...valid, definitions: Array(1001).fill(definition) },
  ],
  [
    "too many examples",
    {
      ...valid,
      definitions: [{ ...definition, examples: Array(1001).fill(example) }],
    },
  ],
  [
    "too many pronunciations",
    { ...valid, pronunciations: Array(1001).fill(pronunciation) },
  ],
  ["too many verb forms", { ...valid, verbForms: Array(1001).fill(form) }],
  [
    "too many parts of speech",
    { ...valid, partsOfSpeech: Array(101).fill("verb") },
  ],
  [
    "payload larger than 1 MiB",
    {
      ...valid,
      definitions: Array.from({ length: 300 }, (_, index) => ({
        ...definition,
        id: `sense-${index}`,
        text: "a".repeat(4000),
      })),
    },
  ],
];

it.each(invalidEntries)(
  "rejects %s without saving anything",
  async (_, data) => {
    await asUser(alice);
    await expect(save("ought", data)).rejects.toThrow(/invalid_entry/);
    expect((await db.query("select * from public.vocabulary")).rows).toEqual(
      [],
    );
  },
);

it("refuses a stale expected cleanup day without deleting today's words", async () => {
  await asUser(alice);
  await save("ought");
  await expect(
    db.query(
      "select public.clear_vocabulary_today((clock_timestamp() at time zone 'Asia/Bangkok')::date - 1)",
    ),
  ).rejects.toThrow(/calendar_day_changed/);
  await expect(
    db.query("select public.clear_vocabulary_today(null::date)"),
  ).rejects.toThrow(/calendar_day_changed/);
  expect((await db.query("select word from public.vocabulary")).rows).toEqual([
    { word: "ought" },
  ]);
});
