"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import FeedbackModal from "./FeedbackModal";
import type { FeedbackType } from "@/lib/feedback";

/** Context a consumer can pass when opening the modal from a specific hub. */
export interface FeedbackOpenContext {
  hubId: string;
  hubName: string;
  /** Pre-selected type, e.g. "outdated" from a hub's "Flag an error". */
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
