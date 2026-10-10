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
export const enrichmentSchema = z
  .object({
    valid: z.literal(true),
    syllables: z
      .array(syllableSchema)
      .min(1)
      .max(12)
      .refine(
        (s) => s.filter((x) => x.stressed).length === 1,
        "Exactly one primary stress is required",
      ),
    explanation: z
      .string()
      .trim()
      .min(3)
      .max(400)
      .regex(/[a-zA-Z]/)
      .refine((s) => !/[\u0E00-\u0E7F]/.test(s)),
    thai: z
      .string()
      .trim()
      .min(3)
      .max(600)
      .regex(/[\u0E00-\u0E7F]/),
  })
  .strict();
export type Enrichment = Omit<z.infer<typeof enrichmentSchema>, "valid">;
export interface Vocabulary extends Enrichment {
  created_at?: string;
  id: string;
  word: string;
  day: string;
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
