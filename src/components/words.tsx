"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import {
  remainingSlots,
  thaiMeaningSchema,
  type Vocabulary,
  type DictionaryEntry,
} from "../domain/vocabulary";
import { Icon } from "./icon";
export function WordCard({
  entry,
  headingLevel = 2,
  onRemove,
  todayPosition,
  active = true,
}: {
  entry: Vocabulary;
  headingLevel?: 2 | 3;
  onRemove?: () => void;
  todayPosition?: number;
  active?: boolean;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const content = entry.content;
  const compact = todayPosition !== undefined;
  const cardClass = compact ? "word-card today-word-card" : "word-card";
  const number = compact && (
    <span className="word-number" aria-hidden="true">
      {String(todayPosition).padStart(2, "0")}
    </span>
  );
  if (content.kind === "legacy")
    return (
      <article className={cardClass}>
        {number}
        {onRemove && (
          <button
            type="button"
            className="word-remove"
            onClick={onRemove}
            aria-label={`Remove ${entry.word}`}
            title={`Remove ${entry.word}`}
          >
            <Icon name="close" />
          </button>
        )}
        <div className="word-identity">
          <div className="word-heading">
            <Heading className="word-title" lang="en">
              {entry.word}
            </Heading>
            {!compact && <span className="legacy-label">Legacy entry</span>}
          </div>
          {!compact && (
            <p className="legacy-pronunciation" lang="en">
              {content.syllables.map((s) => s.text).join(" · ")}
            </p>
          )}
        </div>
        <div className="word-content">
          <div className="meaning">
            <p lang="en">{content.explanation}</p>
          </div>
        </div>
      </article>
    );
  const dictionary = content.entry;
  const pronunciations = dictionary.pronunciations.filter(
    (p, i, rows) =>
      rows.findIndex(
        (row) =>
          row.region === p.region &&
          row.ipa === p.ipa &&
          row.audioUrl === p.audioUrl,
      ) === i,
  );
  const preferred =
    pronunciations.find((p) => p.region === "us") ||
    pronunciations.find((p) => p.region === "uk") ||
    pronunciations[0];
  return (
    <article className={cardClass}>
      {number}
      {onRemove && (
        <button
          type="button"
          className="word-remove"
          onClick={onRemove}
          aria-label={`Remove ${entry.word}`}
          title={`Remove ${entry.word}`}
        >
          <Icon name="close" />
        </button>
      )}
      <div className="word-identity">
        <div className="word-heading">
          <Heading className="word-title" lang="en">
            {entry.word}
          </Heading>
        </div>
        {!compact &&
          dictionary.headword.toLowerCase() !== entry.word.toLowerCase() && (
            <p className="canonical-headword" lang="en">
              {dictionary.headword}
            </p>
          )}
        {preferred && (
          <Pronunciation
            word={entry.word}
            pronunciation={preferred}
            active={active}
          />
        )}
      </div>
      <div className="word-content">
        <div className="meaning" lang="en">
          {dictionary.definitions.slice(0, 1).map((definition) => (
            <Sense
              key={definition.id}
              definition={definition}
              showExamples={!compact}
            />
          ))}
          {dictionary.definitions.length > 1 && (
            <details className="dictionary-details">
              <summary>
                {dictionary.definitions.length - 1} more{" "}
                {dictionary.definitions.length === 2 ? "meaning" : "meanings"}
              </summary>
              {dictionary.definitions.slice(1).map((definition) => (
                <Sense key={definition.id} definition={definition} />
              ))}
            </details>
          )}
        </div>
        {pronunciations.length > 1 && (
          <details className="dictionary-details">
            <summary>More pronunciations</summary>
            {pronunciations
              .filter((p) => p !== preferred)
              .map((p, i) => (
                <Pronunciation
                  key={i}
                  word={entry.word}
                  pronunciation={p}
                  active={active}
                />
              ))}
          </details>
        )}
        {dictionary.verbForms.length > 0 && (
          <details className="dictionary-details verb-forms">
            <summary>Verb forms</summary>
            <dl lang="en">
              {dictionary.verbForms.map((form) => (
                <div key={form.id}>
                  <dt>{form.type}</dt>
                  <dd>{form.text}</dd>
                </div>
              ))}
            </dl>
            <span className="dictionary-source">Simple Wiktionary</span>
          </details>
        )}
        {!compact && (
          <a
            className="dictionary-source"
            href={`https://dictionary.cambridge.org/us/dictionary/english/${encodeURIComponent(entry.word.toLowerCase())}`}
            target="_blank"
            rel="noreferrer"
          >
            Cambridge Dictionary
          </a>
        )}
      </div>
    </article>
  );
}
function Sense({
  definition,
  showExamples = true,
}: {
  definition: DictionaryEntry["definitions"][number];
  showExamples?: boolean;
}) {
  return (
    <section className="definition">
      {definition.pos && <p className="part-of-speech">{definition.pos}</p>}
      <p>{definition.text}</p>
      {showExamples && definition.examples.length > 0 && (
        <ul className="examples">
          {definition.examples.map((example) => (
            <li key={example.id}>{example.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
function Pronunciation({
  word,
  pronunciation,
  active = true,
}: {
  word: string;
  pronunciation: DictionaryEntry["pronunciations"][number];
  active?: boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false),
    [error, setError] = useState(false);
  const visible = useRef(active);
  useEffect(() => {
    visible.current = active;
    if (!active && audio.current && !audio.current.paused)
      audio.current.pause();
  }, [active]);
  async function toggle() {
    if (!audio.current) return;
    if (playing) {
      audio.current.pause();
      setPlaying(false);
      return;
    }
    setError(false);
    try {
      await audio.current.play();
      if (!visible.current) {
        audio.current.pause();
        return;
      }
      setPlaying(true);
    } catch {
      setError(true);
    }
  }
  return (
    <div className="pronunciation" lang="en">
      <p>{pronunciation.ipa}</p>
      <span className="pronunciation-origin">
        {pronunciation.region.toUpperCase()}
      </span>
      {pronunciation.audioUrl && (
        <>
          <button
            className="icon-button pronunciation-play"
            onClick={() => void toggle()}
            aria-label={`${playing ? "Stop" : "Play"} ${word} ${pronunciation.region.toUpperCase()}`}
            aria-pressed={playing}
          >
            <Icon name="volume" />
          </button>
          <audio
            ref={audio}
            src={pronunciation.audioUrl}
            preload="none"
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => {
              setPlaying(false);
              setError(true);
            }}
          />
        </>
      )}
      {error && (
        <span role="alert" className="audio-error">
          Audio playback failed.
        </span>
      )}
    </div>
  );
}
export function TodayWords({
  entries,
  onRemove,
  onUpdateMeaning,
}: {
  entries: Vocabulary[];
  onRemove: (entry: Vocabulary) => void;
  onUpdateMeaning?: (id: string, meaning: string) => Promise<void>;
}) {
  return (
    <div className="word-list today-word-list">
      {remainingSlots(entries.length) === 0 && (
        <div className="sr-only" role="status">
          <span>You've reached today's two-word limit.</span>
        </div>
      )}
      {entries.map((entry, index) =>
        onUpdateMeaning ? (
          <FlippableWordCard
            key={entry.id}
            entry={entry}
            todayPosition={index + 1}
            onRemove={() => onRemove(entry)}
            onSave={onUpdateMeaning}
          />
        ) : (
          <WordCard
            key={entry.id}
            entry={entry}
            todayPosition={index + 1}
            onRemove={() => onRemove(entry)}
          />
        ),
      )}
    </div>
  );
}

type MeaningEditor =
  | { kind: "view" }
  | { kind: "editing"; draft: string }
  | { kind: "saving"; draft: string }
  | { kind: "error"; draft: string; message: string };
export function FlippableWordCard({
  entry,
  todayPosition,
  onRemove,
  onSave,
}: {
  entry: Vocabulary;
  todayPosition: number;
  onRemove: () => void;
  onSave: (id: string, meaning: string) => Promise<void>;
}) {
  const [face, setFace] = useState<"front" | "back">("front");
  const [editor, setEditor] = useState<MeaningEditor>({ kind: "view" });
  const input = useRef<HTMLInputElement>(null);
  const flip = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const composing = useRef(false);
  const id = useId();
  const meaning = entry.content.thaiMeaning;
  function edit() {
    setEditor({ kind: "editing", draft: meaning ?? "" });
    requestAnimationFrame(() => input.current?.focus());
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (editor.kind === "view" || saving.current || composing.current) return;
    const draft = editor.draft;
    const parsed = thaiMeaningSchema.safeParse(draft);
    if (!parsed.success) {
      setEditor({
        kind: "error",
        draft,
        message: parsed.error.issues[0].message,
      });
      return;
    }
    saving.current = true;
    setEditor({ kind: "saving", draft });
    try {
      await onSave(entry.id, parsed.data);
      setEditor({ kind: "view" });
      requestAnimationFrame(() => flip.current?.focus());
    } catch (error) {
      setEditor({
        kind: "error",
        draft,
        message:
          error instanceof Error
            ? error.message
            : "Couldn't save the meaning. Please try again.",
      });
      requestAnimationFrame(() => input.current?.focus());
    } finally {
      saving.current = false;
    }
  }
  return (
    <div className="flip-card" data-face={face}>
      <div className="flip-card-rotor">
        <div
          className="flip-card-face flip-card-front"
          inert={face === "back"}
          aria-hidden={face === "back"}
        >
          <WordCard
            entry={entry}
            todayPosition={todayPosition}
            onRemove={onRemove}
            active={face === "front"}
          />
        </div>
        <div
          className="flip-card-face flip-card-back"
          inert={face === "front"}
          aria-hidden={face === "front"}
        >
          <div className="meaning-editor">
            {editor.kind === "view" ? (
              meaning ? (
                <div className="saved-thai-meaning">
                  <p lang="th">{meaning}</p>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit Thai meaning for ${entry.word}`}
                    onClick={edit}
                  >
                    <Icon name="pencil" />
                  </button>
                </div>
              ) : (
                <button type="button" className="meaning-add" onClick={edit}>
                  <Icon name="plus" />
                  <span>Add a word</span>
                </button>
              )
            ) : (
              <form
                onSubmit={submit}
                aria-label={`Thai meaning for ${entry.word}`}
                aria-busy={editor.kind === "saving"}
              >
                <label htmlFor={id} className="sr-only">
                  Thai meaning for {entry.word}
                </label>
                <input
                  ref={input}
                  id={id}
                  lang="th"
                  autoComplete="off"
                  placeholder="เพิ่มความหมายภาษาไทย"
                  value={editor.draft}
                  maxLength={600}
                  required
                  disabled={editor.kind === "saving"}
                  aria-invalid={editor.kind === "error"}
                  aria-describedby={
                    editor.kind === "error" ? `${id}-error` : `${id}-hint`
                  }
                  onCompositionStart={() => {
                    composing.current = true;
                  }}
                  onCompositionEnd={() => {
                    composing.current = false;
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.nativeEvent.isComposing ||
                        composing.current ||
                        event.keyCode === 229)
                    )
                      event.preventDefault();
                    if (event.key === "Escape" && editor.kind !== "saving") {
                      setEditor({ kind: "view" });
                      flip.current?.focus();
                    }
                  }}
                  onChange={(event) =>
                    setEditor({ kind: "editing", draft: event.target.value })
                  }
                />
                <p id={`${id}-hint`} className="meaning-hint">
                  {editor.kind === "saving" ? (
                    <span role="status">Saving…</span>
                  ) : (
                    "Press Enter to save"
                  )}
                </p>
                {editor.kind === "error" && (
                  <p id={`${id}-error`} role="alert" className="error">
                    {editor.message}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
      <button
        ref={flip}
        type="button"
        className="card-flip-button"
        aria-label={`Flip ${entry.word} card`}
        aria-pressed={face === "back"}
        disabled={editor.kind === "saving"}
        onClick={() => {
          flip.current?.focus();
          setFace((face) => (face === "front" ? "back" : "front"));
          setEditor({ kind: "view" });
        }}
      >
        <Icon name="flip" />
        <span>Flip</span>
      </button>
    </div>
  );
}
