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
import { FlippableWordCard } from "../src/components/words";
import { vocabulary } from "./fixtures/dictionary";
import type { Vocabulary } from "../src/domain/vocabulary";
afterEach(cleanup);
it("lets History inspect the saved Thai meaning and return to the dictionary", () => {
  const entry: Vocabulary = {
    ...vocabulary,
    content: { ...vocabulary.content, thaiMeaning: "ควร" },
  };
  render(<FlippableWordCard entry={entry} headingLevel={3} />);
  expect(
    screen.getByRole("heading", { name: "ought", level: 3 }),
  ).toBeVisible();
  const flip = screen.getByRole("button", { name: "Flip ought card" });
  fireEvent.click(flip);
  expect(flip).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("ควร")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "ought" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Edit|Remove|Add/ })).toBeNull();
  fireEvent.click(flip);
  expect(
    screen.getByRole("heading", { name: "ought", level: 3 }),
  ).toBeVisible();
});
it("shows an honest empty back for a historical word without a meaning", () => {
  render(<FlippableWordCard entry={vocabulary} headingLevel={3} />);
  fireEvent.click(screen.getByRole("button", { name: "Flip ought card" }));
  expect(screen.getByText("No Thai meaning yet.")).toBeVisible();
  expect(screen.queryByRole("textbox")).toBeNull();
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
  fireEvent.click(
    screen.getByRole("button", { name: "Edit Thai meaning for ought" }),
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
