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
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-[#20140d99] p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-[480px] overflow-y-auto rounded-[22px] border-[2.5px] border-[#20140d] bg-[#fffaf3] p-5 shadow-[8px_10px_0_#20140d]"
        style={{ fontFamily: "var(--font-body)", color: "#20140d" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[22px] leading-tight" style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}>
            {context ? `Feedback · ${context.hubName}` : "Contact & feedback"}
          </h2>
          <button type="button" onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#20140d] bg-white text-[16px]">✕</button>
        </div>

        {status === "sent" ? (
          <div className="mt-5 rounded-[12px] border-2 border-[#20140d] bg-[#caffbf] px-4 py-4 text-[15px]">
            <p className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>Thanks! 🙌</p>
            <p className="mt-1">Your message is on its way. I read every one.</p>
            <button type="button" onClick={onClose}
              className="mt-3 rounded-full border-2 border-[#20140d] bg-white px-[14px] py-[5px] text-[13px] font-semibold"
              style={{ fontFamily: "var(--font-display)" }}>Close</button>
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
                className="rounded-[10px] border-2 border-[#20140d] bg-white px-3 py-2 text-[14px] font-normal">
                {TYPE_ORDER.map((t) => <option key={t} value={t}>{FEEDBACK_TYPE_LABELS[t]}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              Message
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
                placeholder={context ? `What's off about ${context.hubName}?` : "Tell me what's up…"}
                className="resize-y rounded-[10px] border-2 border-[#20140d] bg-white px-3 py-2 text-[14px] font-normal" />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                Name <span className="font-normal opacity-50">(optional)</span>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="rounded-[10px] border-2 border-[#20140d] bg-white px-3 py-2 text-[14px] font-normal" />
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                Email <span className="font-normal opacity-50">(for replies)</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                  className="rounded-[10px] border-2 border-[#20140d] bg-white px-3 py-2 text-[14px] font-normal" />
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
              className="mt-1 self-start rounded-full border-2 border-[#20140d] bg-[#ffd6a5] px-[18px] py-[7px] text-[14px] font-semibold disabled:opacity-60"
              style={{ fontFamily: "var(--font-display)" }}>
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
