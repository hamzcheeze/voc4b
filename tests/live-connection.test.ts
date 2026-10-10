// @vitest-environment node
// Opt-in: uses real configured services. Never writes vocabulary or prints credentials.
import { it, expect, vi, afterEach } from "vitest";
afterEach(() => vi.unstubAllEnvs());
import nextEnv from "@next/env";
import { CambridgeDictionary } from "../src/adapters/dictionary";
import { dictionaryEntrySchema } from "../src/domain/vocabulary";
it.skipIf(process.env.RUN_LIVE_CHECK !== "1")(
  "configured dictionary returns validated ought data without saving",
  async () => {
    vi.stubEnv("NODE_ENV", "development");
    nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    const result = await new CambridgeDictionary().lookup("ought");
    expect(dictionaryEntrySchema.safeParse(result).success).toBe(true);
    expect(result.headword.toLowerCase()).toMatch(/^ought(?: to)?$/);
    expect(result.definitions.length).toBeGreaterThan(0);
  },
  40000,
);
