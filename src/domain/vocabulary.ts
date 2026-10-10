import { z } from "zod";
export const TIME_ZONE = "Asia/Bangkok";
export const DAILY_LIMIT = 2;
export function dayKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function remainingSlots(saved: number): number {
  return Math.max(0, DAILY_LIMIT - saved);
}
export function validateWord(input: string): string {
  const word = input.trim();
  if (!/^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(word) || word.length > 80)
    throw new Error("กรุณากรอกคำภาษาอังกฤษหนึ่งคำ (ไม่เกิน 80 ตัวอักษร)");
  return word;
}
export const syllableSchema = z
  .object({
    text: z
      .string()
      .min(1)
      .max(24)
      .regex(/^[a-zA-Z]+$/),
    stressed: z.boolean(),
  })
  .strict();
export const audioUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname === "dictionary.cambridge.org" &&
        !url.username &&
        !url.password &&
        !url.port
      );
    } catch {
      return false;
    }
  }, "Audio must come from Cambridge over HTTPS");
const englishTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(4000)
  .regex(/[a-zA-Z]/);
const idSchema = z.string().min(1).max(128);
export const dictionaryEntrySchema = z
  .object({
    headword: z.string().trim().min(1).max(160),
    partsOfSpeech: z.array(z.string().trim().max(128)).max(100),
    pronunciations: z
      .array(
        z
          .object({
            pos: z.string().trim().max(128),
            region: z.enum(["us", "uk"]),
            ipa: z.string().trim().min(1).max(256),
            audioUrl: audioUrlSchema,
          })
          .strict(),
      )
      .max(1000),
    definitions: z
      .array(
        z
          .object({
            id: idSchema,
            pos: z.string().trim().max(128),
            source: z.string().trim().max(256),
            text: englishTextSchema,
            examples: z
              .array(
                z.object({ id: idSchema, text: englishTextSchema }).strict(),
              )
              .max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
    verbForms: z
      .array(
        z
          .object({
            id: idSchema,
            type: z.string().trim().min(1).max(128),
            text: z.string().trim().min(1).max(4000),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type DictionaryEntry = z.infer<typeof dictionaryEntrySchema>;
export const vocabularySchema = z.object({
  id: z.string().min(1),
  word: z.string().min(1).max(80),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  created_at: z.string().optional(),
  content: z.discriminatedUnion("kind", [
    z
      .object({ kind: z.literal("dictionary"), entry: dictionaryEntrySchema })
      .strict(),
    z
      .object({
        kind: z.literal("legacy"),
        explanation: z.string(),
        syllables: z.array(syllableSchema),
      })
      .strict(),
  ]),
});
export type Vocabulary = z.infer<typeof vocabularySchema>;
export function matchesHeadword(word: string, headword: string): boolean {
  const normalize = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, " ");
  const requested = normalize(word),
    canonical = normalize(headword);
  return canonical === requested || canonical.startsWith(`${requested} `);
}
export type HistoryFilters = {
  date?: string;
  month?: string;
  year?: string;
  order: "asc" | "desc";
};
function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
export function filterHistory(
  rows: Vocabulary[],
  filters: HistoryFilters,
): Vocabulary[] {
  if (filters.date && !validDate(filters.date))
    throw new Error("วันที่ไม่ถูกต้อง");
  if (filters.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month))
    throw new Error("เดือนไม่ถูกต้อง");
  if (filters.year && !/^\d{4}$/.test(filters.year))
    throw new Error("ปีไม่ถูกต้อง");
  return rows
    .filter(
      (row) =>
        (!filters.date || row.day === filters.date) &&
        (!filters.month || row.day.startsWith(filters.month)) &&
        (!filters.year || row.day.startsWith(filters.year)),
    )
    .sort(
      (a, b) =>
        (a.day.localeCompare(b.day) ||
          (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
          a.word.localeCompare(b.word)) * (filters.order === "asc" ? 1 : -1),
    );
}
export function dateLabel(day: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(`${day}T12:00:00+07:00`));
}
