"use client";

import { useFeedback } from "./feedback/FeedbackContext";

export default function Footer() {
  const { open } = useFeedback();
  return (
    <footer
      className="border-t-[2.5px] border-[#20140d] bg-[#fff4e6] px-4 py-3"
      style={{ fontFamily: "var(--font-body)", color: "#20140d" }}
    >
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <p className="text-[12px] leading-snug opacity-70">
          Prices &amp; details are community-reported estimates, not quotes — always verify with the provider.
        </p>
        <button
          type="button"
          onClick={() => open()}
          className="rounded-full border-2 border-[#20140d] bg-white px-[13px] py-[5px] text-[12.5px] font-semibold transition-transform duration-150 hover:-translate-y-[1px]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Contact
        </button>
      </div>
    </footer>
  );
}
