# Contact / Feedback Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a site-wide footer with a "Contact" entry point and a "Contribute on GitHub" link, a pseudonymous feedback/contact modal that POSTs to Formspree (with optional hub context pre-fill), and a light price disclaimer.

**Architecture:** A client `FeedbackProvider` (React context) wraps the app in `app/layout.tsx`, holds the modal's open state + optional hub context, and renders `FeedbackModal`. Both the site-wide `Footer` ("Contact" button) and the existing `HubModal` ("⚑ Flag an error") open the modal via a `useFeedback()` hook. All payload/validation logic lives in pure, unit-tested helpers in `lib/feedback.ts`; the modal submits via `fetch` to a Formspree endpoint configured by `NEXT_PUBLIC_FORMSPREE_ID`.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Vitest (pure-function tests, node env) · Formspree (no-backend form endpoint).

---

## File Structure

**Create:**
- `lib/feedback.ts` — pure logic: `FeedbackType`, `FeedbackInput`, `FEEDBACK_TYPE_LABELS`, `validateFeedback()`, `buildFeedbackBody()`, `formspreeEndpoint()`. Fully unit-tested.
- `test/feedback.test.ts` — vitest tests for the above.
- `components/feedback/FeedbackContext.tsx` — `"use client"` context provider + `useFeedback()` hook; owns open state + hub context; renders `FeedbackModal`.
- `components/feedback/FeedbackModal.tsx` — `"use client"` modal UI + submit; uses `lib/feedback.ts`.
- `components/Footer.tsx` — `"use client"` site-wide footer (disclaimer line, Contact button, GitHub link).
- `.env.local.example` — documents `NEXT_PUBLIC_FORMSPREE_ID`.

**Modify:**
- `app/layout.tsx` — wrap `{children}` + `<Footer />` in `<FeedbackProvider>`.
- `components/directory/HubModal.tsx` — add "⚑ Flag an error" button (opens feedback w/ hub context) + a light price-estimate note under the tag row.
- `README.md` — short "Feedback form setup" section.

**Why a context (not lifted page state):** the footer lives in `layout.tsx` (site-wide, across `/` and `/map`) and the "Flag an error" trigger lives deep inside `DirectoryExplorer → HubModal`. A context is the only clean way for both far-apart consumers to open one shared modal.

---

## Task 1: Feedback types + `validateFeedback` (pure, TDD)

**Files:**
- Create: `lib/feedback.ts`
- Test: `test/feedback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/feedback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateFeedback, type FeedbackInput } from "../lib/feedback";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- feedback`
Expected: FAIL — cannot resolve `../lib/feedback`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/feedback.ts`:

```ts
export type FeedbackType = "price" | "outdated" | "suggest" | "hello";

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  price: "Wrong price",
  outdated: "Outdated info",
  suggest: "Suggest a hub",
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- feedback`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/feedback.ts test/feedback.test.ts
git commit -m "feat: feedback input types + validation"
```

---

## Task 2: `buildFeedbackBody` + `formspreeEndpoint` (pure, TDD)

**Files:**
- Modify: `lib/feedback.ts`
- Test: `test/feedback.test.ts`

- [ ] **Step 1: Write the failing test** (append to `test/feedback.test.ts`)

```ts
import { buildFeedbackBody, formspreeEndpoint } from "../lib/feedback";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- feedback`
Expected: FAIL — `buildFeedbackBody` / `formspreeEndpoint` are not exported.

- [ ] **Step 3: Write minimal implementation** (append to `lib/feedback.ts`)

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- feedback`
Expected: PASS (all feedback tests).

- [ ] **Step 5: Commit**

```bash
git add lib/feedback.ts test/feedback.test.ts
git commit -m "feat: build Formspree payload + endpoint helper"
```

---

## Task 3: Feedback context + `useFeedback` hook

**Files:**
- Create: `components/feedback/FeedbackContext.tsx`

No unit test (React context/provider — the repo has no component test harness; verified by typecheck in Task 6 and the manual run in Task 8). Keep the surface tiny and pattern-matched.

- [ ] **Step 1: Create the provider + hook**

Create `components/feedback/FeedbackContext.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import FeedbackModal from "./FeedbackModal";
import type { FeedbackType } from "@/lib/feedback";

