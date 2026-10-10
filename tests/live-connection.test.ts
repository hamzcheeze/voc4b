// @vitest-environment node
// Opt-in: uses real configured services. Never writes vocabulary or prints credentials.
import { it, expect, vi, afterEach } from "vitest";
afterEach(() => vi.unstubAllEnvs());
import nextEnv from "@next/env";
import { GroqEnricher } from "../src/adapters/groq";
import { enrichmentSchema } from "../src/domain/vocabulary";
it.skipIf(process.env.RUN_LIVE_CHECK !== "1")(
  "configured Groq creates a real validated vocabulary entry",
  async () => {
    vi.stubEnv("NODE_ENV", "development");
    nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    expect(Boolean(process.env.GROQ_API_KEY)).toBe(true);
    const result = await new GroqEnricher(
      process.env.GROQ_API_KEY!,
      process.env.GROQ_MODEL || "openai/gpt-oss-20b",
    ).enrich("rescind");
    expect(enrichmentSchema.safeParse({ valid: true, ...result }).success).toBe(
      true,
    );
    console.log(
      JSON.stringify({
        check: "real-groq-enrichment",
        word: "rescind",
        ...result,
      }),
    );
  },
  40000,
);
