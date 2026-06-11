import { describe, it, expect } from "vitest";
import { validateFeedback, buildFeedbackBody, formspreeEndpoint, type FeedbackInput } from "../lib/feedback";

function input(overrides: Partial<FeedbackInput> = {}): FeedbackInput {
  return { type: "hello", message: "Hi there", ...overrides };
}

describe("validateFeedback", () => {
  it("returns null for a valid message", () => {
    expect(validateFeedback(input())).toBeNull();
  });
  it("rejects an empty or whitespace-only message", () => {
    expect(validateFeedback(input({ message: "" }))).toBe("Please enter a message.");
    expect(validateFeedback(input({ message: "   " }))).toBe("Please enter a message.");
  });
  it("accepts a blank email (optional field)", () => {
    expect(validateFeedback(input({ email: "" }))).toBeNull();
    expect(validateFeedback(input({ email: undefined }))).toBeNull();
  });
  it("rejects a malformed email when one is provided", () => {
    expect(validateFeedback(input({ email: "nope" }))).toBe("Please enter a valid email, or leave it blank.");
  });
  it("accepts a well-formed email", () => {
    expect(validateFeedback(input({ email: "a@b.co" }))).toBeNull();
  });
});

describe("buildFeedbackBody", () => {
  it("maps core fields and a subject for a plain contact message", () => {
    const body = buildFeedbackBody({ type: "hello", message: "Love the site", name: "Dana", email: "d@e.co" });
    expect(body).toEqual({
      type: "Just saying hi",
      message: "Love the site",
      name: "Dana",
      email: "d@e.co",
      _subject: "[Worldschool Atlas] Just saying hi",
    });
  });
  it("includes hub context and folds it into the subject", () => {
    const body = buildFeedbackBody({ type: "price", message: "It's $900 now", hubId: "bansko-summer", hubName: "Bansko" });
    expect(body.hub).toBe("Bansko");
    expect(body.hubId).toBe("bansko-summer");
    expect(body._subject).toBe("[Worldschool Atlas] Wrong price — Bansko");
  });
  it("omits empty optional fields (no blank name/email/hub keys)", () => {
    const body = buildFeedbackBody({ type: "hello", message: "Hi" });
    expect(body).not.toHaveProperty("name");
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("hub");
  });
  it("passes a filled honeypot through as _gotcha and omits it when empty", () => {
    expect(buildFeedbackBody({ type: "hello", message: "Hi", gotcha: "bot" })._gotcha).toBe("bot");
    expect(buildFeedbackBody({ type: "hello", message: "Hi", gotcha: "" })).not.toHaveProperty("_gotcha");
  });
});

describe("formspreeEndpoint", () => {
  it("builds the form URL from an id", () => {
    expect(formspreeEndpoint("abcdwxyz")).toBe("https://formspree.io/f/abcdwxyz");
  });
});
