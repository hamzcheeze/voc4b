"use client";
import React, { useRef, useState } from "react";
import {
  remainingSlots,
  type Vocabulary,
  type DictionaryEntry,
} from "../domain/vocabulary";
import { Icon } from "./icon";
export function WordCard({
  entry,
  headingLevel = 2,
  onRemove,
}: {
  entry: Vocabulary;
  headingLevel?: 2 | 3;
  onRemove?: () => void;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const content = entry.content;
  if (content.kind === "legacy")
    return (
      <article className="word-card">
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
            <span className="legacy-label">Legacy entry</span>
          </div>
          <p className="legacy-pronunciation" lang="en">
            {content.syllables.map((s) => s.text).join(" · ")}
          </p>
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
    <article className="word-card">
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
        {dictionary.headword.toLowerCase() !== entry.word.toLowerCase() && (
          <p className="canonical-headword" lang="en">
            {dictionary.headword}
          </p>
        )}
        {preferred && (
          <Pronunciation word={entry.word} pronunciation={preferred} />
        )}
      </div>
      <div className="word-content">
        <div className="meaning" lang="en">
          {dictionary.definitions.slice(0, 1).map((definition) => (
            <Sense key={definition.id} definition={definition} />
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
                <Pronunciation key={i} word={entry.word} pronunciation={p} />
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
        <a
          className="dictionary-source"
          href={`https://dictionary.cambridge.org/us/dictionary/english/${encodeURIComponent(entry.word.toLowerCase())}`}
          target="_blank"
          rel="noreferrer"
        >
          Cambridge Dictionary
        </a>
      </div>
    </article>
  );
}
function Sense({
  definition,
}: {
  definition: DictionaryEntry["definitions"][number];
}) {
  return (
    <section className="definition">
      {definition.pos && <p className="part-of-speech">{definition.pos}</p>}
      <p>{definition.text}</p>
      {definition.examples.length > 0 && (
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
}: {
  word: string;
  pronunciation: DictionaryEntry["pronunciations"][number];
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false),
    [error, setError] = useState(false);
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
}: {
  entries: Vocabulary[];
  onRemove: (entry: Vocabulary) => void;
}) {
  return (
    <div className="word-list">
      {remainingSlots(entries.length) === 0 && (
        <div className="sr-only" role="status">
          <span>You've reached today's two-word limit.</span>
        </div>
      )}
      {entries.map((entry) => (
        <WordCard
          key={entry.id}
          entry={entry}
          onRemove={() => onRemove(entry)}
        />
      ))}
    </div>
  );
}
