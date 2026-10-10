"use client";
import React, { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../components/workspace";
import { TodayWords } from "../components/words";
import { Icon } from "../components/icon";
import { dateLabel } from "../domain/vocabulary";
export default function TodayPage() {
  const { entries, loading, error, today, refresh, add, mode } = useWorkspace();
  const [open, setOpen] = useState(false),
    [word, setWord] = useState(""),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const addButton = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  const words = entries.filter((x) => x.day === today);
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
      await add(word);
      setOpen(false);
      setWord("");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "เพิ่มคำไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>วันนี้</h1>
          <time dateTime={today}>{dateLabel(today)}</time>
        </div>
        <div
          className="progress"
          aria-label={`บันทึกแล้ว ${words.length} จาก 2 คำ`}
        >
          <span>{words.length} / 2 คำ</span>
        </div>
      </div>
      {loading ? (
        <p className="loading" role="status">
          กำลังโหลด…
        </p>
      ) : error ? (
        <div className="error" role="alert">
          {error}
          <button onClick={() => void refresh()}>ลองใหม่</button>
        </div>
      ) : (
        <TodayWords
          entries={words}
          onAdd={() => {
            addButton.current = document.activeElement as HTMLElement;
            setOpen(true);
          }}
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
            <h2 id="add-title">เพิ่มคำศัพท์</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="ปิด"
              onClick={close}
              disabled={busy}
            >
              <Icon name="close" />
            </button>
          </div>
          <label htmlFor="new-word" className="sr-only">
            คำศัพท์
          </label>
          <input
            id="new-word"
            lang="en"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="rescind"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            maxLength={80}
            required
            disabled={busy}
          />
          {mode === "demo" && (
            <p className="input-hint">คำตัวอย่าง: rescind, serene, thrive</p>
          )}
          {saveError && (
            <div role="alert" className="error">
              {saveError}
            </div>
          )}
          <button className="primary" disabled={busy || !word.trim()}>
            {busy ? "กำลังสร้าง…" : "บันทึก"}
            {!busy && <Icon name="arrow" />}
          </button>
        </form>
      </dialog>
    </>
  );
}
