"use client";
import React, { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useWorkspace } from "./workspace";
import { HistoryWordCard } from "./words";
import { demoStore } from "../adapters/demo";
import {
  HISTORY_PAGE_SIZE,
  historyQuerySchema,
  type HistoryQuery,
} from "../application/history-query";
import { filterHistory, vocabularySchema } from "../domain/vocabulary";
const historyPageSchema = z.object({
  entries: z.array(vocabularySchema),
  total: z.number().int().nonnegative(),
});
type HistoryPage = z.infer<typeof historyPageSchema>;
type PageState =
  | { kind: "loaded"; key: string; data: HistoryPage }
  | { kind: "error"; key: string; message: string };
function historyUrl(query: HistoryQuery): string {
  return `/api/history?${new URLSearchParams({
    page: String(query.page),
    search: query.search,
  })}`;
}
export default function HistoryView() {
  const { mode, historyPages, historyVersion } = useWorkspace();
  const [searchInput, setSearchInput] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [state, setState] = useState<PageState | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  const parsed = useMemo(
    () => historyQuerySchema.safeParse({ page, search }),
    [page, search],
  );
  const query = parsed.success ? parsed.data : null;
  const queryKey = query ? JSON.stringify(query) : "";
  const stateKey = `${historyVersion}:${reload}:${queryKey}`;
  useEffect(() => {
    if (!query) return;
    let active = true;
    const load = (target: HistoryQuery): Promise<HistoryPage> => {
      const key = JSON.stringify(target);
      const cached = historyPages.get(key);
      if (cached) {
        historyPages.delete(key);
        historyPages.set(key, cached);
        return cached;
      }
      const request = fetch(historyUrl(target), { cache: "no-store" }).then(
        async (response) => {
          const body: unknown = await response.json();
          if (!response.ok) {
            const failure = z.object({ error: z.string() }).safeParse(body);
            throw new Error(
              failure.success
                ? failure.data.error
                : "Couldn't load your history.",
            );
          }
          return historyPageSchema.parse(body);
        },
      );
      if (historyPages.size >= 12) {
        const oldest = historyPages.keys().next().value;
        if (oldest !== undefined) historyPages.delete(oldest);
      }
      historyPages.set(key, request);
      void request.catch(() => {
        if (historyPages.get(key) === request) historyPages.delete(key);
      });
      return request;
    };
    if (mode === "demo") {
      queueMicrotask(() => {
        if (!active) return;
        try {
          const rows = filterHistory(demoStore.list(), {
            order: "desc",
          }).filter((entry) =>
            entry.word
              .toLocaleLowerCase()
              .includes(query.search.toLocaleLowerCase()),
          );
          const offset = (query.page - 1) * HISTORY_PAGE_SIZE;
          setState({
            kind: "loaded",
            key: stateKey,
            data: {
              entries: rows.slice(offset, offset + HISTORY_PAGE_SIZE),
              total: rows.length,
            },
          });
        } catch (error) {
          setState({
            kind: "error",
            key: stateKey,
            message:
              error instanceof Error
                ? error.message
                : "Couldn't load your history.",
          });
        }
      });
    } else {
      void load(query).then(
        (data) => {
          if (!active) return;
          setState({ kind: "loaded", key: stateKey, data });
          if (query.page * HISTORY_PAGE_SIZE < data.total)
            void load({ ...query, page: query.page + 1 }).catch(() => {});
        },
        (error: unknown) => {
          if (active)
            setState({
              kind: "error",
              key: stateKey,
              message:
                error instanceof Error
                  ? error.message
                  : "Couldn't load your history.",
            });
        },
      );
    }
    return () => {
      active = false;
    };
  }, [mode, historyPages, query, stateKey]);
  const currentState = state?.key === stateKey ? state : null;
  const data =
    searchInput.trim() === search && currentState?.kind === "loaded"
      ? currentState.data
      : null;
  const entries = data?.entries ?? [];
  const pageCount = data
    ? Math.max(1, Math.ceil(data.total / HISTORY_PAGE_SIZE))
    : 1;
  return (
    <>
      <div className="page-heading history-heading">
        <h1>History</h1>
        {data && (
          <span className="history-count">
            {data.total} {data.total === 1 ? "word" : "words"}
          </span>
        )}
      </div>
      <div className="history-search">
        <label htmlFor="history-search" className="sr-only">
          Search words
        </label>
        <input
          id="history-search"
          type="search"
          autoComplete="off"
          maxLength={80}
          placeholder="Search all words"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            setPage(1);
          }}
        />
      </div>
      {!parsed.success ? (
        <p className="error" role="alert">
          Invalid history search.
        </p>
      ) : searchInput.trim() !== search || !currentState ? (
        <p className="loading" role="status">
          Loading…
        </p>
      ) : currentState.kind === "error" ? (
        <div className="error" role="alert">
          {currentState.message}
          <button
            onClick={() => {
              historyPages.delete(queryKey);
              setReload((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-history">
          <p>
            {search ? "No words found for this search" : "No words saved yet"}
          </p>
        </div>
      ) : (
        <div className="history-word-list">
          {entries.map((entry) => (
            <HistoryWordCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
      {data && pageCount > 1 && (
        <nav className="history-pagination" aria-label="History pages">
          <button
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}
