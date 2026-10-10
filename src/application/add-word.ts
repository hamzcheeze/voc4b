import {
  validateWord,
  DAILY_LIMIT,
  type Vocabulary,
  type Enrichment,
} from "../domain/vocabulary";
export interface VocabularyRepository {
  countToday(): Promise<number>;
  /** Must atomically enforce user ownership, current database calendar day and cap. */
  save(word: string, enrichment: Enrichment): Promise<Vocabulary>;
}
export interface WordEnricher {
  enrich(word: string): Promise<Enrichment>;
}
export async function addWord(
  input: string,
  ports: { repository: VocabularyRepository; enricher: WordEnricher },
): Promise<Vocabulary> {
  const word = validateWord(input);
  if ((await ports.repository.countToday()) >= DAILY_LIMIT)
    throw new Error("วันนี้ครบสองคำแล้ว กลับมาเพิ่มคำใหม่พรุ่งนี้นะ");
  const enriched = await ports.enricher.enrich(word);
  return ports.repository.save(word, enriched);
}
