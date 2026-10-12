import { z } from "zod";
import {
  dayKey,
  DUPLICATE_WORD_MESSAGE,
  validateWord,
  vocabularySchema,
  type Vocabulary,
  type DictionaryEntry,
} from "../domain/vocabulary";
const KEY = "two-words-demo-v2";
function sample(
  word: string,
  pos: string,
  ipa: string,
  text: string,
): DictionaryEntry {
  return {
    headword: word,
    partsOfSpeech: [pos],
    pronunciations: [{ pos, region: "us", ipa, audioUrl: "" }],
    definitions: [{ id: "0", pos, source: "demo", text, examples: [] }],
    verbForms: [],
  };
}
const examples: Record<string, DictionaryEntry> = {
  rescind: sample(
    "rescind",
    "verb",
    "/rɪˈsɪnd/",
    "To officially cancel a decision, rule, or agreement.",
  ),
  serene: sample(
    "serene",
    "adjective",
    "/səˈriːn/",
    "Calm and peaceful, without worry or noise.",
  ),
  lucid: sample(
    "lucid",
    "adjective",
    "/ˈluː.sɪd/",
    "Clear and easy to understand.",
  ),
  thrive: sample(
    "thrive",
    "verb",
    "/θraɪv/",
    "To grow well or become successful.",
  ),
  deliberate: sample(
    "deliberate",
    "adjective",
    "/dɪˈlɪb.ɚ.ət/",
    "Done carefully and on purpose, rather than by accident.",
  ),
  subtle: sample(
    "subtle",
    "adjective",
    "/ˈsʌt̬.əl/",
    "Not obvious or easy to notice.",
  ),
  resilient: sample(
    "resilient",
    "adjective",
    "/rɪˈzɪl.jənt/",
    "Able to recover after something difficult happens.",
  ),
};
function samples(): Vocabulary[] {
  const today = dayKey();
  const yesterday = dayKey(
    new Date(Date.parse(`${today}T12:00:00+07:00`) - 86400000),
  );
  const older = dayKey(
    new Date(Date.parse(`${today}T12:00:00+07:00`) - 3 * 86400000),
  );
  return ["deliberate", "subtle", "resilient", "thrive"].map((word, i) => ({
    id: `sample-${word}`,
    day: i < 2 ? yesterday : older,
    word,
    content: { kind: "dictionary", entry: examples[word] },
  }));
}
function list(): Vocabulary[] {
  const saved = localStorage.getItem(KEY);
  if (!saved) return samples();
  try {
    return z.array(vocabularySchema).parse(JSON.parse(saved));
  } catch {
    throw new Error("Demo data is corrupted. Reset the demo and try again.");
  }
}
function save(word: string): Vocabulary {
  const rows = list(),
    today = dayKey();
  if (rows.filter((x) => x.day === today).length >= 2)
    throw new Error("You've reached today's two-word limit.");
  if (rows.some((x) => x.word.toLowerCase() === word.toLowerCase()))
    throw new Error(DUPLICATE_WORD_MESSAGE);
  const entry = examples[word.toLowerCase()];
  if (!entry)
    throw new Error(
      "Demo mode includes only rescind, serene, lucid, thrive, deliberate, subtle, and resilient.",
    );
  const vocabulary: Vocabulary = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    day: today,
    word,
    content: { kind: "dictionary", entry },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify([...rows, vocabulary]));
  } catch {
    throw new Error("Your browser blocked demo storage.");
  }
  return vocabulary;
}
function removeToday(id: string): void {
  const rows = list();
  const next = rows.filter((row) => row.id !== id || row.day !== dayKey());
  if (next.length === rows.length)
    throw new Error("This word is no longer in today's list.");
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    throw new Error("Your browser blocked demo storage.");
  }
}
export const demoStore = {
  list,
  async add(input: string): Promise<Vocabulary> {
    const word = validateWord(input);
    if (typeof navigator !== "undefined" && navigator.locks)
      return navigator.locks.request(KEY, () => save(word));
    return save(word);
  },
  async removeToday(id: string): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.locks)
      return navigator.locks.request(KEY, () => removeToday(id));
    removeToday(id);
  },
  reset() {
    localStorage.removeItem(KEY);
  },
};
