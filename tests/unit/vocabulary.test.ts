import { describe, it, expect } from "vitest";
import {
  DEFAULT_VOCABULARY,
  VOCABULARY_KEYS,
  resolveVocabulary,
  term,
  competitionTypeLabel,
  defaultMarketQuestion,
} from "@/lib/vocabulary";

describe("resolveVocabulary", () => {
  it("returns the English defaults when there are no overrides", () => {
    expect(resolveVocabulary({})).toEqual(DEFAULT_VOCABULARY);
    expect(resolveVocabulary(null)).toEqual(DEFAULT_VOCABULARY);
    expect(resolveVocabulary(undefined)).toEqual(DEFAULT_VOCABULARY);
    expect(resolveVocabulary("not an object")).toEqual(DEFAULT_VOCABULARY);
  });

  it("is total — every key is always present after resolution", () => {
    const v = resolveVocabulary({ competitor: { singular: "Marble" } });
    for (const key of VOCABULARY_KEYS) {
      expect(v[key].singular.length).toBeGreaterThan(0);
      expect(v[key].plural.length).toBeGreaterThan(0);
    }
  });

  it("applies a full override", () => {
    const v = resolveVocabulary({ competitor: { singular: "Marble", plural: "Marbles" } });
    expect(v.competitor).toEqual({ singular: "Marble", plural: "Marbles" });
    // untouched keys keep defaults
    expect(v.event).toEqual(DEFAULT_VOCABULARY.event);
  });

  it("derives a naive plural when only the singular is given", () => {
    const v = resolveVocabulary({ event: { singular: "Race" } });
    expect(v.event).toEqual({ singular: "Race", plural: "Races" });
  });

  it("keeps the default singular but overrides the plural when only plural is given", () => {
    const v = resolveVocabulary({ competitor: { plural: "People" } });
    expect(v.competitor).toEqual({ singular: "Competitor", plural: "People" });
  });

  it("ignores unknown keys", () => {
    const v = resolveVocabulary({ wizard: { singular: "Wizard" }, competitor: { singular: "Chef" } });
    expect(v).not.toHaveProperty("wizard");
    expect(v.competitor.singular).toBe("Chef");
  });

  it("ignores empty, whitespace, and oversized labels", () => {
    const v = resolveVocabulary({
      competitor: { singular: "   " },
      event: { singular: "" },
      market: { singular: "x".repeat(61) },
    });
    expect(v.competitor).toEqual(DEFAULT_VOCABULARY.competitor);
    expect(v.event).toEqual(DEFAULT_VOCABULARY.event);
    expect(v.market).toEqual(DEFAULT_VOCABULARY.market);
  });

  it("trims surrounding whitespace on accepted labels", () => {
    const v = resolveVocabulary({ competitor: { singular: "  Chef  ", plural: "  Chefs  " } });
    expect(v.competitor).toEqual({ singular: "Chef", plural: "Chefs" });
  });
});

describe("term", () => {
  const vocab = resolveVocabulary({ competitor: { singular: "Marble", plural: "Marbles" } });

  it("defaults to the singular, as stored", () => {
    expect(term(vocab, "competitor")).toBe("Marble");
  });

  it("returns the plural when asked", () => {
    expect(term(vocab, "competitor", { plural: true })).toBe("Marbles");
  });

  it("supports lower and sentence casing", () => {
    expect(term(vocab, "competitor", { case: "lower" })).toBe("marble");
    expect(term(vocab, "competitor", { plural: true, case: "lower" })).toBe("marbles");
    expect(term(resolveVocabulary({ event: { singular: "GRAND PRIX" } }), "event", { case: "sentence" })).toBe(
      "Grand prix",
    );
  });
});

describe("defaultMarketQuestion (F-21)", () => {
  it("derives the default question from the tenant's competitor vocabulary", () => {
    expect(defaultMarketQuestion(resolveVocabulary({ competitor: { singular: "Chef" } }), "en")).toBe("Which chef will win?");
    expect(defaultMarketQuestion(resolveVocabulary({ competitor: { singular: "Marble" } }), "en")).toBe("Which marble will win?");
  });

  it("produces different defaults for different vocabularies (no code change)", () => {
    const a = defaultMarketQuestion(resolveVocabulary({ competitor: { singular: "Racer" } }), "en");
    const b = defaultMarketQuestion(resolveVocabulary({ competitor: { singular: "Nominee" } }), "en");
    expect(a).not.toBe(b);
  });

  it("uses the English default vocabulary when unconfigured", () => {
    expect(defaultMarketQuestion(DEFAULT_VOCABULARY, "en")).toBe("Which competitor will win?");
  });

  it("falls back to English for an unauthored locale (no fabricated translations)", () => {
    // Locale not in the template catalog → English template, still vocabulary-driven.
    expect(defaultMarketQuestion(resolveVocabulary({ competitor: { singular: "Chef" } }), "es")).toBe("Which chef will win?");
    expect(defaultMarketQuestion(DEFAULT_VOCABULARY, null)).toBe("Which competitor will win?");
  });
});

describe("competitionTypeLabel", () => {
  it("maps generic competition types through the vocabulary", () => {
    const vocab = resolveVocabulary({ season: { singular: "Championship" }, event: { singular: "Race" } });
    expect(competitionTypeLabel(vocab, "STANDALONE_EVENT")).toBe("Race");
    expect(competitionTypeLabel(vocab, "SEASON")).toBe("Championship");
    expect(competitionTypeLabel(vocab, "TOURNAMENT")).toBe("Tournament");
    expect(competitionTypeLabel(vocab, "BRACKET")).toBe("Bracket");
  });

  it("passes through an unknown type unchanged", () => {
    expect(competitionTypeLabel(DEFAULT_VOCABULARY, "MYSTERY")).toBe("MYSTERY");
  });
});
