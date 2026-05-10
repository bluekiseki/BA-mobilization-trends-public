import { create } from 'zustand';
import type { GrowthPlan } from './useGlobalStore';

interface UndoRedoState {
  undoStack: GrowthPlan[][];
  redoStack: GrowthPlan[][];
  pushUndo: (state: GrowthPlan[]) => void;
  undo: (currentState: GrowthPlan[]) => GrowthPlan[] | null;
  redo: (currentState: GrowthPlan[]) => GrowthPlan[] | null;
  reset: () => void;
}

export const useUndoRedoStore = create<UndoRedoState>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushUndo: (state: GrowthPlan[]) => {
    set((s) => ({
      undoStack: [...s.undoStack, JSON.parse(JSON.stringify(state))],
      redoStack: [],
    }));
  },

  undo: (currentState: GrowthPlan[]) => {
    const { undoStack } = get();
    if (undoStack.length === 0) return null;

    const newStack = [...undoStack];
    const previousState = newStack.pop()!;

    set({
      undoStack: newStack,
      redoStack: [...get().redoStack, JSON.parse(JSON.stringify(currentState))],
    });

    return previousState;
  },

  redo: (currentState: GrowthPlan[]) => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;

    const newStack = [...redoStack];
    const nextState = newStack.pop()!;

    set({
      redoStack: newStack,
      undoStack: [...get().undoStack, JSON.parse(JSON.stringify(currentState))],
    });

    return nextState;
  },

  reset: () => {
    set({ undoStack: [], redoStack: [] });
  },
}));
