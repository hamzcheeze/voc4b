import { it, expect, vi } from "vitest";
import { addWord } from "../src/application/add-word";
import { dictionaryEntry, vocabulary } from "./fixtures/dictionary";
function ports(count = 0) {
  return {
    repository: {
      countToday: vi.fn().mockResolvedValue(count),
      hasWord: vi.fn().mockResolvedValue(false),
      save: vi.fn().mockResolvedValue(vocabulary),
    },
    dictionary: { lookup: vi.fn().mockResolvedValue(dictionaryEntry) },
  };
}
it("looks up dictionary data before atomic persistence", async () => {
  const p = ports();
  await addWord("ought", p);
  expect(p.dictionary.lookup).toHaveBeenCalledWith("ought");
  expect(p.repository.save).toHaveBeenCalledWith("ought", dictionaryEntry);
  expect(p.dictionary.lookup.mock.invocationCallOrder[0]).toBeLessThan(
    p.repository.save.mock.invocationCallOrder[0],
  );
});
it("does not call the dictionary if already full", async () => {
  const p = ports(2);
  await expect(addWord("rescind", p)).rejects.toThrow(/สอง|2|two/i);
  expect(p.dictionary.lookup).not.toHaveBeenCalled();
});
it("rejects a word already in the library before dictionary lookup", async () => {
  const p = ports();
  p.repository.hasWord.mockResolvedValue(true);
  await expect(addWord("ought", p)).rejects.toThrow("already in your library");
  expect(p.repository.hasWord).toHaveBeenCalledWith("ought");
  expect(p.dictionary.lookup).not.toHaveBeenCalled();
  expect(p.repository.save).not.toHaveBeenCalled();
});
it("does not consume a slot on provider failure", async () => {
  const p = ports();
  p.dictionary.lookup.mockRejectedValue(new Error("provider unavailable"));
  await expect(addWord("rescind", p)).rejects.toThrow();
  expect(p.repository.save).not.toHaveBeenCalled();
});
it("validates before network calls", async () => {
  const p = ports();
  await expect(addWord("Voc4b", p)).rejects.toThrow();
  expect(p.repository.countToday).not.toHaveBeenCalled();
});
it("propagates atomic cap rejection after a concurrent winner", async () => {
  const p = ports(1);
  p.repository.save.mockRejectedValue(new Error("Daily limit reached"));
  await expect(addWord("rescind", p)).rejects.toThrow("Daily limit");
});
