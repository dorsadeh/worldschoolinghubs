// test/season.test.ts
import { describe, it, expect } from "vitest";
import { parseMonths } from "../lib/season";

describe("parseMonths", () => {
  it("expands a simple wrapping range", () => {
    expect(parseMonths("Best Dec-Apr")).toEqual([1, 2, 3, 4, 12]);
  });
  it("handles en-dash and a qualifier word", () => {
    expect(parseMonths("Nov–early Feb")).toEqual([1, 2, 11, 12]);
  });
  it("treats a dated range as month span", () => {
    expect(parseMonths("May 31 – July 12 2026 (three 2-week sessions)")).toEqual([5, 6, 7]);
  });
  it("returns all months for year-round", () => {
    expect(parseMonths("Year-round")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(parseMonths("Year round")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("returns empty (flexible) when no months are present", () => {
    expect(parseMonths("")).toEqual([]);
    expect(parseMonths("Short or long term; ski season")).toEqual([]);
  });
  it("expands Nov–Mar", () => {
    expect(parseMonths("Nov–Mar")).toEqual([1, 2, 3, 11, 12]);
  });
});
