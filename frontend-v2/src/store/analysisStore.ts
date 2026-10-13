import { useSyncExternalStore } from 'react';

type Listener = () => void;
let activeCount = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export const analysisStore = {
  start: () => {
    activeCount++;
    emit();
  },
  stop: () => {
    if (activeCount > 0) {
      activeCount--;
      emit();
    }
  },
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => activeCount,
};

export function useLocalAnalysisCount() {
  return useSyncExternalStore(analysisStore.subscribe, analysisStore.getSnapshot);
}

