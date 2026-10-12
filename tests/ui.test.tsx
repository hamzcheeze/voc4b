import React from "react";
import { it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TodayWords, WordCard } from "../src/components/words";
import { vocabulary, dictionaryEntry } from "./fixtures/dictionary";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each([0, 1, 2])("shows one add control below cap, saved=%i", (n) => {
  render(
    <TodayWords
      entries={Array.from({ length: n }, (_, i) => ({
        ...vocabulary,
        id: String(i),
      }))}
      onAdd={() => {}}
      onRemove={() => {}}
    />,
  );
  expect(screen.queryAllByRole("button", { name: /Add a word/ })).toHaveLength(
    n < 2 ? 1 : 0,
  );
  expect(screen.queryAllByRole("heading", { name: "ought" })).toHaveLength(n);
});
it("offers per-word removal on Today without a removal action in history", () => {
  const onRemove = vi.fn();
  render(
    <TodayWords entries={[vocabulary]} onAdd={() => {}} onRemove={onRemove} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove ought" }));
  expect(onRemove).toHaveBeenCalledWith(vocabulary);
  cleanup();
  render(<WordCard entry={vocabulary} headingLevel={3} />);
  expect(screen.queryByRole("button", { name: "Remove ought" })).toBeNull();
});
it("displays requested word, canonical phrase, US IPA and every sense/example", () => {
  render(<WordCard entry={vocabulary} />);
  expect(screen.getByRole("heading", { name: "ought" })).toBeVisible();
  expect(screen.getByText("ought to")).toBeVisible();
  expect(screen.getByText("/ɔt/")).toBeVisible();
  expect(screen.getByText("You ought to apologize.")).toBeVisible();
  expect(screen.getByText("We ought to leave now.")).toBeVisible();
  const summary = screen.getByText("1 more meaning");
  fireEvent.click(summary);
  expect(
    screen.getByText("Used to say what is likely to happen."),
  ).toBeInTheDocument();
  expect(screen.getByText("They ought to arrive soon.")).toBeInTheDocument();
  expect(document.querySelector('[lang="th"].thai')).toBeNull();
});
it("uses UK IPA when there is no US pronunciation", () => {
  render(
    <WordCard
      entry={{
        ...vocabulary,
        content: {
          kind: "dictionary",
          entry: {
            ...dictionaryEntry,
            pronunciations: dictionaryEntry.pronunciations.filter(
              (p) => p.region === "uk",
            ),
          },
        },
      }}
    />,
  );
  expect(screen.getByText("/ɔːt/")).toBeVisible();
  expect(screen.getByText("UK")).toBeVisible();
  expect(screen.queryByText("US")).not.toBeInTheDocument();
});
it("does not render duplicate pronunciation controls", () => {
  const us = dictionaryEntry.pronunciations[1];
  render(
    <WordCard
      entry={{
        ...vocabulary,
        content: {
          kind: "dictionary",
          entry: {
            ...dictionaryEntry,
            pronunciations: [us, { ...us, pos: "another source" }],
          },
        },
      }}
    />,
  );
  expect(screen.getAllByRole("button", { name: "Play ought US" })).toHaveLength(
    1,
  );
  expect(screen.queryByText("More pronunciations")).not.toBeInTheDocument();
});
it("plays the API audio and stops from the same control", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const pause = vi
    .spyOn(HTMLMediaElement.prototype, "pause")
    .mockImplementation(() => {});
  render(<WordCard entry={vocabulary} />);
  const button = screen.getByRole("button", { name: "Play ought US" });
  fireEvent.click(button);
  expect(
    await screen.findByRole("button", { name: "Stop ought US" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(play).toHaveBeenCalledTimes(1);
  const media = play.mock.instances[0];
  expect(media).toHaveAttribute(
    "src",
    dictionaryEntry.pronunciations[1].audioUrl,
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop ought US" }));
  expect(pause).toHaveBeenCalledTimes(1);
  expect(button).toHaveAttribute("aria-pressed", "false");
});
it("renders historical English honestly without Thai or invented IPA", () => {
  render(
    <WordCard
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
  expect(screen.getByText("Legacy entry")).toBeVisible();
  expect(screen.getByText("To cancel a decision.")).toBeVisible();
  expect(screen.getByText("sind")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Play/ }),
  ).not.toBeInTheDocument();
});

it("reports a media error after playback starts and resets the control", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const { container } = render(<WordCard entry={vocabulary} />);
  fireEvent.click(screen.getByRole("button", { name: "Play ought US" }));
  const playing = await screen.findByRole("button", {
    name: "Stop ought US",
  });
  expect(playing).toHaveAttribute("aria-pressed", "true");
  const audio = container.querySelector("audio");
  if (!audio) throw new Error("The dictionary audio control is missing.");
  fireEvent.error(audio);
  expect(screen.getByRole("alert")).toHaveTextContent("Audio playback failed.");
  expect(screen.getByRole("button", { name: "Play ought US" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
