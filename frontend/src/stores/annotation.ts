import { create } from 'zustand';
import type { Annotation, LabelClass } from '../types';

interface AnnotationState {
  // Image state
  image: HTMLImageElement | null;
  annotations: Annotation[];
  classes: LabelClass[];
  selectedClassId: string;
  dirty: boolean;

  // Canvas transform
  scale: number;
  offsetX: number;
  offsetY: number;

  // Interaction
  tool: 'draw' | 'select';
  selectedId: string | null;
  drawing: { x1: number; y1: number; x2: number; y2: number } | null;

  // Actions
  setImage: (img: HTMLImageElement | null) => void;
  setAnnotations: (anns: Annotation[]) => void;
  setClasses: (classes: LabelClass[]) => void;
  setSelectedClass: (id: string) => void;
  addAnnotation: (ann: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  deleteSelected: () => void;
  setDirty: (d: boolean) => void;
  setTransform: (t: { scale?: number; offsetX?: number; offsetY?: number }) => void;
  setTool: (t: 'draw' | 'select') => void;
  setSelectedId: (id: string | null) => void;
  setDrawing: (d: { x1: number; y1: number; x2: number; y2: number } | null) => void;
  reset: () => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  image: null,
  annotations: [],
  classes: [],
  selectedClassId: '',
  dirty: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  tool: 'draw',
  selectedId: null,
  drawing: null,

  setImage: (image) => set({ image }),
  setAnnotations: (annotations) => set({ annotations, dirty: false }),
  setClasses: (classes) => set({ classes }),
  setSelectedClass: (selectedClassId) => set({ selectedClassId }),
  addAnnotation: (ann) => set((s) => ({ annotations: [...s.annotations, ann], dirty: true })),
  updateAnnotation: (id, patch) => set((s) => ({
    annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    dirty: true,
  })),
  deleteSelected: () => set((s) => ({
    annotations: s.annotations.filter((a) => a.id !== s.selectedId),
    selectedId: null,
    dirty: true,
  })),
  setDirty: (dirty) => set({ dirty }),
  setTransform: (t) => set((s) => ({
    scale: t.scale ?? s.scale,
    offsetX: t.offsetX ?? s.offsetX,
    offsetY: t.offsetY ?? s.offsetY,
  })),
  setTool: (tool) => set({ tool, selectedId: null, drawing: null }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setDrawing: (drawing) => set({ drawing }),
  reset: () => set({
    image: null, annotations: [], dirty: false,
    scale: 1, offsetX: 0, offsetY: 0,
    tool: 'draw', selectedId: null, drawing: null,
  }),
}));
