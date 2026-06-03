import { create } from 'zustand';

interface UIState {
  // Modals
  newProjectOpen: boolean;
  newDatasetOpen: boolean;
  // Global loading
  globalLoading: boolean;

  openNewProject: () => void;
  closeNewProject: () => void;
  openNewDataset: () => void;
  closeNewDataset: () => void;
  setGlobalLoading: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  newProjectOpen: false,
  newDatasetOpen: false,
  globalLoading: false,

  openNewProject: () => set({ newProjectOpen: true }),
  closeNewProject: () => set({ newProjectOpen: false }),
  openNewDataset: () => set({ newDatasetOpen: true }),
  closeNewDataset: () => set({ newDatasetOpen: false }),
  setGlobalLoading: (globalLoading) => set({ globalLoading }),
}));
