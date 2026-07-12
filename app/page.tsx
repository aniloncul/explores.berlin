"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
// import { supabase } from "@/lib/supabase"; // Temporarily disabled - using mock data
import { mockLocations } from "@/data/mockLocations"; // Mock data import
import { Location } from "@/types";
import { useMapStore } from "@/store/useMapStore";
import ListingCard from "@/components/ListingCard";
import MapComponent from "@/components/Map";
import { Calendar, Search, X } from "lucide-react";
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
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        title: "",
        category: [] as string[],
        description: "",
        address: "",
        lat: 52.5200,
        lng: 13.4050,
        startDate: "",
        endDate: "",
        image: "",
        highlight: false,
        detail: "",
        tags: ""
    });

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const newId = `custom-event-${Date.now()}`;
        const newLocation: Location = {
            id: newId,
            title: formData.title,
            category: formData.category,
            description: formData.description,
            address: formData.address,
            coordinates: {
                lat: Number(formData.lat) || 52.5200,
                lng: Number(formData.lng) || 13.4050,
            },
            startDate: formData.startDate ? new Date(formData.startDate).toISOString() : new Date().toISOString(),
            endDate: formData.endDate ? new Date(formData.endDate).toISOString() : new Date().toISOString(),
            images: formData.image ? [formData.image] : [],
            highlight: formData.highlight,
            mainCategory: mapToMainCategory(formData.category) || formData.category[0] || "Event",
            tags: formData.tags ? formData.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
            detail: formData.detail
        };

        try {
            const res = await fetch("/api/locations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newLocation),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.details || errorData.error || "Failed to save to database");
            }

            alert("Event successfully saved to PostgreSQL!");
            setLocations(prev => [newLocation, ...prev]);
        } catch (err: any) {
            console.error("Database save failed:", err.message);
            alert(`Database Save Warning: ${err.message}. The event was added to the temporary screen list for preview but could not be saved to PostgreSQL due to database permissions.`);
            
            // Still add locally for realistic UX/preview
            setLocations(prev => [newLocation, ...prev]);
        }
        
        // Reset form
        setFormData({
            title: "",
            category: [],
            description: "",
            address: "",
            lat: 52.5200,
            lng: 13.4050,
            startDate: "",
            endDate: "",
            image: "",
            highlight: false,
            detail: "",
            tags: ""
        });
        setIsCreateModalOpen(false);
    };

    const handleCategoryCheckboxChange = (cat: string) => {
        setFormData(prev => {
            const exists = prev.category.includes(cat);
            if (exists) {
                return { ...prev, category: prev.category.filter(c => c !== cat) };
            } else {
                return { ...prev, category: [...prev.category, cat] };
            }
        });
    };

    const handleVisibleIdsChange = useCallback((ids: string[]) => {
        setVisibleLocationIds(ids);
    }, []);

    // Fetch locations from PostgreSQL database with mock data fallback
    useEffect(() => {
        async function loadLocations() {
            try {
                const response = await fetch("/api/locations");
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                if (data && Array.isArray(data) && data.length > 0) {
                    const mapped = data.map(loc => ({
                        ...loc,
                        mainCategory: mapToMainCategory(loc.category) || loc.mainCategory
                    }));
                    setLocations(mapped);
                    console.log("Database Data Loaded & Mapped:", { count: mapped.length });
                } else {
                    throw new Error("No data returned or empty array");
                }
            } catch (err: any) {
                console.warn("PostgreSQL connection/fetch failed (falling back to mock data):", err.message);
                // Fallback to static mockLocations
                const mapped = mockLocations.map(loc => ({
                    ...loc,
                    mainCategory: mapToMainCategory(loc.category) || loc.mainCategory
                }));
                setLocations(mapped);
                console.log("Fallback Mock Data Loaded & Mapped:", { count: mapped.length });
            } finally {
                setIsLoading(false);
            }
        }
        loadLocations();
    }, []);

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
            <Navigation onCreateEventClick={() => setIsCreateModalOpen(true)} />

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
            </div>

            {/* Create Event Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto">
                    <div className="relative w-full max-w-2xl bg-[#fcfaee] border-4 border-black p-6 md:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] my-8">
                        
                        {/* Header */}
                        <div className="flex items-center justify-between border-b-4 border-black pb-4 mb-6">
                            <h2 className="text-2xl md:text-3xl font-black uppercase font-mono tracking-tight text-black flex items-center gap-2">
                                <span className="bg-rose-500 text-black px-2 py-1 border-2 border-black text-lg md:text-xl">NEW</span>
                                Create Berlin Event
                            </h2>
                            <button 
                                onClick={() => setIsCreateModalOpen(false)}
                                className="p-2 border-2 border-black bg-white hover:bg-black hover:text-white transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleFormSubmit} className="space-y-5 font-mono text-xs">
                            
                            {/* Row 1: Title */}
                            <div className="flex flex-col gap-1">
                                <label className="font-bold text-black uppercase tracking-wider">Event Title*</label>
                                <input 
                                    type="text" 
                                    required
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="E.G. SYNC.D TECHNO NIGHT AT SPREEWALD"
                                    className="border-2 border-black p-3 bg-white text-black outline-none focus:bg-[#fffdf4] text-sm uppercase"
                                />
                            </div>

                            {/* Row 2: Categories Checkboxes */}
                            <div className="flex flex-col gap-2">
                                <label className="font-bold text-black uppercase tracking-wider">Categories* (Select at least one)</label>
                                <div className="flex flex-wrap gap-4">
                                    {allCategories.map(cat => (
                                        <label key={cat} className="flex items-center gap-2 cursor-pointer select-none">
                                            <input 
                                                type="checkbox"
                                                checked={formData.category.includes(cat)}
                                                onChange={() => handleCategoryCheckboxChange(cat)}
                                                className="w-4 h-4 accent-rose-500 cursor-pointer border-2 border-black"
                                            />
                                            <span className="font-bold text-black text-sm uppercase">{cat}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Row 3: Description */}
                            <div className="flex flex-col gap-1">
                                <label className="font-bold text-black uppercase tracking-wider">Description*</label>
                                <textarea 
                                    required
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="BRIEF ONE-LINE DESCRIPTION FOR GRID DISCOVERY"
                                    rows={2}
                                    className="border-2 border-black p-3 bg-white text-black outline-none focus:bg-[#fffdf4] text-sm"
                                />
                            </div>

                            {/* Row 4: Address */}
                            <div className="flex flex-col gap-1">
                                <label className="font-bold text-black uppercase tracking-wider">Address*</label>
                                <input 
                                    type="text" 
                                    required
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="E.G. REVALER STR. 99, 10245 BERLIN"
                                    className="border-2 border-black p-3 bg-white text-black outline-none focus:bg-[#fffdf4] text-sm"
                                />
                            </div>

                            {/* Row 5: Lat & Lng */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="font-bold text-black uppercase tracking-wider">Latitude*</label>
                                    <input 
                                        type="number" 
                                        step="any"
                                        required
                                        value={formData.lat}
                                        onChange={e => setFormData({ ...formData, lat: parseFloat(e.target.value) })}
                                        className="border-2 border-black p-3 bg-white text-black outline-none text-sm"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="font-bold text-black uppercase tracking-wider">Longitude*</label>
                                    <input 
                                        type="number" 
                                        step="any"
                                        required
                                        value={formData.lng}
                                        onChange={e => setFormData({ ...formData, lng: parseFloat(e.target.value) })}
                                        className="border-2 border-black p-3 bg-white text-black outline-none text-sm"
                                    />
                                </div>
                            </div>

                            {/* Row 6: Dates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="font-bold text-black uppercase tracking-wider">Start Date*</label>
                                    <input 
                                        type="datetime-local" 
                                        required
                                        value={formData.startDate}
                                        onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                        className="border-2 border-black p-3 bg-white text-black outline-none text-sm"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="font-bold text-black uppercase tracking-wider">End Date*</label>
                                    <input 
                                        type="datetime-local" 
                                        required
                                        value={formData.endDate}
                                        onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                        className="border-2 border-black p-3 bg-white text-black outline-none text-sm"
                                    />
                                </div>
                            </div>

                            {/* Row 7: Image & Tags */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="font-bold text-black uppercase tracking-wider">Image URL / Path</label>
                                    <input 
                                        type="text" 
                                        value={formData.image}
                                        onChange={e => setFormData({ ...formData, image: e.target.value })}
                                        placeholder="E.G. /images/event-one.jpg"
                                        className="border-2 border-black p-3 bg-white text-black outline-none text-sm"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="font-bold text-black uppercase tracking-wider">Tags (comma-separated)</label>
                                    <input 
                                        type="text" 
                                        value={formData.tags}
                                        onChange={e => setFormData({ ...formData, tags: e.target.value })}
                                        placeholder="E.G. TECHNO, OUTDOOR, FREE ENTRY"
                                        className="border-2 border-black p-3 bg-white text-black outline-none text-sm uppercase"
                                    />
                                </div>
                            </div>

                            {/* Row 8: Detail Text & Highlight Checkbox */}
                            <div className="flex flex-col gap-1">
                                <label className="font-bold text-black uppercase tracking-wider">Detail Text (Shown on selection)</label>
                                <textarea 
                                    value={formData.detail}
                                    onChange={e => setFormData({ ...formData, detail: e.target.value })}
                                    placeholder="LONG STORY / VIBE CARD FOR THE BOTTOM DETAIL SECTION..."
                                    rows={3}
                                    className="border-2 border-black p-3 bg-white text-black outline-none focus:bg-[#fffdf4] text-sm"
                                />
                            </div>

                            <div className="flex items-center gap-2 py-1 select-none cursor-pointer">
                                <input 
                                    type="checkbox"
                                    id="highlight-checkbox"
                                    checked={formData.highlight}
                                    onChange={e => setFormData({ ...formData, highlight: e.target.checked })}
                                    className="w-4 h-4 accent-rose-500 border-2 border-black"
                                />
                                <label htmlFor="highlight-checkbox" className="font-bold text-black text-sm uppercase cursor-pointer">Highlight/Feature Event</label>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center justify-end gap-3 pt-4 border-t-2 border-black">
                                <button 
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-5 py-3 border-2 border-black bg-white hover:bg-black hover:text-white transition-all font-bold text-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="px-5 py-3 border-2 border-black bg-rose-500 hover:bg-black hover:text-rose-500 hover:border-rose-500 transition-all font-bold text-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                                >
                                    Add Event
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}


