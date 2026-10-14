"use client";
import React, { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useWorkspace } from "./workspace";
import { FlippableWordCard } from "./words";
import { demoStore } from "../adapters/demo";
import {
  HISTORY_PAGE_SIZE,
  historyQuerySchema,
  type HistoryQuery,
} from "../application/history-query";
import {
  dateLabel,
  filterHistory,
  vocabularySchema,
  type Vocabulary,
} from "../domain/vocabulary";
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
    period: query.period,
    value: query.value,
    order: query.order,
  })}`;
}
export default function HistoryView() {
  const { mode, historyPages, historyVersion } = useWorkspace();
  const [period, setPeriod] = useState<HistoryQuery["period"]>("all"),
    [value, setValue] = useState(""),
    [order, setOrder] = useState<HistoryQuery["order"]>("desc"),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [state, setState] = useState<PageState | null>(null);
  const parsed = useMemo(
    () => historyQuerySchema.safeParse({ page, period, value, order }),
    [page, period, value, order],
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
          const filters = {
            order: query.order,
            ...(query.value ? { [query.period]: query.value } : {}),
          };
          const rows = filterHistory(demoStore.list(), filters);
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
  const data = currentState?.kind === "loaded" ? currentState.data : null;
  const groups = new Map<string, Vocabulary[]>();
  for (const row of data?.entries ?? [])
    groups.set(row.day, [...(groups.get(row.day) || []), row]);
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
      <div className="filters">
        <div>
          <label htmlFor="period" className="sr-only">
            Time period
          </label>
          <select
            id="period"
            value={period}
            onChange={(e) => {
              const selected = e.target.value;
              if (
                selected === "all" ||
                selected === "date" ||
                selected === "month" ||
                selected === "year"
              )
                setPeriod(selected);
              setValue("");
              setPage(1);
            }}
          >
            <option value="all">All time</option>
            <option value="date">Choose a date</option>
            <option value="month">Choose a month</option>
            <option value="year">Choose a year</option>
          </select>
        </div>
        {period !== "all" && (
          <div>
            <label htmlFor="period-value">
              {period === "date"
                ? "Date"
                : period === "month"
                  ? "Month / year"
                  : "Year"}
            </label>
            <input
              id="period-value"
              type={
                period === "date"
                  ? "date"
                  : period === "month"
                    ? "month"
                    : "number"
              }
              min={period === "year" ? "1900" : undefined}
              max={period === "year" ? "9999" : undefined}
              placeholder={period === "year" ? "2026" : undefined}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setPage(1);
              }}
            />
          </div>
        )}
        <div className="sort-filter">
          <label htmlFor="order" className="sr-only">
            Sort order
          </label>
          <select
            id="order"
            value={order}
            onChange={(e) => {
              setOrder(e.target.value === "asc" ? "asc" : "desc");
              setPage(1);
            }}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
        {period !== "all" && (
          <button
            className="text-button clear-filter"
            onClick={() => {
              setPeriod("all");
              setValue("");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {!parsed.success ? (
        <p className="error" role="alert">
          Invalid history filter.
        </p>
      ) : !currentState ? (
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
      ) : groups.size === 0 ? (
        <div className="empty-history">
          <p>No words found for this period</p>
        </div>
      ) : (
        Array.from(groups).map(([day, words]) => (
          <section className="history-day" key={day}>
            <div className="history-day-heading">
              <h2>{dateLabel(day)}</h2>
              <span>
                {words.length} {words.length === 1 ? "word" : "words"}
              </span>
            </div>
            {words.map((entry) => (
              <FlippableWordCard
                key={entry.id}
                entry={entry}
                headingLevel={3}
              />
            ))}
          </section>
        ))
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
