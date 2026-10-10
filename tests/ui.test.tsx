import React from "react";
import { it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TodayWords, WordCard } from "../src/components/words";
afterEach(cleanup);
const word = {
  id: "1",
  day: "2026-10-10",
  word: "Rescind",
  syllables: [
    { text: "ruh", stressed: false },
    { text: "sind", stressed: true },
  ],
  explanation: "To cancel a decision.",
  thai: "ยกเลิกการตัดสินใจ",
};
it.each([0, 1, 2])("shows exactly one add control below cap, saved=%i", (n) => {
  render(
    <TodayWords
      entries={Array.from({ length: n }, (_, i) => ({
        ...word,
        id: String(i),
      }))}
      onAdd={() => {}}
    />,
  );
  expect(
    screen.queryAllByRole("button", { name: /เพิ่มคำศัพท์/ }),
  ).toHaveLength(n < 2 ? 1 : 0);
  expect(screen.queryAllByText("Rescind")).toHaveLength(n);
});
it("marks primary stress with a strong element and distinct color class", () => {
  render(<WordCard entry={word} />);
  const stressed = screen.getByText("sind");
  expect(stressed.tagName).toBe("STRONG");
  expect(stressed).toHaveClass("stressed");
  expect(screen.getByText("ruh")).not.toHaveClass("stressed");
});
