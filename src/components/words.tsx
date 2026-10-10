import React from "react";
import { remainingSlots, type Vocabulary } from "../domain/vocabulary";
import { Icon } from "./icon";
export function WordCard({ entry }: { entry: Vocabulary; index?: number }) {
  return (
    <article className="word-card">
      <div className="word-heading">
        <h2 lang="en">{entry.word}</h2>
      </div>
      <div
        className="pronunciation"
        lang="en"
        aria-label="American pronunciation"
      >
        <p>
          {entry.syllables.map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span className="syllable-dot" aria-hidden="true">
                  {" "}
                  ·{" "}
                </span>
              )}
              {s.stressed ? (
                <strong className="stressed">{s.text}</strong>
              ) : (
                <span>{s.text}</span>
              )}
            </React.Fragment>
          ))}
        </p>
        <span className="pronunciation-origin">US</span>
      </div>
      <div className="meaning">
        <p lang="en">{entry.explanation}</p>
        <p lang="th" className="thai">
          {entry.thai}
        </p>
      </div>
    </article>
  );
}
export function TodayWords({
  entries,
  onAdd,
}: {
  entries: Vocabulary[];
  onAdd: () => void;
}) {
  return (
    <div className="word-list">
      {entries.map((entry) => (
        <WordCard key={entry.id} entry={entry} />
      ))}
      {remainingSlots(entries.length) > 0 ? (
        <button className="add-card" onClick={onAdd}>
          <Icon name="plus" />
          <span>เพิ่มคำศัพท์</span>
        </button>
      ) : (
        <div className="sr-only" role="status">
          <span>ครบสองคำแล้ว</span>
        </div>
      )}
    </div>
  );
}
