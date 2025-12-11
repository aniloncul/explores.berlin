"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Location } from "@/types";
import { useMapStore } from "@/store/useMapStore";
import ListingCard from "@/components/ListingCard";
import MapComponent from "@/components/Map";
import { Calendar } from "lucide-react";
import { twMerge } from "tailwind-merge";
import PixelTicker from "@/components/PixelTicker";

export default function Page() {
    // Removed dateFilter and activeCategories from useMapStore destructuring
    // as they are now managed locally based on the provided edit.
    const {
        dateFilter, setDateFilter,
        activeCategories, toggleCategory
    } = useMapStore();

    const [locations, setLocations] = useState<Location[]>([]);

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
        }
        fetchLocations();
    }, []);

    // Extract unique categories
    const allCategories = useMemo(() => {
        const cats = new Set<string>();
        locations.forEach(loc => {
            if (loc.mainCategory) cats.add(loc.mainCategory);
        });
        return Array.from(cats);
    }, [locations]);

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

            // Category Filter
            if (activeCategories.length > 0) {
                if (!loc.mainCategory || !activeCategories.includes(loc.mainCategory)) return false;
            }

            return true;
        });
    }, [dateFilter, activeCategories, locations]);

    return (
        <main className="flex h-screen w-full flex-col bg-white dark:bg-black overflow-hidden">
            {/* Header / Top Bar */}
            <header className="relative z-10 flex w-full items-center border-b border-gray-200 bg-white/80 dark:border-zinc-800 dark:bg-black/80 h-16 overflow-hidden">
                {/* Ticker Layer (Behind) */}
                <div className="absolute inset-0 flex items-center z-0 pt-1">
                    <PixelTicker text="BERLIN FASHION WEEK 16-17.12.2025   ***   FINAL BIG NEW YEARS DISCOUNT @ZARA   ***   LADY GAGA CONCERT @ UBER ARENA 24.12.2025   ***   BERLINALE FILM FESTIVAL PRE-SALE STARTS SOON   ***   TECHNO VIKING RETURN TOUR 2026   ***   DONER KEBAB CHAMPIONSHIP KREUZBERG" />
                </div>

                {/* Logo Layer (Top, Masking) */}
                <div className="z-10 flex items-center gap-2 bg-white dark:bg-black px-6 h-full shadow-[10px_0_20px_rgba(255,255,255,1)] dark:shadow-[10px_0_20px_rgba(0,0,0,1)]">
                    <div className="h-8 w-8 rounded-lg bg-rose-500" /> {/* Logo placeholder */}
                    <h1 className="text-xl font-bold bg-gradient-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent">
                        Explores.Berlin
                    </h1>
                </div>
            </header>

            {/* Content */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Left: Scrollable Grid */}
                <div className="w-full lg:w-3/5 xl:w-[55%] h-full overflow-y-auto no-scrollbar p-4 sm:p-6 pb-32 scroll-smooth">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between mb-6">
                        {/* Date Picker */}
                        <div className="relative flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 hover:border-gray-300 dark:border-zinc-800 dark:bg-zinc-900 transition-colors w-full sm:w-auto">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            <input
                                type="date"
                                className="bg-transparent text-sm font-medium outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 w-full"
                                value={dateFilter ? new Date(dateFilter.getTime() - dateFilter.getTimezoneOffset() * 60000).toISOString().split('T')[0] : ''}
                                onChange={(e) => setDateFilter(e.target.valueAsDate)}
                            />
                        </div>

                        {/* Categories */}
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto">
                            {allCategories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => toggleCategory(cat)}
                                    className={twMerge(
                                        "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-all border",
                                        activeCategories.includes(cat)
                                            ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                    )}
                                >
                                    {cat === 'Recommended' ? 'Angebot' : cat.replace(/[\[\]'"]/g, '')}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredLocations.map(loc => (
                            <ListingCard key={loc.id} location={loc} />
                        ))}
                        {filteredLocations.length === 0 && (
                            <div className="col-span-full py-12 flex flex-col items-center justify-center text-center text-gray-500 dark:text-zinc-500">
                                <p>No events found for this date.</p>
                                <button onClick={() => setDateFilter(null)} className="mt-2 text-rose-500 underline text-sm">Clear filter</button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Sticky Map (Hidden on mobile, shown on lg) */}
                <div className="hidden lg:block lg:w-2/5 xl:w-[45%] h-full">
                    <div className="h-full w-full p-4 pl-0">
                        <MapComponent filteredLocations={filteredLocations} />
                    </div>
                </div>

                {/* Mobile Map Floating Action Button (Optional, if we hid the map) */}
                {/* For now, simplified to desktop split as requested primarily. */}
            </div>
        </main>
    );
}


