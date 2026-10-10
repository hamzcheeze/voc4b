import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VocabularyRepository } from "../application/add-word";
import type { Enrichment, Vocabulary } from "../domain/vocabulary";
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
    if (error) throw new Error("อ่านจำนวนคำวันนี้ไม่สำเร็จ กรุณาลองใหม่");
    return data as number;
  }
  async save(word: string, enriched: Enrichment): Promise<Vocabulary> {
    const { data, error } = await this.client.rpc("save_vocabulary", {
      p_word: word,
      p_syllables: enriched.syllables,
      p_explanation: enriched.explanation,
      p_thai: enriched.thai,
    });
    if (error) {
      if (error.message.includes("daily_limit"))
        throw new Error("วันนี้ครบสองคำแล้ว กลับมาใหม่พรุ่งนี้นะ");
      if (error.message.includes("duplicate_word"))
        throw new Error("วันนี้บันทึกคำนี้ไปแล้ว ลองเลือกคำใหม่");
      throw new Error("บันทึกลงฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    }
    return data[0] as Vocabulary;
  }
  async list(): Promise<Vocabulary[]> {
    // Paginate to avoid the default PostgREST 1000-row truncation (500 learning days).
    const result: Vocabulary[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.client
        .from("vocabulary")
        .select("id,word,day,created_at,syllables,explanation,thai")
        .order("day", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error("โหลดคำศัพท์ไม่สำเร็จ กรุณาลองใหม่");
      result.push(...(data as Vocabulary[]));
      if (data.length < 500) return result;
    }
  }
}
