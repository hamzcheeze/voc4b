import { it, expect, vi, afterEach } from "vitest";
import { GroqEnricher } from "../src/adapters/groq";
afterEach(() => vi.unstubAllGlobals());
it("rejects invalid words from provider", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify({ valid: false }) } },
            ],
          }),
        ),
      ),
  );
  await expect(new GroqEnricher("secret").enrich("zzzz")).rejects.toThrow(
    /คำ|word/i,
  );
});
it("handles 429 explicitly", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 429 })),
  );
  await expect(new GroqEnricher("secret").enrich("rescind")).rejects.toThrow(
    /429|limit|โควตา/i,
  );
});
it("rejects malformed structured output", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"valid":true}' } }],
          }),
        ),
      ),
  );
  await expect(new GroqEnricher("secret").enrich("rescind")).rejects.toThrow();
});
