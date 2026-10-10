import { z } from "zod";
import type { DictionaryProvider } from "../application/add-word";
import {
  dictionaryEntrySchema,
  matchesHeadword,
  type DictionaryEntry,
} from "../domain/vocabulary";

const id = z
  .union([z.number().int().nonnegative(), z.string().min(1).max(128)])
  .transform(String);
const wireSchema = z.object({
  word: z.string().trim().min(1).max(160),
  pos: z.array(z.string().trim().max(128)).max(100),
  pronunciation: z
    .array(
      z.object({
        pos: z.string().trim().max(128),
        lang: z
          .string()
          .trim()
          .toLowerCase()
          .pipe(z.enum(["us", "uk"])),
        pron: z.string().trim().min(1).max(256),
        url: z.string().max(2048).default(""),
      }),
    )
    .max(1000),
  definition: z
    .array(
      z.object({
        id,
        pos: z.string().trim().max(128),
        source: z.string().trim().max(256).default(""),
        text: z.string().trim().max(4000),
        example: z
          .array(z.object({ id, text: z.string().trim().min(1).max(4000) }))
          .max(1000),
      }),
    )
    .min(1)
    .max(1000),
  verbs: z
    .array(
      z.object({
        id,
        type: z.string().trim().min(1).max(128),
        text: z.string().trim().min(1).max(4000),
      }),
    )
    .max(1000),
});

export function parseDictionaryResponse(
  value: unknown,
  word: string,
): DictionaryEntry {
  const wire = wireSchema.parse(value);
  if (!matchesHeadword(word, wire.word))
    throw new Error("พจนานุกรมส่งคำอื่นกลับมา กรุณาตรวจสอบการสะกด");
  return dictionaryEntrySchema.parse({
    headword: wire.word,
    partsOfSpeech: wire.pos,
    pronunciations: wire.pronunciation.map((p) => ({
      pos: p.pos,
      region: p.lang,
      ipa: p.pron,
      audioUrl: p.url,
    })),
    definitions: wire.definition
      .filter((d) => d.text.length > 0)
      .map((d) => ({
        id: d.id,
        pos: d.pos,
        source: d.source,
        text: d.text,
        examples: d.example,
      })),
    verbForms: wire.verbs,
  });
}

export class CambridgeDictionary implements DictionaryProvider {
  constructor(
    private readonly baseUrl = process.env.DICTIONARY_API_URL ||
      "http://localhost:3001",
  ) {}
  async lookup(word: string): Promise<DictionaryEntry> {
    const url = new URL(this.baseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("ตั้งค่า DICTIONARY_API_URL เป็น URL ของ Dictionary API");
    url.pathname = `${url.pathname.replace(/\/$/, "")}/api/dictionary/en/${encodeURIComponent(word.toLowerCase())}`;
    url.search = "";
    url.hash = "";
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error(
        "ติดต่อพจนานุกรมไม่สำเร็จ ตรวจสอบว่า Dictionary API กำลังทำงาน",
      );
    }
    if (response.status === 404)
      throw new Error("ไม่พบคำศัพท์นี้ กรุณาตรวจสอบการสะกด");
    if (!response.ok)
      throw new Error("พจนานุกรมไม่พร้อมใช้งาน ยังไม่ได้บันทึกคำนี้");
    try {
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > 1024 * 1024)
        throw new Error("Dictionary response too large");
      const value: unknown = JSON.parse(text);
      return parseDictionaryResponse(value, word);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("พจนานุกรมส่งคำอื่น")
      )
        throw error;
      throw new Error(
        "พจนานุกรมส่งข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง ยังไม่ได้บันทึกคำนี้",
      );
    }
  }
}
