import "server-only";
import { load } from "cheerio";
import type { DictionaryProvider } from "../application/add-word";
import {
  dictionaryEntrySchema,
  matchesHeadword,
  validateDictionaryTerm,
  type DictionaryEntry,
} from "../domain/vocabulary";

const CAMBRIDGE_ORIGIN = "https://dictionary.cambridge.org";
const WIKTIONARY_ORIGIN = "https://simple.wiktionary.org";
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const CACHE_TTL = 30 * 60 * 1000;
const CACHE_LIMIT = 1000;
const LOOKUP_LIMIT = 32;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const UNAVAILABLE = "The dictionary is unavailable. This word wasn't saved.";
const CONNECTION_FAILED =
  "Couldn't reach the dictionary. Please try again later.";
const INVALID_DATA =
  "The dictionary returned invalid or incomplete data. This word wasn't saved.";
const WRONG_HEADWORD =
  "The dictionary returned a different word. Check the spelling.";

type VerbForms = DictionaryEntry["verbForms"];

class DictionaryFetchError extends Error {}

async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DictionaryFetchError(CONNECTION_FAILED));
    }, 10000);
  });
  const request = async () => {
    let current = url;
    for (let redirects = 0; ; redirects++) {
      const response = await fetch(current, {
        headers: { Accept: "text/html", "User-Agent": USER_AGENT },
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirects >= 5)
          throw new DictionaryFetchError(UNAVAILABLE);
        const next = new URL(location, current);
        if (
          next.origin !== url.origin ||
          next.protocol !== "https:" ||
          next.username ||
          next.password
        )
          throw new DictionaryFetchError(UNAVAILABLE);
        current = next;
        continue;
      }
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new DictionaryFetchError(
          response.status === 404
            ? "Word not found. Check the spelling."
            : UNAVAILABLE,
        );
      }
      if (
        Number(response.headers.get("content-length")) > MAX_HTML_BYTES ||
        !response.body
      ) {
        await response.body?.cancel();
        throw new DictionaryFetchError(INVALID_DATA);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_HTML_BYTES) {
            await reader.cancel();
            throw new DictionaryFetchError(INVALID_DATA);
          }
          chunks.push(decoder.decode(chunk.value, { stream: true }));
        }
        chunks.push(decoder.decode());
        return chunks.join("");
      } finally {
        reader.releaseLock();
      }
    }
  };
  try {
    return await Promise.race([request(), timeout]);
  } catch (error) {
    if (error instanceof DictionaryFetchError) throw error;
    throw new DictionaryFetchError(CONNECTION_FAILED);
  } finally {
    clearTimeout(timer);
  }
}

function parseVerbForms(html: string): VerbForms {
  const $ = load(html);
  const forms: VerbForms = [];
  $(".inflection-table tr td").each((_, cell) => {
    const cellElement = $(cell);
    if (!cellElement.text().trim()) return;
    const pElement = cellElement.find("p");
    if (!pElement.length) return;
    const parts = pElement
      .text()
      .trim()
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const [type, text] = parts;
      if (type && text) forms.push({ id: String(forms.length), type, text });
      return;
    }
    const htmlContent = pElement.html();
    if (!htmlContent?.includes("<br>")) return;
    const [typePart, textPart] = htmlContent.split("<br>");
    if (typePart === undefined || textPart === undefined) return;
    const type =
      $(typePart).text().trim() || typePart.replace(/<[^>]*>/g, "").trim();
    const text =
      $(textPart).text().trim() || textPart.replace(/<[^>]*>/g, "").trim();
    if (type && text) forms.push({ id: String(forms.length), type, text });
  });
  const result = dictionaryEntrySchema.shape.verbForms.safeParse(forms);
  return result.success ? result.data : [];
}

