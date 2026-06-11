export type FeedbackType = "outdated" | "suggest" | "contribute" | "hello";

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  outdated: "Outdated info",
  suggest: "Suggest a hub",
  contribute: "Want to contribute",
  hello: "Just saying hi",
};

export interface FeedbackInput {
  type: FeedbackType;
  message: string;
  /** Optional, for replies only. */
  name?: string;
  email?: string;
  /** Set when opened from a specific hub. */
  hubId?: string;
  hubName?: string;
  /** Honeypot passthrough — see buildFeedbackBody. */
  gotcha?: string;
}

/** Returns a human-readable error string, or null when the input is valid. */
export function validateFeedback(input: FeedbackInput): string | null {
  if (!input.message || input.message.trim() === "") {
    return "Please enter a message.";
  }
  if (input.email && input.email.trim() !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
    return "Please enter a valid email, or leave it blank.";
  }
  return null;
}

/** Flattens a validated FeedbackInput into the string map Formspree expects.
 *  Empty optional fields are omitted so they don't show as blank rows in the
 *  Formspree dashboard / notification email. */
export function buildFeedbackBody(input: FeedbackInput): Record<string, string> {
  const label = FEEDBACK_TYPE_LABELS[input.type];
  const body: Record<string, string> = {
    type: label,
    message: input.message.trim(),
    _subject: `[Worldschool Atlas] ${label}${input.hubName ? ` — ${input.hubName}` : ""}`,
  };
  if (input.name && input.name.trim()) body.name = input.name.trim();
  if (input.email && input.email.trim()) body.email = input.email.trim();
  if (input.hubName) body.hub = input.hubName;
  if (input.hubId) body.hubId = input.hubId;
  if (input.gotcha && input.gotcha.trim()) body._gotcha = input.gotcha;
  return body;
}

export function formspreeEndpoint(id: string): string {
  return `https://formspree.io/f/${id}`;
}
