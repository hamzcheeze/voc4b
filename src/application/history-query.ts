import { z } from "zod";

export const HISTORY_PAGE_SIZE = 100;

export const historyQuerySchema = z.object({
  page: z.coerce.number<number>().int().min(1).max(100000),
  search: z.string().trim().max(80),
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;
