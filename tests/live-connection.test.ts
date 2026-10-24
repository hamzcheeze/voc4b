// @vitest-environment node
import { it, expect } from "vitest";
import { CambridgeDictionary } from "../src/adapters/dictionary";
import { dictionaryEntrySchema } from "../src/domain/vocabulary";
it.skipIf(process.env.RUN_LIVE_CHECK !== "1")(
  "reads real Cambridge wear off data through the server provider",
  async () => {
    const result = await new CambridgeDictionary().lookup("wear off");
    expect(result.headword).toBe("wear off");
    expect(result.partsOfSpeech).toContain("phrasal verb");
    expect(result.definitions[0].pos).toBe("phrasal verb");
    expect(result.pronunciations).toEqual(
      expect.arrayContaining([
        {
          pos: "phrasal verb",
          region: "us",
          ipa: "/wer/",
          audioUrl:
            "https://dictionary.cambridge.org/us/media/english/us_pron/e/eus/eus74/eus74948.mp3",
        },
        {
          pos: "phrasal verb",
          region: "uk",
          ipa: "/weər/",
          audioUrl:
            "https://dictionary.cambridge.org/us/media/english/uk_pron/u/ukw/ukwax/ukwaxwo028.mp3",
        },
      ]),
    );
    expect(result.definitions[0].text).toBe(
      "If a feeling or the effect of something wears off, it gradually disappears:",
    );
    expect(result.definitions[0].examples).toContainEqual({
      id: "0",
      text: "Most patients find that the numbness from the injection wears off after about an hour.",
    });
  },
  40000,
);
it.skipIf(process.env.RUN_LIVE_CHECK !== "1")(
  "reads real Cambridge ought data through the Next server provider",
  async () => {
    const result = await new CambridgeDictionary().lookup("ought");
    expect(dictionaryEntrySchema.safeParse(result).success).toBe(true);
    expect(result.headword.toLowerCase()).toBe("ought");
    expect(result.definitions[0].text).toBe(
      "used to say that it is necessary or desirable to perform the action expressed in the verb:",
    );
    expect(result.definitions[0].examples).toContainEqual({
      id: "0",
      text: "We ought to clean up before we go home.",
    });
    expect(result.pronunciations).toContainEqual({
      pos: "modal verb [ + to infinitive ]",
      region: "us",
      ipa: "/ɔt/",
      audioUrl:
        "https://dictionary.cambridge.org/us/media/english/us_pron/e/eus/eus75/eus75326.mp3",
    });
  },
  40000,
);