/** Context a consumer can pass when opening the modal from a specific hub. */
export interface FeedbackOpenContext {
  hubId: string;
  hubName: string;
  /** Pre-selected type, e.g. "price" from a hub's "Flag an error". */
  type?: FeedbackType;
}

interface FeedbackApi {
  open: (ctx?: FeedbackOpenContext) => void;
}

const FeedbackCtx = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackCtx);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [openCtx, setOpenCtx] = useState<FeedbackOpenContext | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((ctx?: FeedbackOpenContext) => {
    setOpenCtx(ctx ?? null);
    setIsOpen(true);
  }, []);

  const api = useMemo<FeedbackApi>(() => ({ open }), [open]);

  return (
    <FeedbackCtx.Provider value={api}>
      {children}
      {isOpen && <FeedbackModal context={openCtx} onClose={() => setIsOpen(false)} />}
    </FeedbackCtx.Provider>
  );
}
```

- [ ] **Step 2: Commit** (will not typecheck until Task 4 creates `FeedbackModal`; commit together with Task 4 — skip standalone commit here)

Proceed directly to Task 4; commit both at the end of Task 4.

---

## Task 4: Feedback modal UI + submit

**Files:**
- Create: `components/feedback/FeedbackModal.tsx`

Matches the `HubModal` aesthetic: fixed overlay `bg-[#20140d99]`, card `border-[2.5px] border-[#20140d] bg-[#fffaf3] shadow-[8px_10px_0_#20140d]`, display font for headings.

- [ ] **Step 1: Create the modal**

Create `components/feedback/FeedbackModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  FEEDBACK_TYPE_LABELS, buildFeedbackBody, formspreeEndpoint, validateFeedback,
  type FeedbackType, type FeedbackInput,
} from "@/lib/feedback";
import type { FeedbackOpenContext } from "./FeedbackContext";

const FORMSPREE_ID = process.env.NEXT_PUBLIC_FORMSPREE_ID;
const TYPE_ORDER: FeedbackType[] = ["price", "outdated", "suggest", "hello"];
const GITHUB_URL = "https://github.com/dorsadeh/worldschoolinghubs";

export default function FeedbackModal({ context, onClose }: {
  context: FeedbackOpenContext | null;
  onClose: () => void;
}) {
  const [type, setType] = useState<FeedbackType>(context?.type ?? (context ? "price" : "hello"));
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
            The feedback form isn&apos;t set up yet. You can still reach out on{" "}
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-[#1d6fa5] underline">GitHub</a>.
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
```

- [ ] **Step 2: Verify it typechecks/lints**

Run: `npm run lint`
Expected: no errors for `components/feedback/*` (warnings unrelated to these files are fine).

- [ ] **Step 3: Commit (Tasks 3 + 4 together)**

```bash
git add components/feedback/FeedbackContext.tsx components/feedback/FeedbackModal.tsx
git commit -m "feat: feedback context provider + Formspree-backed modal"
```

---

## Task 5: Site-wide footer

**Files:**
- Create: `components/Footer.tsx`

- [ ] **Step 1: Create the footer**

Create `components/Footer.tsx`:

```tsx
"use client";

import { useFeedback } from "./feedback/FeedbackContext";

const GITHUB_URL = "https://github.com/dorsadeh/worldschoolinghubs";

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => open()}
            className="rounded-full border-2 border-[#20140d] bg-white px-[13px] py-[5px] text-[12.5px] font-semibold transition-transform duration-150 hover:-translate-y-[1px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Contact
          </button>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border-2 border-[#20140d] bg-white px-[13px] py-[5px] text-[12.5px] font-semibold transition-transform duration-150 hover:-translate-y-[1px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Contribute on GitHub ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: no errors for `components/Footer.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/Footer.tsx
git commit -m "feat: site-wide footer with contact + GitHub links"
```

---

## Task 6: Wire provider + footer into the layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add imports**

In `app/layout.tsx`, add after the existing `import "./globals.css";` line:

```tsx
import { FeedbackProvider } from "@/components/feedback/FeedbackContext";
import Footer from "@/components/Footer";
```

- [ ] **Step 2: Wrap children + footer in the provider**

Replace the `<body>` block:

```tsx
      <body className="min-h-full flex flex-col">{children}</body>
```

with:

```tsx
      <body className="min-h-full flex flex-col">
        <FeedbackProvider>
          {children}
          <Footer />
        </FeedbackProvider>
      </body>
```

Note: `app/page.tsx`'s explorer uses `h-screen`; the footer sits below it as a second flex row. This is intentional — the footer is reachable by scrolling and does not overlap the explorer.

- [ ] **Step 3: Verify it builds (typecheck across the tree)**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: mount feedback provider + footer site-wide"
```

---

## Task 7: HubModal "Flag an error" + price-estimate note

**Files:**
- Modify: `components/directory/HubModal.tsx`

- [ ] **Step 1: Import the feedback hook**

At the top of `components/directory/HubModal.tsx`, after the existing `lib/directory` import, add:

```tsx
import { useFeedback } from "@/components/feedback/FeedbackContext";
```

- [ ] **Step 2: Read the hook inside the component**

In `export default function HubModal(...)`, change:

```tsx
  const meta = CATEGORY_META[hub.category];
```

to:

```tsx
  const meta = CATEGORY_META[hub.category];
  const { open: openFeedback } = useFeedback();
```

- [ ] **Step 3: Add the light price-estimate note under the tag row**

Immediately after the closing `</div>` of the tag row (the `<div className="mt-3 flex flex-wrap gap-2">…</div>` block ending at line ~56), add:

```tsx
          <p className="mt-1.5 text-[11px] leading-snug opacity-50">
            Prices are community-reported estimates — verify with the provider.
          </p>
```

- [ ] **Step 4: Add the "Flag an error" trigger**

In the actions row, change:

```tsx
          <div className="mt-4 flex flex-wrap gap-3">
            {hub.website && <Link href={hub.website.startsWith("http") ? hub.website : `https://${hub.website}`}>Website ↗</Link>}
            {hub.facebook && <Link href={hub.facebook.startsWith("http") ? hub.facebook : `https://${hub.facebook}`}>Facebook ↗</Link>}
          </div>
```

to:

```tsx
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {hub.website && <Link href={hub.website.startsWith("http") ? hub.website : `https://${hub.website}`}>Website ↗</Link>}
            {hub.facebook && <Link href={hub.facebook.startsWith("http") ? hub.facebook : `https://${hub.facebook}`}>Facebook ↗</Link>}
            <button
              type="button"
              onClick={() => openFeedback({ hubId: hub.id, hubName: hub.name, type: "price" })}
              className="text-[13px] font-semibold text-[#6b4e3d] underline decoration-dotted underline-offset-2"
              style={{ fontFamily: "var(--font-display)" }}
            >
              ⚑ Flag an error
            </button>
          </div>
```

- [ ] **Step 4b: Confirm `hub.id` exists**

Run: `grep -n "id" lib/directory.ts | grep -i "DirectoryHub" -n; grep -n "id:" lib/directory.ts | head`
Expected: `DirectoryHub` has an `id: string` field (used already as the merge key throughout the pipeline). If for any reason it does not, stop and reconcile before continuing.

- [ ] **Step 5: Verify lint**

Run: `npm run lint`
Expected: no errors for `HubModal.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/directory/HubModal.tsx
git commit -m "feat: hub modal flag-an-error trigger + price-estimate note"
```

---

## Task 8: Config docs + manual verification

**Files:**
- Create: `.env.local.example`
- Modify: `README.md`

- [ ] **Step 1: Document the env var**

Create `.env.local.example`:

```
# Formspree form id for the contact/feedback form (public by design).
# Create a free form at https://formspree.io, then copy its id (the part after /f/).
NEXT_PUBLIC_FORMSPREE_ID=your_form_id_here
```

- [ ] **Step 2: Add a README section**

Append to `README.md`:

```markdown
## Feedback form setup

The "Contact" footer button and the hub "Flag an error" link open a feedback
form that POSTs to [Formspree](https://formspree.io) — no backend required.

1. Create a free Formspree account and a new form. Point its notifications at
   whatever email alias you like (nothing is exposed on the site).
2. Copy the form id (the part after `/f/` in the endpoint).
3. Add it to `.env.local`:

   ```
   NEXT_PUBLIC_FORMSPREE_ID=your_form_id_here
   ```

If the variable is unset, the form shows a friendly "not set up yet" message and
points visitors to GitHub instead. The id is public by design (it ships in the
client bundle), so it is safe to commit in deployment env config.
```

- [ ] **Step 3: Commit**

```bash
git add .env.local.example README.md
git commit -m "docs: feedback form (Formspree) setup"
```

- [ ] **Step 4: Manual verification in a real browser**

Use the `run` skill (or `npm run dev`) to launch the app, then confirm:
1. The footer is visible at the bottom (disclaimer line + Contact + Contribute on GitHub).
2. Clicking **Contact** opens the modal titled "Contact & feedback" with type defaulting to "Just saying hi".
3. Opening any hub → the modal shows the "Prices are community-reported estimates…" note under the tags, and a **⚑ Flag an error** link; clicking it opens the feedback modal titled "Feedback · <hub name>" with type "Wrong price".
4. With **no** `NEXT_PUBLIC_FORMSPREE_ID` set: submitting is replaced by the "isn't set up yet → GitHub" message.
5. With a real id set in `.env.local`: submitting a test message shows the "Thanks! 🙌" success state, and the message arrives in the Formspree dashboard with the expected `_subject` and `hub` fields.
6. Validation: an empty message shows "Please enter a message."; a malformed email shows the email error.

Expected: all six pass. Note any deviation and fix before declaring done.

---

## Self-Review

**Spec coverage:**
- Footer (disclaimer line + Contact + GitHub) → Tasks 5, 6. ✅
- "Contact" label (not "Report a correction") → Task 5 (`Contact`). ✅
- Feedback modal (type selector, optional name/email, message, hub prefill, Formspree POST, honeypot) → Tasks 1–4. ✅
- "Flag an error" in HubModal with hub prefill → Task 7. ✅
- Light price disclaimer near price fields → Task 7 (note under tag row) + footer line. ✅
- Config via `NEXT_PUBLIC_FORMSPREE_ID` + disabled fallback → Task 4 (`configured` branch) + Task 8. ✅
- Error handling (missing env, network error, empty message) → Task 4 + Task 1 validation. ✅
- Out of scope (no About page, no backend, no GitHub repo config) → honored; GitHub link is a plain hyperlink only. ✅

**Placeholder scan:** none — every step has full code/commands. `your_form_id_here` is an intentional example value in a `.example` file, not a plan placeholder.

**Type consistency:** `FeedbackInput`, `FeedbackType`, `FeedbackOpenContext`, `validateFeedback`, `buildFeedbackBody`, `formspreeEndpoint`, `useFeedback`, `FeedbackProvider`, `open()` are named identically across Tasks 1–7. `FeedbackModal` prop shape `{ context, onClose }` matches between Task 3 (caller) and Task 4 (definition). `open(ctx?)` signature matches between context (Task 3), footer (Task 5), and HubModal (Task 7).
