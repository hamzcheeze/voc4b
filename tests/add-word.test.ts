import { it, expect, vi } from "vitest";
import { addWord } from "../src/application/add-word";
const generated = {
  syllables: [{ text: "sind", stressed: true }],
  explanation: "To cancel a decision.",
  thai: "ยกเลิกการตัดสินใจ",
};
function ports(count = 0) {
  return {
    repository: {
      countToday: vi.fn().mockResolvedValue(count),
      save: vi
        .fn()
        .mockResolvedValue({
          id: "1",
          day: "2026-10-10",
          word: "rescind",
          ...generated,
        }),
    },
    enricher: { enrich: vi.fn().mockResolvedValue(generated) },
  };
}
it("enriches before atomic persistence", async () => {
  const p = ports();
  await addWord("rescind", p);
  expect(p.enricher.enrich).toHaveBeenCalledWith("rescind");
  expect(p.repository.save).toHaveBeenCalledWith("rescind", generated);
  expect(p.enricher.enrich.mock.invocationCallOrder[0]).toBeLessThan(
    p.repository.save.mock.invocationCallOrder[0],
  );
});
it("does not call AI if already full", async () => {
  const p = ports(2);
  await expect(addWord("rescind", p)).rejects.toThrow(/สอง|2|two/i);
  expect(p.enricher.enrich).not.toHaveBeenCalled();
});
it("does not consume a slot on provider failure", async () => {
  const p = ports();
  p.enricher.enrich.mockRejectedValue(new Error("provider unavailable"));
  await expect(addWord("rescind", p)).rejects.toThrow();
  expect(p.repository.save).not.toHaveBeenCalled();
});
it("validates before network calls", async () => {
  const p = ports();
  await expect(addWord("two words", p)).rejects.toThrow();
  expect(p.repository.countToday).not.toHaveBeenCalled();
});
it("propagates atomic cap rejection after a concurrent winner", async () => {
  const p = ports(1);
  p.repository.save.mockRejectedValue(new Error("Daily limit reached"));
  await expect(addWord("rescind", p)).rejects.toThrow("Daily limit");
});
