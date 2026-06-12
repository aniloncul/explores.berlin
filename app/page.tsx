"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
// import { supabase } from "@/lib/supabase"; // Temporarily disabled - using mock data
import { mockLocations } from "@/data/mockLocations"; // Mock data import
import { Location } from "@/types";
import { useMapStore } from "@/store/useMapStore";
import ListingCard from "@/components/ListingCard";
import MapComponent from "@/components/Map";
import { Calendar, Search } from "lucide-react";
import { twMerge } from "tailwind-merge";
import PixelTicker from "@/components/PixelTicker";
import Navigation from "@/components/Navigation";

export default function Page() {
    // Removed dateFilter and activeCategories from useMapStore destructuring
    // as they are now managed locally based on the provided edit.
    const {
        dateFilter, setDateFilter,
        activeCategories, toggleCategory,
        hoveredId, selectedId
    } = useMapStore();

    const [locations, setLocations] = useState<Location[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [visibleLocationIds, setVisibleLocationIds] = useState<string[] | null>(null);

    const handleVisibleIdsChange = useCallback((ids: string[]) => {
        setVisibleLocationIds(ids);
    }, []);

    // Using mock data instead of Supabase (temporary solution)
    useEffect(() => {
        // Simulate loading delay for realistic UX
        const timer = setTimeout(() => {
            setLocations(mockLocations);
            console.log("Mock Data Loaded:", { count: mockLocations.length });
            setIsLoading(false);
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    /* Original Supabase fetch - uncomment to restore
    useEffect(() => {
        async function fetchLocations() {
            const { data, error } = await supabase.from('locations').select('*');
            console.log("Supabase Fetch Debug:", { data: data, error: error, count: data?.length });

            if (error) {
                console.error('Error fetching locations:', error);
                return;
            }
            if (data) {
                const mapped: Location[] = data.map((loc: any) => {
                    return {
                        id: loc.id,
                        title: loc.title,
                        category: loc.category || [],
                        description: loc.description,
                        address: loc.address,
                        coordinates: { lat: loc.lat, lng: loc.lng },
                        startDate: loc.start_date,
                        endDate: loc.end_date,
                        images: loc.images || [],
                        highlight: loc.highlight,
                        mainCategory: loc.main_category,
                        tags: loc.tags || []
                    } as Location;
                });
                setLocations(mapped);
            }
            setIsLoading(false);
        }
        fetchLocations();
    }, []);
    */

    const allCategories = ["Bar", "Event", "Restaurant"];

    // Helper to map any string or array to our 3 main categories
    const mapToMainCategory = (catInput: string | string[] | undefined): string | null => {
        if (!catInput) return null;
        
        // Convert to array if it's a string, then join to search within
        const categories = Array.isArray(catInput) ? catInput : [catInput];
        const combined = categories.join(' ').toLowerCase();

        if (combined.includes('restaurant') || combined.includes('food') || combined.includes('sushi') || combined.includes('dining')) return 'Restaurant';
        if (combined.includes('bar') || combined.includes('nightlife') || combined.includes('club')) return 'Bar';
        if (combined.includes('event') || combined.includes('concert') || combined.includes('exhibition')) return 'Event';
        
        return null;
    };

    // Using mock data instead of Supabase (temporary solution)
    useEffect(() => {
        // Simulate loading delay for realistic UX
        const timer = setTimeout(() => {
            const mapped = mockLocations.map(loc => ({
                ...loc,
                // We use the 'category' field from mockLocations.ts as the source of truth
                mainCategory: mapToMainCategory(loc.category) || loc.mainCategory
            }));
            setLocations(mapped);
            console.log("Mock Data Loaded & Mapped:", { count: mapped.length });
            setIsLoading(false);
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    // Filter Logic
    const filteredLocations = useMemo(() => {
        return locations.filter(loc => {
            // Date Filter
            if (dateFilter) {
                if (loc.startDate) {
                    const start = new Date(loc.startDate);
                    const end = new Date(loc.endDate);
                    // Check if selected date is strictly within range (inclusive)
                    const d = new Date(dateFilter);
                    d.setHours(0, 0, 0, 0);
                    start.setHours(0, 0, 0, 0);
                    end.setHours(0, 0, 0, 0);

                    if (d < start || d > end) return false;
                }
            }

            // Category Filter - Match against our 3 hardcoded categories
            if (activeCategories.length > 0) {
                // Check if the location's mapped category is in the active filters
                const mappedCat = mapToMainCategory(loc.category);
                if (!mappedCat || !activeCategories.includes(mappedCat)) return false;
            }

            // Search Filter
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const title = (loc.title || '').toLowerCase();
                const desc = (loc.description || '').toLowerCase();
                if (!title.includes(q) && !desc.includes(q)) return false;
            }

            return true;
        });
    }, [dateFilter, activeCategories, locations, searchQuery]);

    const displayLocations = useMemo(() => {
        if (!visibleLocationIds) return filteredLocations;
        return filteredLocations.filter(loc => visibleLocationIds.includes(loc.id));
    }, [filteredLocations, visibleLocationIds]);

    return (
        <main className="flex h-screen w-full flex-col bg-[#fcfaee] overflow-hidden pt-16">
            {/* Navigation */}
            <Navigation />

            {/* Content */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Left: Scrollable Grid */}
                <div className="w-full lg:w-3/5 xl:w-[55%] h-full overflow-y-auto no-scrollbar p-4 sm:p-6 pb-32 scroll-smooth">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between mb-6">
                        {/* Date Picker */}
                        {/* Date Picker - Techno Style */}
                        <div className="relative flex items-center gap-2 border-2 border-black bg-white px-4 py-2 hover:bg-black hover:text-white group dark:border-white dark:bg-black dark:text-white dark:hover:bg-white dark:hover:text-black transition-colors w-full sm:w-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
                            <Calendar className="h-4 w-4 group-hover:text-white dark:group-hover:text-black transition-colors" />
                            <input
                                type="date"
                                className="bg-transparent text-sm font-bold uppercase outline-none text-inherit w-full cursor-pointer placeholder-inherit font-mono"
                                value={dateFilter ? new Date(dateFilter.getTime() - dateFilter.getTimezoneOffset() * 60000).toISOString().split('T')[0] : ''}
                                onChange={(e) => setDateFilter(e.target.valueAsDate)}
                            />
                        </div>

                        {/* Search Bar */}
                        {/* Search Bar - Techno Style */}
                        <div className="relative flex items-center gap-2 border-2 border-black bg-white px-4 py-2 w-full sm:w-auto flex-1 max-w-md shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-black dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
                            <Search className="h-4 w-4 text-black dark:text-white" />
                            <input
                                type="text"
                                placeholder="SEARCH EVENTS..."
                                className="bg-transparent text-sm font-bold outline-none text-black dark:text-white placeholder-gray-500 w-full uppercase font-mono"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Categories */}
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto">
                            {allCategories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => toggleCategory(cat)}
                                    className={twMerge(
                                        "whitespace-nowrap px-4 py-2 text-xs font-bold uppercase transition-all border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none font-mono",
                                        activeCategories.includes(cat)
                                            ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                                            : "bg-white text-black border-black hover:bg-black hover:text-white dark:bg-black dark:text-white dark:border-white dark:hover:bg-white dark:hover:text-black"
                                    )}
                                >
                                    {cat === 'Recommended' ? 'Angebot' : cat.replace(/[\[\]'"]/g, '')}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {isLoading ? (
                            Array.from({ length: 9 }).map((_, i) => (
                                <div key={i} className="flex flex-col gap-3">
                                    <div className="w-full aspect-[4/3] bg-gray-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
                                    <div className="h-4 w-3/4 bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
                                    <div className="h-4 w-1/2 bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
                                </div>
                            ))
                        ) : (
                            <>
                                {displayLocations.map(loc => (
                                    <ListingCard key={loc.id} location={loc} />
                                ))}
                                {displayLocations.length === 0 && (
                                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-center text-gray-500 dark:text-zinc-500">
                                        <p>No events found for this date.</p>
                                        <button onClick={() => setDateFilter(null)} className="mt-2 text-rose-500 underline text-sm">Clear filter</button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Right: Sticky Map & Details */}
                <div className="hidden lg:flex lg:w-2/5 xl:w-[45%] h-full flex-col">
                    {/* Top: Map (70%) */}
                    <div className="h-[70%] w-full p-6 pb-3">
                        <MapComponent filteredLocations={filteredLocations} onVisibleIdsChange={handleVisibleIdsChange} />
                    </div>

                    <div className="h-[30%] w-full p-6 pt-3 overflow-y-auto no-scrollbar">
                        {(() => {
                            const activeId = selectedId || hoveredId;
                            const activeLocation = locations.find(l => l.id === activeId);
                            if (activeLocation && activeLocation.detail) {
                                return (
                                    <div className="p-0 h-full overflow-y-auto no-scrollbar">
                                        <h2 className="text-2xl font-semibold mb-3 text-[#b92626] uppercase tracking-tight">
                                            {activeLocation.title}
                                        </h2>
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-black dark:text-gray-100">
                                            {activeLocation.detail}
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <div className="flex items-center justify-center h-full border-t border-black/10 dark:border-white/10">
                                    <p className="text-gray-400 text-xs uppercase tracking-widest italic">
                                        SELECT AN EVENT TO SEE DETAILS
                                    </p>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Mobile Map Floating Action Button (Optional, if we hid the map) */}
                {/* For now, simplified to desktop split as requested primarily. */}
            </div>
        </main>
    );
}


