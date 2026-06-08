import { create } from 'zustand';

interface UIState {
  // Modals
  newProjectOpen: boolean;
  // Global loading
  globalLoading: boolean;

  openNewProject: () => void;
  closeNewProject: () => void;
  setGlobalLoading: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  newProjectOpen: false,
  globalLoading: false,

  openNewProject: () => set({ newProjectOpen: true }),
  closeNewProject: () => set({ newProjectOpen: false }),
  setGlobalLoading: (globalLoading) => set({ globalLoading }),
}));
