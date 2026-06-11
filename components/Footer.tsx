"use client";

import { useFeedback } from "./feedback/FeedbackContext";

export default function Footer() {
  const { open } = useFeedback();
  return (
    <footer className="border-t border-line bg-surface px-4 py-2.5 text-faint">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-1.5 sm:flex-row sm:justify-between">
        <p className="text-[11.5px] leading-snug">
          Prices &amp; details are community-reported estimates, not quotes — always verify with the provider.
        </p>
        <button
          type="button"
          onClick={() => open()}
          className="text-[12px] font-semibold text-muted hover:text-ink"
        >
          Contact
        </button>
      </div>
    </footer>
  );
}
