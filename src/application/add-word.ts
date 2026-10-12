import {
  validateWord,
  DAILY_LIMIT,
  type Vocabulary,
  type DictionaryEntry,
} from "../domain/vocabulary";
export interface VocabularyRepository {
  countToday(): Promise<number>;
  save(word: string, entry: DictionaryEntry): Promise<Vocabulary>;
}
export interface DictionaryProvider {
  lookup(word: string): Promise<DictionaryEntry>;
}
export async function addWord(
  input: string,
  ports: { repository: VocabularyRepository; dictionary: DictionaryProvider },
): Promise<Vocabulary> {
  const word = validateWord(input);
  if ((await ports.repository.countToday()) >= DAILY_LIMIT)
    throw new Error(
      "You've reached today's two-word limit. Come back tomorrow.",
    );
  const entry = await ports.dictionary.lookup(word);
  return ports.repository.save(word, entry);
}
