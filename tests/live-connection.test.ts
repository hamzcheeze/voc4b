// @vitest-environment node
import { it, expect } from "vitest";
import { CambridgeDictionary } from "../src/adapters/dictionary";
import { dictionaryEntrySchema } from "../src/domain/vocabulary";
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
