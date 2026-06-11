// components/directory/FilterSheet.tsx
"use client";

import type { DirectoryFilter } from "@/lib/directory";
import { CostChips, GroupLabel, MonthRangeControls, ParticipationChips, TypeChips } from "./FilterBar";

/** Full filter set as a mobile bottom sheet. Same DirectoryFilter state as the bar. */
export default function FilterSheet({ filter, onChange, resultCount, onClose, onReset }: {
  filter: DirectoryFilter;
  onChange: (next: DirectoryFilter) => void;
  resultCount: number;
  onClose: () => void;
  onReset: () => void;
}) {
  const set = (patch: Partial<DirectoryFilter>) => onChange({ ...filter, ...patch });
  return (
    <div className="fixed inset-0 z-[2500] bg-ink/55 md:hidden" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl bg-surface p-5 pb-7 shadow-[0_-6px_24px_rgba(0,0,0,0.14)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-ink">Filters</h2>
          <button type="button" onClick={() => { onReset(); onClose(); }} className="text-[13px] font-semibold text-muted">Reset</button>
        </div>
        <div className="flex flex-col gap-5">
          <section>
            <GroupLabel>When</GroupLabel>
            <div className="mt-2"><MonthRangeControls filter={filter} set={set} /></div>
          </section>
          <section>
            <GroupLabel>Cost</GroupLabel>
            <div className="mt-2 flex flex-wrap gap-2"><CostChips filter={filter} set={set} /></div>
          </section>
          <section>
            <GroupLabel>Type</GroupLabel>
            <div className="mt-2 flex flex-wrap gap-2"><TypeChips filter={filter} set={set} /></div>
          </section>
          <section>
            <GroupLabel>Participation</GroupLabel>
            <div className="mt-2 flex flex-wrap gap-2"><ParticipationChips filter={filter} set={set} /></div>
          </section>
        </div>
        <button type="button" onClick={onClose} className="mt-6 w-full rounded-lg bg-ink py-3 text-[14px] font-bold text-white">
          Show {resultCount} hubs
        </button>
      </div>
    </div>
  );
}
