import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FlippableWordCard, HistoryWordCard } from "../src/components/words";
import { vocabulary } from "./fixtures/dictionary";
import type { Vocabulary } from "../src/domain/vocabulary";
afterEach(cleanup);
it("flips Today's card on a double-click while a single click leaves it visible", () => {
  const remove = vi.fn();
  const entry: Vocabulary = {
    ...vocabulary,
    content: { ...vocabulary.content, thaiMeaning: "ควร" },
  };
  const { container } = render(
    <FlippableWordCard entry={entry} todayPosition={1} onRemove={remove} />,
  );
  const card = container.querySelector(".flip-card");
  const flip = screen.getByRole("button", { name: "Flip ought card" });
  expect(flip).toHaveClass("sr-only");
  fireEvent.click(screen.getByText("1 more meaning"));
  expect(card).toHaveAttribute("data-face", "front");
  fireEvent.click(screen.getByRole("heading", { name: "ought" }));
  expect(card).toHaveAttribute("data-face", "front");
  fireEvent.doubleClick(screen.getByRole("heading", { name: "ought" }));
  expect(card).toHaveAttribute("data-face", "back");
  fireEvent.click(screen.getByText("ควร"));
  expect(card).toHaveAttribute("data-face", "back");
  fireEvent.doubleClick(screen.getByText("ควร"));
  expect(card).toHaveAttribute("data-face", "front");
  fireEvent.doubleClick(screen.getByRole("button", { name: "Remove ought" }));
  expect(card).toHaveAttribute("data-face", "front");
  fireEvent.click(screen.getByRole("button", { name: "Remove ought" }));
  expect(remove).toHaveBeenCalledOnce();
  expect(card).toHaveAttribute("data-face", "front");
});
it("shows only the saved Thai meaning in History without a flip control", () => {
  const entry: Vocabulary = {
    ...vocabulary,
    content: { ...vocabulary.content, thaiMeaning: "ควร" },
  };
  render(<HistoryWordCard entry={entry} />);
  expect(
    screen.getByRole("heading", { name: "ought", level: 3 }),
  ).toBeVisible();
  expect(screen.getByText("modal verb")).toBeVisible();
  expect(screen.getByText("/ɔt/")).toBeVisible();
  expect(screen.getByText("ควร")).toBeVisible();
  expect(
    screen.queryByText("Used to say what is necessary or right."),
  ).toBeNull();
  expect(screen.queryByText("1 more meaning")).toBeNull();
  expect(screen.queryByRole("button", { name: /Flip|Edit|Remove/ })).toBeNull();
});
it("labels a historical word that has no Thai meaning", () => {
  render(<HistoryWordCard entry={vocabulary} />);
  expect(screen.getByText("No Thai meaning yet.")).toBeVisible();
  expect(
    screen.queryByText("Used to say what is necessary or right."),
  ).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("does not show an old English explanation in History", () => {
  render(
    <HistoryWordCard
      entry={{
        id: "old",
        word: "rescind",
        day: "2026-10-09",
        content: {
          kind: "legacy",
          explanation: "To cancel a decision.",
          syllables: [{ text: "sind", stressed: true }],
        },
      }}
    />,
  );
  expect(screen.getByRole("heading", { name: "rescind" })).toBeVisible();
  expect(screen.getByText("No Thai meaning yet.")).toBeVisible();
  expect(screen.queryByText("To cancel a decision.")).toBeNull();
  expect(screen.queryByRole("button", { name: /Flip/ })).toBeNull();
});
it("keeps draft after a failed save, then displays persisted text and allows editing", async () => {
  const save = vi
    .fn<(id: string, meaning: string) => Promise<void>>()
    .mockRejectedValueOnce(new Error("Storage unavailable"))
    .mockResolvedValue(undefined);
  function Card() {
    const [entry, setEntry] = useState<Vocabulary>(vocabulary);
    return (
      <FlippableWordCard
        entry={entry}
        todayPosition={1}
        onRemove={() => {}}
        onSave={async (id, meaning) => {
          await save(id, meaning);
          setEntry((row) => ({
            ...row,
            content: { ...row.content, thaiMeaning: meaning },
          }));
        }}
      />
    );
  }
  const { container } = render(<Card />);
  const flip = screen.getByRole("button", { name: "Flip ought card" });
  fireEvent.click(flip);
  expect(container.querySelector(".flip-card-front")).toHaveAttribute("inert");
  fireEvent.click(screen.getByRole("button", { name: "Add a word" }));
  const input = screen.getByRole("textbox", { name: "Thai meaning for ought" });
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.change(input, { target: { value: "  ควร  " } });
  fireEvent.submit(
    screen.getByRole("form", { name: "Thai meaning for ought" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Storage unavailable",
  );
  expect(input).toHaveValue("  ควร  ");
  fireEvent.submit(
    screen.getByRole("form", { name: "Thai meaning for ought" }),
  );
  expect(await screen.findByText("ควร")).toBeVisible();
  expect(save).toHaveBeenLastCalledWith("1", "ควร");
  expect(container.querySelector(".flip-card")).toHaveAttribute(
    "data-face",
    "back",
  );
  fireEvent.click(flip);
  fireEvent.click(flip);
  const edit = screen.getByRole("button", {
    name: "Edit Thai meaning for ought",
  });
  expect(edit.parentElement).toHaveClass("flip-card-back");
  fireEvent.click(edit);
  expect(container.querySelector(".flip-card")).toHaveAttribute(
    "data-face",
    "back",
  );
  expect(screen.getByRole("textbox")).toHaveValue("ควร");
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(flip).toHaveFocus();
});
it("does not save while the user composes text and blocks duplicate pending submissions", async () => {
  let finish: (() => void) | undefined;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <FlippableWordCard
      entry={vocabulary}
      todayPosition={1}
      onRemove={() => {}}
      onSave={save}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Flip ought card" }));
  fireEvent.click(screen.getByRole("button", { name: "Add a word" }));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "ควร" } });
  const form = screen.getByRole("form");
  fireEvent.compositionStart(input);
  fireEvent.submit(form);
  expect(save).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent("Saving…");
  expect(
    screen.getByRole("button", { name: "Flip ought card" }),
  ).toBeDisabled();
  finish?.();
  await waitFor(() =>
    expect(screen.queryByRole("status")).not.toBeInTheDocument(),
  );
});
