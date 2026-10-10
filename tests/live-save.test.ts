// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { CambridgeDictionary } from "../src/adapters/dictionary";
import { vocabularySchema } from "../src/domain/vocabulary";

afterEach(() => vi.unstubAllEnvs());

it.skipIf(process.env.RUN_LIVE_WRITE_CHECK !== "1")(
  "real app saves dictionary data, isolates users and enforces the daily cap",
  async () => {
    vi.stubEnv("NODE_ENV", "development");
    nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    const url = z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const publicKey = z
      .string()
      .min(1)
      .parse(
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      );
    const secretKey = z.string().min(1).parse(process.env.SUPABASE_SECRET_KEY);
    const base = new URL(process.env.LIVE_APP_URL || "http://localhost:3000");
    if (!["localhost", "127.0.0.1"].includes(base.hostname))
      throw new Error("The write check requires a local app server.");
    const options = {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    };
    const admin = createClient(url, secretKey, options);
    const createdIds: string[] = [];
    const run = randomUUID();
    async function account() {
      const email = `voc4b-check-${randomUUID()}@example.com`;
      const password = randomBytes(32).toString("base64url");
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { verification_run: run },
      });
      if (created.error || !created.data.user)
        throw new Error("Could not create the temporary verification account.");
      const id = created.data.user.id;
      createdIds.push(id);
      const client = createClient(url, publicKey, options);
      const signedIn = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (signedIn.error || !signedIn.data.session)
        throw new Error("Temporary account sign-in failed.");
      expect(signedIn.data.user?.id).toBe(id);
      return { id, client, token: signedIn.data.session.access_token };
    }
    async function request(token: string, word?: string) {
      const response = await fetch(new URL("/api/words", base), {
        method: word ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: base.origin,
          "Content-Type": "application/json",
        },
        body: word ? JSON.stringify({ word }) : undefined,
        signal: AbortSignal.timeout(40000),
      });
      const body: unknown = await response.json();
      return { status: response.status, body };
    }
    const listSchema = z.object({ entries: z.array(vocabularySchema) });
    const savedSchema = z.object({ entry: vocabularySchema });
    const failures: unknown[] = [];
    try {
      const first = await account();
      const second = await account();
      const before = await request(first.token);
      expect(before.status).toBe(200);
      expect(listSchema.parse(before.body).entries).toEqual([]);

      const provider = await new CambridgeDictionary().lookup("ought");
      const saved = await request(first.token, "ought");
      expect(saved.status).toBe(201);
      const entry = savedSchema.parse(saved.body).entry;
      expect(entry.word).toBe("ought");
      if (entry.content.kind !== "dictionary")
        throw new Error("Saved content was not a dictionary entry.");
      expect(entry.content.entry).toEqual(provider);
      expect(entry.content.entry.definitions[0].text).toBe(
        "used to say that it is necessary or desirable to perform the action expressed in the verb:",
      );
      expect(entry.content.entry.definitions[0].examples[0].text).toBe(
        "We ought to clean up before we go home.",
      );
      expect(entry.content.entry.pronunciations[0].ipa).toBe("/ɔt/");
      expect(entry.content.entry.pronunciations[0].audioUrl).toBe(
        "https://dictionary.cambridge.org/us/media/english/us_pron/e/eus/eus75/eus75326.mp3",
      );
      expect(entry.content.entry.definitions).toHaveLength(2);
      expect(JSON.stringify(entry.content)).not.toMatch(/translation|thai/);

      const reloaded = await request(first.token);
      expect(reloaded.status).toBe(200);
      expect(listSchema.parse(reloaded.body).entries).toEqual([entry]);
      const stored = await admin
        .from("vocabulary")
        .select("id,user_id,word,day,created_at,content")
        .eq("user_id", first.id);
      if (stored.error) throw new Error("Database read-back failed.");
      const rows = z
        .array(vocabularySchema.extend({ user_id: z.uuid() }))
        .parse(stored.data);
      expect(rows).toEqual([{ ...entry, user_id: first.id }]);

      const isolated = await request(second.token);
      expect(isolated.status).toBe(200);
      expect(listSchema.parse(isolated.body).entries).toEqual([]);
      const other = await request(first.token, "rescind");
      expect(other.status).toBe(201);
      expect(savedSchema.parse(other.body).entry.word).toBe("rescind");
      const capped = await request(first.token, "serene");
      expect(capped.status).toBe(422);
      expect(
        z.object({ error: z.string() }).parse(capped.body).error,
      ).toContain("วันนี้ครบสองคำแล้ว");
      const secondSaved = await request(second.token, "serene");
      expect(secondSaved.status).toBe(201);
      const secondEntry = savedSchema.parse(secondSaved.body).entry;
      expect(secondEntry.word).toBe("serene");

      const rejectedClear = await first.client.rpc("clear_vocabulary_today", {
        p_expected_day: "2000-01-01",
      });
      expect(rejectedClear.error?.message).toContain("calendar_day_changed");
      const stillSaved = await request(first.token);
      expect(listSchema.parse(stillSaved.body).entries).toHaveLength(2);
      const cleared = await first.client.rpc("clear_vocabulary_today", {
        p_expected_day: entry.day,
      });
      if (cleared.error)
        throw new Error("Temporary vocabulary cleanup failed.");
      expect(cleared.data).toBe(2);
      const after = await request(first.token);
      expect(after.status).toBe(200);
      expect(listSchema.parse(after.body).entries).toEqual([]);
      const secondAfter = await request(second.token);
      expect(secondAfter.status).toBe(200);
      expect(listSchema.parse(secondAfter.body).entries).toEqual([secondEntry]);
    } catch (error) {
      failures.push(error);
    } finally {
      for (const id of createdIds) {
        try {
          const found = await admin.auth.admin.getUserById(id);
          if (
            found.error ||
            found.data.user?.app_metadata.verification_run !== run
          ) {
            failures.push(
              new Error(
                "Verification account ownership could not be confirmed.",
              ),
            );
            continue;
          }
          const deleted = await admin.auth.admin.deleteUser(id);
          if (deleted.error)
            failures.push(new Error("Temporary account cleanup failed."));
        } catch {
          failures.push(
            new Error(`Temporary account ${id} cleanup failed unexpectedly.`),
          );
        }
      }
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        "Live verification or cleanup failed.",
      );
  },
  180000,
);
