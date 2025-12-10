"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Location } from "@/types";
import { useMapStore } from "@/store/useMapStore";
import ListingCard from "@/components/ListingCard";
import MapComponent from "@/components/Map";
import { Calendar } from "lucide-react";
import { twMerge } from "tailwind-merge";

export default function Page() {
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
                const mapped: Location[] = data.map((d: any) => ({
                    id: d.id,
                    title: d.title,
                    category: d.category, // Assuming array in DB
                    description: d.description,
                    address: d.address,
                    coordinates: { lat: d.lat, lng: d.lng },
                    startDate: d.start_date,
                    endDate: d.end_date,
                    images: d.images,
                    highlight: d.highlight
                }));
                setLocations(mapped);
            }
        }
        fetchLocations();
    }, []);

    // Extract unique categories
    const allCategories = useMemo(() => {
        const cats = new Set<string>();
        locations.forEach(loc => loc.category.forEach(c => cats.add(c)));
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
                } else {
                    // If startDate is null (permanent venues), keep it.
                    // (Assuming data source allows null, though the example data has dates for all. Logic handles it.)
                }
            }

            // Category Filter
            if (activeCategories.length > 0) {
                const hasCategory = loc.category.some(c => activeCategories.includes(c));
                if (!hasCategory) return false;
            }

            return true;
        });
    }, [dateFilter, activeCategories, locations]);

    return (
        <main className="flex h-screen w-full flex-col bg-white dark:bg-black overflow-hidden">
            {/* Header / Top Bar */}
            <header className="z-10 flex w-full flex-col gap-4 border-b border-gray-200 bg-white/80 px-6 py-4 backdrop-blur-md dark:border-zinc-800 dark:bg-black/80 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-rose-500" /> {/* Logo placeholder */}
                    <h1 className="text-xl font-bold bg-gradient-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent">
                        Explores.Berlin
                    </h1>
                </div>

                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    {/* Date Picker */}
                    <div className="relative flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 hover:border-gray-300 dark:border-zinc-800 dark:bg-zinc-900 transition-colors">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <input
                            type="date"
                            className="bg-transparent text-sm font-medium outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500"
                            onChange={(e) => setDateFilter(e.target.valueAsDate)}
                        />
                    </div>

                    {/* Categories */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
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
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Left: Scrollable Grid */}
                <div className="w-full lg:w-3/5 xl:w-[55%] h-full overflow-y-auto no-scrollbar p-4 sm:p-6 pb-32 scroll-smooth">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            {filteredLocations.length} locations
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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


