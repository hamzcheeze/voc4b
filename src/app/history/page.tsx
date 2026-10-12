"use client";
import React, { useState } from "react";
import { useWorkspace } from "../../components/workspace";
import { WordCard } from "../../components/words";
import {
  dateLabel,
  filterHistory,
  type HistoryFilters,
  type Vocabulary,
} from "../../domain/vocabulary";
export default function HistoryPage() {
  const { entries, loading, error, refresh } = useWorkspace();
  const [period, setPeriod] = useState("all"),
    [value, setValue] = useState(""),
    [order, setOrder] = useState<"asc" | "desc">("desc");
  let rows: Vocabulary[] = [],
    filterError = "";
  try {
    const filters: HistoryFilters = {
      order,
      ...(value ? { [period]: value } : {}),
    };
    rows = filterHistory(entries, filters);
  } catch (e) {
    filterError = e instanceof Error ? e.message : "Invalid filter.";
  }
  const groups = new Map<string, Vocabulary[]>();
  for (const row of rows)
    groups.set(row.day, [...(groups.get(row.day) || []), row]);
  return (
    <>
      <div className="page-heading history-heading">
        <h1>Word library</h1>
        <span className="history-count">
          {entries.length} {entries.length === 1 ? "word" : "words"}
        </span>
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
              setPeriod(e.target.value);
              setValue("");
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
              onChange={(e) => setValue(e.target.value)}
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
            onChange={(e) => setOrder(e.target.value as "asc" | "desc")}
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
            }}
          >
            Clear filters
          </button>
        )}
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
      ) : filterError ? (
        <p className="error" role="alert">
          {filterError}
        </p>
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
              <WordCard key={entry.id} entry={entry} headingLevel={3} />
            ))}
          </section>
        ))
      )}
    </>
  );
}
