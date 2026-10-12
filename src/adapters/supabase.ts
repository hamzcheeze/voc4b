import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VocabularyRepository } from "../application/add-word";
import { z } from "zod";
import {
  vocabularySchema,
  DUPLICATE_WORD_MESSAGE,
  type DictionaryEntry,
  type Vocabulary,
} from "../domain/vocabulary";
function databaseError(
  error: { code?: string; message: string },
  fallback: string,
): Error {
  if (
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "42703" ||
    error.message.includes("does not exist")
  )
    return new Error(
      "The database needs an update. Run the latest SQL migration in the Supabase SQL Editor.",
    );
  return new Error(fallback);
}
export function userClient(
  url: string,
  key: string,
  token: string,
): SupabaseClient {
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export class SupabaseRepository implements VocabularyRepository {
  constructor(private readonly client: SupabaseClient) {}
  async countToday(): Promise<number> {
    const { data, error } = await this.client.rpc("vocabulary_today_count");
    if (error)
      throw databaseError(
        error,
        "Couldn't read today's word count. Please try again.",
      );
    return z.number().int().nonnegative().parse(data);
  }
  async hasWord(word: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("vocabulary")
      .select("id")
      .ilike("word", word)
      .limit(1);
    if (error)
      throw databaseError(
        error,
        "Couldn't check your saved words. Please try again.",
      );
    return data.length > 0;
  }
  async save(word: string, entry: DictionaryEntry): Promise<Vocabulary> {
    const { data, error } = await this.client.rpc("save_vocabulary", {
      p_word: word,
      p_entry: entry,
    });
    if (error) {
      if (error.message.includes("daily_limit"))
        throw new Error(
          "You've reached today's two-word limit. Come back tomorrow.",
        );
      if (error.message.includes("duplicate_word"))
        throw new Error(DUPLICATE_WORD_MESSAGE);
      throw databaseError(error, "Couldn't save the word. Please try again.");
    }
    return z.array(vocabularySchema).length(1).parse(data)[0];
  }
  async removeToday(id: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("delete_vocabulary_today", {
      p_id: id,
    });
    if (error)
      throw databaseError(error, "Couldn't remove the word. Please try again.");
    return z.boolean().parse(data);
  }
  async list(): Promise<Vocabulary[]> {
    // Paginate to avoid the default PostgREST 1000-row truncation (500 learning days).
    const result: Vocabulary[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.client
        .from("vocabulary")
        .select("id,word,day,created_at,content")
        .order("day", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 499);
      if (error)
        throw databaseError(
          error,
          "Couldn't load your words. Please try again.",
        );
      result.push(...z.array(vocabularySchema).parse(data));
      if (data.length < 500) return result;
    }
  }
}
