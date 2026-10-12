import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TodayWords, WordCard } from "../src/components/words";
import { vocabulary } from "./fixtures/dictionary";
afterEach(cleanup);
it("keeps one concise action without helper copy", () => {
  render(<TodayWords entries={[]} onAdd={() => {}} />);
  expect(screen.getByRole("button")).toHaveAccessibleName("Add a word");
});
it("uses compact meaning disclosure instead of repeated headings", () => {
  render(<WordCard entry={vocabulary} />);
  expect(screen.queryByText("IN SIMPLE ENGLISH")).not.toBeInTheDocument();
  expect(screen.queryByText("AMERICAN PRONUNCIATION")).not.toBeInTheDocument();
  expect(screen.getByText("1 more meaning").tagName).toBe("SUMMARY");
});
it("completion is a single quiet line", () => {
  render(
    <TodayWords
      entries={[vocabulary, { ...vocabulary, id: "2", word: "serene" }]}
      onAdd={() => {}}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    /^You've reached today's two-word limit.$/,
  );
});
