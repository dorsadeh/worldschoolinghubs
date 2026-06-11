"use client";

import { useState } from "react";
import {
  FEEDBACK_TYPE_LABELS, buildFeedbackBody, formspreeEndpoint, validateFeedback,
  type FeedbackType, type FeedbackInput,
} from "@/lib/feedback";
import type { FeedbackOpenContext } from "./FeedbackContext";

const FORMSPREE_ID = process.env.NEXT_PUBLIC_FORMSPREE_ID;
const TYPE_ORDER: FeedbackType[] = ["outdated", "suggest", "contribute", "hello"];

export default function FeedbackModal({ context, onClose }: {
  context: FeedbackOpenContext | null;
  onClose: () => void;
}) {
  const [type, setType] = useState<FeedbackType>(context?.type ?? (context ? "outdated" : "hello"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [gotcha, setGotcha] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const configured = Boolean(FORMSPREE_ID);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: FeedbackInput = {
      type, message, name, email, gotcha,
      hubId: context?.hubId, hubName: context?.hubName,
    };
    const validationError = validateFeedback(input);
    if (validationError) { setError(validationError); return; }
    setError(null);
    setStatus("sending");
    try {
      const res = await fetch(formspreeEndpoint(FORMSPREE_ID as string), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildFeedbackBody(input)),
      });
      if (!res.ok) throw new Error(`Formspree responded ${res.status}`);
      setStatus("sent");
    } catch {
      setStatus("error");
      setError("Something went wrong sending your message. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-ink/55 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-[480px] overflow-y-auto rounded-2xl bg-surface p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[19px] font-bold leading-tight tracking-[-0.01em]">
            {context ? `Feedback · ${context.hubName}` : "Contact & feedback"}
          </h2>
          <button type="button" onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[15px]">✕</button>
        </div>

        {status === "sent" ? (
          <div className="mt-5 rounded-xl bg-accent-soft px-4 py-4 text-[14px]">
            <p className="font-semibold">Thanks!</p>
            <p className="mt-1">Your message is on its way. I read every one.</p>
            <button type="button" onClick={onClose}
              className="mt-3 rounded-lg border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold">Close</button>
          </div>
        ) : !configured ? (
          <p className="mt-5 text-[14px] leading-relaxed opacity-80">
            The feedback form isn&apos;t set up yet — please check back soon.
          </p>
        ) : (
          <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              What&apos;s this about?
              <select value={type} onChange={(e) => setType(e.target.value as FeedbackType)}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-normal outline-none focus:border-faint">
                {TYPE_ORDER.map((t) => <option key={t} value={t}>{FEEDBACK_TYPE_LABELS[t]}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              Message
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
                placeholder={context ? `What's off about ${context.hubName}?` : "Tell me what's up…"}
                className="resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-normal outline-none focus:border-faint" />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                Name <span className="font-normal opacity-50">(optional)</span>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-normal outline-none focus:border-faint" />
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                Email <span className="font-normal opacity-50">(for replies)</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-normal outline-none focus:border-faint" />
              </label>
            </div>

            {/* Honeypot — visually hidden; real users leave it blank, bots fill it. */}
            <input
              type="text" tabIndex={-1} autoComplete="off" value={gotcha}
              onChange={(e) => setGotcha(e.target.value)}
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            />

            {error && <p className="text-[13px] font-semibold text-[#b00020]">{error}</p>}

            <button type="submit" disabled={status === "sending"}
              className="mt-1 self-start rounded-lg bg-accent px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60">
              {status === "sending" ? "Sending…" : "Send"}
            </button>

            <p className="mt-1 text-[11px] leading-snug opacity-50">
              No account needed. Email is optional and only used to reply.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
