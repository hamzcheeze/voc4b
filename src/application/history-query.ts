import { z } from "zod";

export const HISTORY_PAGE_SIZE = 40;

export const historyQuerySchema = z
  .object({
    page: z.coerce.number<number>().int().min(1).max(100000),
    period: z.enum(["all", "date", "month", "year"]),
    value: z.string().max(10),
    order: z.enum(["asc", "desc"]),
  })
  .refine(({ period, value }) => {
    if (period === "all") return value === "";
    if (value === "") return true;
    if (Number(value.slice(0, 4)) < 1) return false;
    if (period === "year") return /^\d{4}$/.test(value);
    if (period === "month") return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Invalid history filter.");

export type HistoryQuery = z.infer<typeof historyQuerySchema>;