function parseCambridgeHtml(args: {
  html: string;
  word: string;
  verbForms: VerbForms;
}): DictionaryEntry {
  const $ = load(args.html);
  const headword = $(".hw.dhw, .headword.dhw").first().text();
  if (!headword) throw new Error(INVALID_DATA);
  if (!matchesHeadword(args.word, headword)) throw new Error(WRONG_HEADWORD);
  const partsOfSpeech = [
    ...new Set(
      $(".pos.dpos")
        .map((_, element) => $(element).text())
        .get(),
    ),
  ];
  const pronunciations: Array<
    Omit<DictionaryEntry["pronunciations"][number], "region"> & {
      region: string;
    }
  > = [];
  $(".pos-header.dpos-h").each((_, header) => {
    const posNode = $(header).find(".dpos-g").first();
    if (!posNode.length) return;
    const pos = posNode.text();
    $(header)
      .find(".dpron-i")
      .each((_, node) => {
        const pronunciation = $(node);
        const region = pronunciation.find(".region.dreg").text();
        const audioSrc = pronunciation.find("audio source").attr("src");
        const ipa = pronunciation.find(".pron.dpron").text();
        if (audioSrc && ipa) {
          if (!URL.canParse(audioSrc, CAMBRIDGE_ORIGIN))
            throw new Error(INVALID_DATA);
          pronunciations.push({
            pos,
            region: region.trim().toLowerCase(),
            ipa,
            audioUrl: new URL(audioSrc, CAMBRIDGE_ORIGIN).href,
          });
        }
      });
  });
  const definitions = $(".def-block.ddef_block")
    .map((index, element) => {
      const definition = $(element);
      return {
        id: String(index),
        pos: definition
          .closest(".pr.entry-body__el, .idiom-block")
          .find(".pos.dpos")
          .first()
          .text(),
        source: definition.closest(".pr.dictionary").attr("data-id") ?? "",
        text: definition.find(".def.ddef_d.db").text(),
        examples: definition
          .find(".def-body.ddef_b > .examp.dexamp")
          .map((index, example) => ({
            id: String(index),
            text:
              $(example).find(".eg.deg").text() ||
              $(example).find(".lu.dlu").text(),
          }))
          .get(),
      };
    })
    .get()
    .filter((definition) => definition.text.trim().length > 0);
  const result = dictionaryEntrySchema.safeParse({
    headword,
    partsOfSpeech,
    pronunciations,
    definitions,
    verbForms: args.verbForms,
  });
  if (!result.success) throw new Error(INVALID_DATA);
  return result.data;
}

export class CambridgeDictionary implements DictionaryProvider {
  private readonly cache = new Map<
    string,
    { entry: DictionaryEntry; expiresAt: number }
  >();

  private readonly inFlight = new Map<string, Promise<DictionaryEntry>>();

  async lookup(input: string): Promise<DictionaryEntry> {
    const word = validateDictionaryTerm(input).toLowerCase();
    const cached = this.cache.get(word);
    if (cached && cached.expiresAt > Date.now()) return cached.entry;
    this.cache.delete(word);
    const pending = this.inFlight.get(word);
    if (pending) return pending;
    if (this.inFlight.size >= LOOKUP_LIMIT)
      throw new Error("The dictionary is busy. Please try again.");
    const request = this.fetchEntry(word);
    this.inFlight.set(word, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(word);
    }
  }

  private async fetchEntry(word: string): Promise<DictionaryEntry> {
    const [html, verbForms] = await Promise.all([
      fetchHtml(
        new URL(
          `/us/dictionary/english/${encodeURIComponent(word.replace(/ /g, "-"))}`,
          CAMBRIDGE_ORIGIN,
        ),
      ),
      fetchHtml(new URL(`/wiki/${encodeURIComponent(word)}`, WIKTIONARY_ORIGIN))
        .then(parseVerbForms)
        .catch((): VerbForms => []),
    ]);
    const entry = parseCambridgeHtml({ html, word, verbForms });
    const now = Date.now();
    for (const [key, value] of this.cache) {
      if (value.expiresAt <= now) this.cache.delete(key);
    }
    this.cache.delete(word);
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(word, { entry, expiresAt: now + CACHE_TTL });
    return entry;
  }
}
