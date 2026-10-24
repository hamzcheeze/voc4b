"use client";
import React, { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { TodayWords } from "./words";
import { Icon } from "./icon";
import {
  DUPLICATE_WORD_MESSAGE,
  validateWord,
  type Vocabulary,
} from "../domain/vocabulary";
export default function TodayView() {
  const {
    entries,
    loading,
    error,
    today,
    refresh,
    add,
    remove,
    updateMeaning,
    mode,
  } = useWorkspace();
  const [word, setWord] = useState("");
  const [submission, setSubmission] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const busy = submission.kind === "saving";
  const [removeTarget, setRemoveTarget] = useState<Vocabulary | null>(null),
    [removeBusy, setRemoveBusy] = useState(false),
    [removeError, setRemoveError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const removeDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (removeTarget) removeDialog.current?.showModal();
    else if (removeDialog.current?.open) removeDialog.current.close();
  }, [removeTarget]);
  const words = entries.filter((x) => x.day === today);
  useEffect(() => {
    if (mode !== "live" || busy || loading || words.length >= 2) return;
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
  }, [mode, busy, loading, word, entries, words.length]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || loading || words.length >= 2 || !word.trim()) return;
    saving.current = true;
    setSubmission({ kind: "saving" });
    try {
      const candidate = validateWord(word);
      if (
        entries.some(
          (entry) => entry.word.toLowerCase() === candidate.toLowerCase(),
        )
      )
        throw new Error(DUPLICATE_WORD_MESSAGE);
      await add(candidate);
      setWord("");
      setSubmission({ kind: "idle" });
    } catch (e) {
      setSubmission({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not add the word.",
      });
    } finally {
      saving.current = false;
      requestAnimationFrame(() => input.current?.focus());
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
      requestAnimationFrame(() => input.current?.focus());
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
      <div className="page-heading today-heading">
        <div>
          <h1>Today</h1>
        </div>
        <div
          className="progress today-progress"
          aria-label={`${words.length} of 2 words saved`}
        >
          <div className="today-progress-heading">
            <span className="today-progress-label">Today's words</span>
            <span className="today-progress-count">
              {words.length} / 2 words
            </span>
          </div>
          <progress
            value={words.length}
            max={2}
            aria-label="Daily word progress"
          />
          <p>
            {words.length === 2
              ? "Lovely work. See you tomorrow."
              : "Two words, one day at a time."}
          </p>
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
        <>
          {words.length < 2 && (
            <form className="add-word-form" aria-label="Add" onSubmit={submit}>
              <label htmlFor="new-word" className="sr-only">
                Word
              </label>
              <input
                ref={input}
                id="new-word"
                lang="en"
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter a word or phrase"
                value={word}
                onChange={(event) => {
                  setWord(event.target.value);
                  if (submission.kind === "error")
                    setSubmission({ kind: "idle" });
                }}
                maxLength={80}
                required
                disabled={busy}
                aria-invalid={submission.kind === "error"}
                aria-describedby={
                  submission.kind === "error" ? "add-word-error" : undefined
                }
              />
              <button
                type="submit"
                className="add-card"
                disabled={busy || !word.trim()}
              >
                <span>{busy ? "Saving…" : "Add"}</span>
              </button>
              {mode === "demo" && (
                <p className="input-hint">Try: rescind, serene, lucid</p>
              )}
              {submission.kind === "error" && (
                <p id="add-word-error" role="alert" className="error">
                  {submission.message}
                </p>
              )}
            </form>
          )}
          <TodayWords
            entries={words}
            onUpdateMeaning={updateMeaning}
            onRemove={(entry) => setRemoveTarget(entry)}
          />
        </>
      )}
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
