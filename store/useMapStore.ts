import { create } from 'zustand';

interface MapState {
    hoveredId: string | null;
    dateFilter: Date | null;
    activeCategories: string[];
    selectedId: string | null;
    setHoveredId: (id: string | null) => void;
    setSelectedId: (id: string | null) => void;
    setDateFilter: (date: Date | null) => void;
    toggleCategory: (category: string) => void;
}

export const useMapStore = create<MapState>((set) => ({
    hoveredId: null,
    dateFilter: new Date(),
    activeCategories: ["Döner"],
    selectedId: null,
    setHoveredId: (id) => set({ hoveredId: id }),
    setSelectedId: (id) => set({ selectedId: id }),
    setDateFilter: (date) => set({ dateFilter: date }),
    // Single-select: Beer / Cocktail / Döner cannot be active together
    toggleCategory: (category) =>
        set((state) => {
            if (state.activeCategories.includes(category)) {
                // clicking active pill turns it off (show all)
                return {
                    activeCategories: state.activeCategories.filter((c) => c !== category),
                };
            }
            // only one at a time
            return { activeCategories: [category] };
        }),
}));
