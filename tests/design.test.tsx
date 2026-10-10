import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TodayWords, WordCard } from "../src/components/words";
afterEach(cleanup);
const entry = {
  id: "1",
  day: "2026-10-10",
  word: "rescind",
  syllables: [
    { text: "ruh", stressed: false },
    { text: "sind", stressed: true },
  ],
  explanation: "To cancel a decision.",
  thai: "ยกเลิกการตัดสินใจ",
};
it("keeps one concise action without promotional helper copy", () => {
  render(<TodayWords entries={[]} onAdd={() => {}} />);
  expect(screen.getByRole("button")).toHaveAccessibleName("เพิ่มคำศัพท์");
  expect(screen.queryByText(/AI ช่วย/)).not.toBeInTheDocument();
});
it("removes redundant headings while keeping pronunciation and both meanings", () => {
  render(<WordCard entry={entry} />);
  expect(screen.queryByText("IN SIMPLE ENGLISH")).not.toBeInTheDocument();
  expect(screen.queryByText("AMERICAN PRONUNCIATION")).not.toBeInTheDocument();
  expect(screen.getByText(entry.explanation)).toBeInTheDocument();
  expect(screen.getByText(entry.thai)).toBeInTheDocument();
  expect(screen.getByText("sind")).toHaveClass("stressed");
});
it("completion is a single quiet line", () => {
  render(
    <TodayWords
      entries={[entry, { ...entry, id: "2", word: "serene" }]}
      onAdd={() => {}}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(/^ครบสองคำแล้ว$/);
});
