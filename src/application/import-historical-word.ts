import { z } from "zod";
import type { DictionaryProvider } from "./add-word";
import {
  dayKey,
  validateDictionaryTerm,
  type DictionaryEntry,
  type Vocabulary,
} from "../domain/vocabulary";

export const historicalDaySchema = z.iso
  .date()
  .refine((day) => day < dayKey(), "Choose a date before today.")
  .brand<"HistoricalDay">();
export type HistoricalDay = z.infer<typeof historicalDaySchema>;
export type HistoricalImportResult = { entry: Vocabulary; skipped: boolean };
export interface HistoricalVocabularyRepository {
  findWord(word: string): Promise<Vocabulary | null>;
  saveHistorical(
    word: string,
    day: HistoricalDay,
    entry: DictionaryEntry,
  ): Promise<HistoricalImportResult>;
}

export async function importHistoricalWord(
  input: string,
  day: HistoricalDay,
  ports: {
    repository: HistoricalVocabularyRepository;
    dictionary: DictionaryProvider;
  },
): Promise<HistoricalImportResult> {
  const word = validateDictionaryTerm(input).toLowerCase();
  const existing = await ports.repository.findWord(word);
  if (existing) return { entry: existing, skipped: true };
  const entry = await ports.dictionary.lookup(word);
  return ports.repository.saveHistorical(word, day, entry);
}
