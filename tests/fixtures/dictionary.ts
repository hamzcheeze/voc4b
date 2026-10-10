import type { DictionaryEntry, Vocabulary } from "../../src/domain/vocabulary";
export const wireEntry = {
  word: "ought to",
  pos: ["modal verb"],
  pronunciation: [
    {
      pos: "modal verb",
      lang: "uk",
      pron: "/ɔːt/",
      url: "https://dictionary.cambridge.org/media/english/uk_pron/ought.mp3",
    },
    {
      pos: "modal verb",
      lang: "us",
      pron: "/ɔt/",
      url: "https://dictionary.cambridge.org/media/english/us_pron/ought.mp3",
    },
  ],
  definition: [
    {
      id: 0,
      pos: "modal verb",
      source: "english",
      text: "Used to say what is necessary or right.",
      translation: "ignored translation",
      example: [
        {
          id: 0,
          text: "You ought to apologize.",
          translation: "ignored translation",
        },
        {
          id: 1,
          text: "We ought to leave now.",
          translation: "ignored translation",
        },
      ],
    },
    {
      id: 1,
      pos: "modal verb",
      source: "american",
      text: "Used to say what is likely to happen.",
      translation: "",
      example: [{ id: 0, text: "They ought to arrive soon.", translation: "" }],
    },
  ],
  verbs: [{ id: 0, type: "past", text: "ought" }],
};
export const dictionaryEntry: DictionaryEntry = {
  headword: "ought to",
  partsOfSpeech: ["modal verb"],
  pronunciations: [
    {
      pos: "modal verb",
      region: "uk",
      ipa: "/ɔːt/",
      audioUrl:
        "https://dictionary.cambridge.org/media/english/uk_pron/ought.mp3",
    },
    {
      pos: "modal verb",
      region: "us",
      ipa: "/ɔt/",
      audioUrl:
        "https://dictionary.cambridge.org/media/english/us_pron/ought.mp3",
    },
  ],
  definitions: [
    {
      id: "0",
      pos: "modal verb",
      source: "english",
      text: "Used to say what is necessary or right.",
      examples: [
        { id: "0", text: "You ought to apologize." },
        { id: "1", text: "We ought to leave now." },
      ],
    },
    {
      id: "1",
      pos: "modal verb",
      source: "american",
      text: "Used to say what is likely to happen.",
      examples: [{ id: "0", text: "They ought to arrive soon." }],
    },
  ],
  verbForms: [{ id: "0", type: "past", text: "ought" }],
};
export const vocabulary: Vocabulary = {
  id: "1",
  word: "ought",
  day: "2026-10-10",
  content: { kind: "dictionary", entry: dictionaryEntry },
};
