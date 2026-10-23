import { create } from "zustand";

/** A word cut somewhere on the landing page, shown as a notch on the scroll ruler. */
export interface PageCut {
  el: HTMLElement;
  seconds: number;
}

interface PageCutsState {
  cuts: ReadonlyMap<string, PageCut>;
  setCut: (id: string, cut: PageCut | null) => void;
}

export const usePageCuts = create<PageCutsState>((set) => ({
  cuts: new Map(),
  setCut: (id, cut) =>
    set((s) => {
      if (!cut && !s.cuts.has(id)) return s;
      const cuts = new Map(s.cuts);
      if (cut) cuts.set(id, cut);
      else cuts.delete(id);
      return { cuts };
    }),
}));
