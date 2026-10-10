import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VocabularyRepository } from "../application/add-word";
import { z } from "zod";
import {
  vocabularySchema,
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
      "ฐานข้อมูลยังไม่ได้อัปเดต กรุณารัน migration 002_dictionary.sql ใน Supabase SQL Editor",
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
      throw databaseError(error, "อ่านจำนวนคำวันนี้ไม่สำเร็จ กรุณาลองใหม่");
    return z.number().int().nonnegative().parse(data);
  }
  async save(word: string, entry: DictionaryEntry): Promise<Vocabulary> {
    const { data, error } = await this.client.rpc("save_vocabulary", {
      p_word: word,
      p_entry: entry,
    });
    if (error) {
      if (error.message.includes("daily_limit"))
        throw new Error("วันนี้ครบสองคำแล้ว กลับมาใหม่พรุ่งนี้นะ");
      if (error.message.includes("duplicate_word"))
        throw new Error("วันนี้บันทึกคำนี้ไปแล้ว ลองเลือกคำใหม่");
      throw databaseError(error, "บันทึกลงฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    }
    return z.array(vocabularySchema).length(1).parse(data)[0];
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
        throw databaseError(error, "โหลดคำศัพท์ไม่สำเร็จ กรุณาลองใหม่");
      result.push(...z.array(vocabularySchema).parse(data));
      if (data.length < 500) return result;
    }
  }
}
