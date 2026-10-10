import {
  dayKey,
  validateWord,
  type Vocabulary,
  type Enrichment,
} from "../domain/vocabulary";
const KEY = "two-words-demo-v1";
const examples: Record<string, Enrichment> = {
  rescind: {
    syllables: [
      { text: "ruh", stressed: false },
      { text: "sind", stressed: true },
    ],
    explanation: "To officially cancel a decision, rule, or agreement.",
    thai: "ยกเลิกการตัดสินใจ กฎ หรือข้อตกลงอย่างเป็นทางการ",
  },
  serene: {
    syllables: [
      { text: "suh", stressed: false },
      { text: "reen", stressed: true },
    ],
    explanation: "Calm and peaceful, without worry or noise.",
    thai: "สงบและผ่อนคลาย ไม่มีความกังวลหรือเสียงรบกวน",
  },
  thrive: {
    syllables: [{ text: "thryv", stressed: true }],
    explanation: "To grow well or become successful.",
    thai: "เติบโตได้ดีหรือประสบความสำเร็จ",
  },
  deliberate: {
    syllables: [
      { text: "dih", stressed: false },
      { text: "lib", stressed: true },
      { text: "er", stressed: false },
      { text: "ut", stressed: false },
    ],
    explanation: "Done carefully and on purpose, rather than by accident.",
    thai: "ทำอย่างรอบคอบและตั้งใจ ไม่ได้เกิดขึ้นโดยบังเอิญ",
  },
  subtle: {
    syllables: [
      { text: "sut", stressed: true },
      { text: "ul", stressed: false },
    ],
    explanation: "Not obvious or easy to notice.",
    thai: "ไม่ชัดเจนหรือสังเกตเห็นได้ยาก",
  },
  resilient: {
    syllables: [
      { text: "rih", stressed: false },
      { text: "zil", stressed: true },
      { text: "yunt", stressed: false },
    ],
    explanation: "Able to recover after something difficult happens.",
    thai: "สามารถฟื้นตัวได้หลังเผชิญเรื่องยากลำบาก",
  },
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
    ...examples[word],
  }));
}
function list(): Vocabulary[] {
  const saved = localStorage.getItem(KEY);
  if (!saved) return samples();
  try {
    return JSON.parse(saved) as Vocabulary[];
  } catch {
    throw new Error("ข้อมูลเดโมในเบราว์เซอร์เสียหาย กดล้างเดโมเพื่อเริ่มใหม่");
  }
}
function save(word: string): Vocabulary {
  const rows = list(),
    today = dayKey();
  if (rows.filter((x) => x.day === today).length >= 2)
    throw new Error("วันนี้ครบสองคำแล้ว");
  if (
    rows.some(
      (x) => x.day === today && x.word.toLowerCase() === word.toLowerCase(),
    )
  )
    throw new Error("วันนี้มีคำนี้แล้ว");
  const example = examples[word.toLowerCase()];
  if (!example)
    throw new Error(
      "เดโมมีเฉพาะ rescind, serene, thrive, deliberate, subtle และ resilient (ไม่ได้เรียก AI จริง)",
    );
  const entry = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    day: today,
    word,
    ...example,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify([...rows, entry]));
  } catch {
    throw new Error("เบราว์เซอร์ไม่อนุญาตให้บันทึกเดโม");
  }
  return entry;
}
export const demoStore = {
  list,
  async add(input: string): Promise<Vocabulary> {
    const word = validateWord(input);
    if (typeof navigator !== "undefined" && navigator.locks)
      return navigator.locks.request(KEY, () => save(word));
    return save(word);
  },
  reset() {
    localStorage.removeItem(KEY);
  },
};
