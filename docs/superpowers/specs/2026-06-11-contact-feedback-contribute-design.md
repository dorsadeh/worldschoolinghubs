# Contact, Feedback & Contribute Channels — Design

**Date:** 2026-06-11
**Status:** Approved, pending implementation plan

## Problem

The Worldschool Atlas publishes ~175 hub entries carrying prices, events, and
details that are explicitly **unvalidated** community/blog/press-derived signal.
We want to:

1. Let visitors **contact** the maintainer and **send feedback** (especially
   "this price is wrong for hub X").
2. Point technical people to **contribute on GitHub**.
3. Do this without exposing the maintainer to undue practical legal risk from
   publishing estimated prices, and without revealing a personal inbox or name.

## Constraints & decisions

- **Pseudonymous, low-effort.** No personal email or real name on the page. No
  custom backend to maintain.
- **Reach non-technical parents.** A no-account feedback form (parents) *plus* a
  GitHub link (developers). GitHub-only was rejected because the core audience —
  worldschooling parents — won't use it.
- **Light & contextual disclaimer.** A site-wide footer line plus a subtle note
  near price fields. **No** dedicated Disclaimer/About page.
- **Footer entry-point label is "Contact"** (not "Report a correction"). The same
  modal behind it handles corrections, feedback, and general messages.

### Legal posture (not legal advice)

Publishing *estimated, community-sourced* prices is low practical risk when:
(1) prices are framed as unverified estimates, not the business's official quote;
(2) we imply no endorsement and make no harmful factual claims; (3) there's an
easy correction channel. The feedback form satisfies (3); the disclaimer line
satisfies (1)–(2). The data is already labeled unvalidated internally — this work
makes that posture visible to the public.

## Form service: Formspree

A native on-site form POSTs to a Formspree form ID. Chosen over Tally/Google
Forms (which bounce the user off-site and break the SPA feel) and over GitHub
Issues for feedback (requires an account). Formspree keeps parents on-site, lets
us pre-fill which hub a complaint is about, routes submissions to a dashboard +
alias email (no real inbox/name exposed), free tier 50 submissions/month, with a
built-in spam honeypot. The form ID is public by design.

## Components

### 1. Site-wide footer — `components/Footer.tsx`, rendered in `app/layout.tsx`
`body` is already `flex flex-col`, so the footer drops to the bottom. Contents:
- **Disclaimer line:** "Prices & details are community-reported estimates, not
  quotes — always verify with the provider."
- **"Contact"** → opens the feedback modal.
- **"Contribute on GitHub"** → https://github.com/dorsadeh/worldschoolinghubs

Styled to match the bold-playful aesthetic (Baloo 2 / Hanken Grotesk, ink
outline) but visually quiet — it must not compete with the explorer.

### 2. Feedback modal — `components/FeedbackModal.tsx`
Reuses the existing modal pattern (cf. `components/directory/HubModal.tsx`).
- **Fields:** type selector (Wrong price · Outdated info · Suggest a hub · Just
  saying hi), optional name/email *(for replies only)*, message (required).
- **Hidden field** auto-filled with hub id + name when opened from a specific hub.
- Native `<form>` POSTing to Formspree (`fetch` POST, JSON `Accept`, show
  inline success/error — no full page reload). Honeypot field for spam.
- Folds the "contact me" need into this one form; no separate email channel.

### 3. "Flag an error" affordance in `HubModal`
A small "⚑ Flag an error" link inside the hub modal opens the feedback modal with
that hub pre-filled (type defaulting to "Wrong price"/"Outdated info").

### 4. Light price disclaimer
A subtle one-liner or `ⓘ` tooltip near the cost `Tag` (`HubModal.tsx:53`) and the
enrichment "Price" detail (`HubModal.tsx:170`): "estimate — verify with provider."
No dedicated page.

### 5. Config
- `NEXT_PUBLIC_FORMSPREE_ID` in `.env` (public by design), documented in README.
- A sensible fallback/disabled state if the env var is missing (form shows a
  "feedback temporarily unavailable" note rather than erroring).

## State / data flow

- Feedback modal open/close + optional pre-filled hub context lives in client
  state in the explorer page (`app/page.tsx`), alongside the existing hub-modal
  state. Footer "Contact" opens it with no hub context; HubModal "Flag an error"
  opens it with hub context.
- Submission: client `fetch` POST → Formspree endpoint → their dashboard + alias
  email. No app-side persistence.

## Error handling

- Missing/empty `NEXT_PUBLIC_FORMSPREE_ID` → form renders a disabled notice.
- Network/Formspree error → inline error message, form stays filled so the user
  can retry.
- Empty required message → client-side validation blocks submit.

## Out of scope (YAGNI)

- Dedicated About/Disclaimer page.
- Any custom backend or database.
- Comment threads, reactions, accounts, moderation tooling.
- Email reply automation (replies, if any, happen manually from the alias inbox).

## Testing

- Footer renders site-wide and links resolve (GitHub URL correct; Contact opens
  modal).
- Feedback modal: validation blocks empty message; honeypot present; POST shape
  matches Formspree (mock `fetch`); success and error states render.
- HubModal "Flag an error" opens the modal with the correct hub id/name pre-filled.
- Disclaimer line present in footer; price note present near price fields.
