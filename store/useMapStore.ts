import { create } from 'zustand';

interface MapState {
    hoveredId: string | null;
    dateFilter: Date | null;
    activeCategories: string[];
    setHoveredId: (id: string | null) => void;
    setDateFilter: (date: Date | null) => void;
    toggleCategory: (category: string) => void;
}

export const useMapStore = create<MapState>((set) => ({
    hoveredId: null,
    dateFilter: new Date(),
    activeCategories: [],
    setHoveredId: (id) => set({ hoveredId: id }),
    setDateFilter: (date) => set({ dateFilter: date }),
    toggleCategory: (category) =>
        set((state) => {
            if (state.activeCategories.includes(category)) {
                return {
                    activeCategories: state.activeCategories.filter((c) => c !== category),
                };
            } else {
                return {
                    activeCategories: [...state.activeCategories, category],
                };
            }
        }),
}));
