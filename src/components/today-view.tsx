"use client";
import React, { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { TodayWords } from "./words";
import { Icon } from "./icon";
import {
  dateLabel,
  DUPLICATE_WORD_MESSAGE,
  validateWord,
  type Vocabulary,
} from "../domain/vocabulary";
export default function TodayView() {
  const { entries, loading, error, today, refresh, add, remove, mode } =
    useWorkspace();
  const [open, setOpen] = useState(false),
    [word, setWord] = useState(""),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState(""),
    [removeTarget, setRemoveTarget] = useState<Vocabulary | null>(null),
    [removeBusy, setRemoveBusy] = useState(false),
    [removeError, setRemoveError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const removeDialog = useRef<HTMLDialogElement>(null);
  const addButton = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    if (removeTarget) removeDialog.current?.showModal();
    else if (removeDialog.current?.open) removeDialog.current.close();
  }, [removeTarget]);
  const words = entries.filter((x) => x.day === today);
  useEffect(() => {
    if (mode !== "live" || !open || busy || loading || words.length >= 2)
      return;
    let candidate: string;
    try {
      candidate = validateWord(word).toLowerCase();
    } catch {
      return;
    }
    if (
      candidate.length < 2 ||
      entries.some((entry) => entry.word.toLowerCase() === candidate)
    )
      return;
    const timer = setTimeout(() => {
      void fetch("/api/words", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: candidate }),
      }).catch(() => {});
    }, 650);
    return () => clearTimeout(timer);
  }, [mode, open, busy, loading, word, entries, words.length]);
  function close() {
    if (busy) return;
    setOpen(false);
    setSaveError("");
    addButton.current?.focus();
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaveError("");
    try {
      if (
        entries.some(
          (entry) => entry.word.toLowerCase() === word.trim().toLowerCase(),
        )
      )
        throw new Error(DUPLICATE_WORD_MESSAGE);
      await add(word);
      setOpen(false);
      setWord("");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not add the word.");
    } finally {
      setBusy(false);
    }
  }
  function closeRemove() {
    if (removeBusy) return;
    setRemoveTarget(null);
    setRemoveError("");
  }
  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoveBusy(true);
    setRemoveError("");
    try {
      await remove(removeTarget.id);
      setRemoveTarget(null);
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>(".add-card")?.focus(),
      );
    } catch (e) {
      setRemoveError(
        e instanceof Error ? e.message : "Could not remove the word.",
      );
    } finally {
      setRemoveBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Today</h1>
          <time dateTime={today}>{dateLabel(today)}</time>
        </div>
        <div
          className="progress"
          aria-label={`${words.length} of 2 words saved`}
        >
          <span>{words.length} / 2 words</span>
        </div>
      </div>
      {loading ? (
        <p className="loading" role="status">
          Loading…
        </p>
      ) : error ? (
        <div className="error" role="alert">
          {error}
          <button onClick={() => void refresh()}>Try again</button>
        </div>
      ) : (
        <TodayWords
          entries={words}
          onAdd={() => {
            addButton.current = document.activeElement as HTMLElement;
            setOpen(true);
          }}
          onRemove={(entry) => setRemoveTarget(entry)}
        />
      )}
      <dialog
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        aria-labelledby="add-title"
      >
        <form onSubmit={submit}>
          <div className="dialog-heading">
            <h2 id="add-title">Add a word</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close"
              onClick={close}
              disabled={busy}
            >
              <Icon name="close" />
            </button>
          </div>
          <label htmlFor="new-word" className="sr-only">
            Word
          </label>
          <input
            id="new-word"
            lang="en"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder=""
            value={word}
            onChange={(e) => setWord(e.target.value)}
            maxLength={80}
            required
            disabled={busy}
          />
          {mode === "demo" && (
            <p className="input-hint">Try: rescind, serene, lucid</p>
          )}
          {saveError && (
            <div role="alert" className="error">
              {saveError}
            </div>
          )}
          <button className="primary" disabled={busy || !word.trim()}>
            {busy ? "Saving…" : "Save"}
            {!busy && <Icon name="arrow" />}
          </button>
        </form>
      </dialog>
      <dialog
        ref={removeDialog}
        className="remove-dialog"
        onCancel={(event) => {
          event.preventDefault();
          closeRemove();
        }}
        onClose={closeRemove}
        aria-labelledby="remove-title"
      >
        <div className="dialog-heading">
          <h2 id="remove-title">Remove {removeTarget?.word}?</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={closeRemove}
            disabled={removeBusy}
          >
            <Icon name="close" />
          </button>
        </div>
        <p className="remove-copy">
          This frees a space for another word today.
        </p>
        {removeError && (
          <p role="alert" className="error">
            {removeError}
          </p>
        )}
        <div className="remove-actions">
          <button
            type="button"
            className="text-button"
            onClick={closeRemove}
            disabled={removeBusy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void confirmRemove()}
            disabled={removeBusy}
          >
            {removeBusy ? "Removing…" : "Remove"}
          </button>
        </div>
      </dialog>
    </>
  );
}
