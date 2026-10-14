"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
// import { supabase } from "@/lib/supabase"; // Temporarily disabled - using mock data
import { mockLocations } from "@/data/mockLocations"; // Mock data import
import { Location } from "@/types";
import { useMapStore } from "@/store/useMapStore";
import ListingCard from "@/components/ListingCard";
import MapComponent from "@/components/Map";
import { X, MapPin } from "lucide-react";
import { twMerge } from "tailwind-merge";
import PixelTicker from "@/components/PixelTicker";
import Navigation from "@/components/Navigation";
import areas from "../scripts/vault/areas.json";

import { parseMenuMd, formatPrice } from "@/lib/menu";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
};

function formatDayHours(value: string): string {
    const v = String(value || "").trim();
    if (!v || /^(closed|geschlossen|gesloten)$/i.test(v)) return "Closed";
    return v.replace(/–/g, "-");
}

function parseRawHoursList(raw: string): { day: string; hours: string }[] | null {
    if (!raw) return null;
    // "Montag: 09:00–21:00 Uhr; Dienstag: ..."
    const map: Record<string, string> = {
        Montag: "mon",
        Dienstag: "tue",
        Mittwoch: "wed",
        Donnerstag: "thu",
        Freitag: "fri",
        Samstag: "sat",
        Sonntag: "sun",
        Monday: "mon",
        Tuesday: "tue",
        Wednesday: "wed",
        Thursday: "thu",
        Friday: "fri",
        Saturday: "sat",
        Sunday: "sun",
    };
    const parts = raw.split(/;\s*/);
    const out: { day: string; hours: string }[] = [];
    for (const p of parts) {
        const m = p.match(/^([A-Za-zäöüÄÖÜ]+):\s*(.+)$/);
        if (!m) continue;
        const day = map[m[1]] || map[m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()];
        if (!day) continue;
        out.push({ day, hours: m[2].replace(/\s*Uhr\s*$/i, "").trim() });
    }
    return out.length ? out : null;
}

const BEZIRKE = [
    { value: "all", label: "All Bezirke" },
    ...Object.values(areas).map((a) => ({ value: a.slug, label: a.label })),
];

export default function Page() {
    const router = useRouter();
    const {
        activeCategories, toggleCategory,
        hoveredId, selectedId
    } = useMapStore();

    const [locations, setLocations] = useState<Location[]>([]);
    const [selectedBezirk, setSelectedBezirk] = useState("kreuzberg");
    const [isLoading, setIsLoading] = useState(true);
    const [visibleLocationIds, setVisibleLocationIds] = useState<string[] | null>(null);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportStatus, setReportStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
    const [reportError, setReportError] = useState("");
    const [reportForm, setReportForm] = useState({
        placeTitle: "",
        placeSlug: "",
        message: "",
        email: "",
    });
    const [reportImages, setReportImages] = useState<File[]>([]);
    const [reportImagePreviews, setReportImagePreviews] = useState<string[]>([]);
    const MAX_REPORT_IMAGES = 5;

    const openReportModal = () => {
        const active = locations.find(l => l.id === (selectedId || hoveredId));
        const slug = active
            ? active.id.replace(/^(rest|bar|cafe)-/, "")
            : "";
        setReportForm({
            placeTitle: active?.title || "",
            placeSlug: slug,
            message: "",
            email: "",
        });
        setReportImages([]);
        setReportImagePreviews([]);
        setReportStatus("idle");
        setReportError("");
        setIsReportModalOpen(true);
    };

    const closeReportModal = () => {
        setIsReportModalOpen(false);
        setReportStatus("idle");
        setReportError("");
        setReportImages([]);
        setReportImagePreviews(prev => {
            prev.forEach(u => URL.revokeObjectURL(u));
            return [];
        });
    };

    const handleReportImagesChange = (files: FileList | null) => {
        if (!files || !files.length) return;
        const incoming = Array.from(files).slice(0, MAX_REPORT_IMAGES - reportImages.length);
        if (reportImages.length + Array.from(files).length > MAX_REPORT_IMAGES) {
            setReportError(`Max ${MAX_REPORT_IMAGES} photos.`);
        }
        const valid = incoming.filter(f => {
            if (!f.type.startsWith("image/")) {
                setReportError("Please choose image files only.");
                return false;
            }
            if (f.size > 8 * 1024 * 1024) {
                setReportError("Each photo must be 8MB or smaller.");
                return false;
            }
            return true;
        });
        if (!valid.length) return;
        setReportError("");
        setReportImages(prev => [...prev, ...valid]);
        setReportImagePreviews(prev => [...prev, ...valid.map(f => URL.createObjectURL(f))]);
    };

    const handleReportImageRemove = (index: number) => {
        setReportImages(prev => prev.filter((_, i) => i !== index));
        setReportImagePreviews(prev => {
            const next = prev.filter((_, i) => i !== index);
            if (prev[index]) URL.revokeObjectURL(prev[index]);
            return next;
        });
    };

    // Report modal: place autocomplete from loaded locations
    const placeSuggestions = useMemo(() => {
        const q = reportForm.placeTitle.trim().toLowerCase();
        if (q.length < 2) return [];
        const seen = new Set<string>();
        const out: Location[] = [];
        for (const l of locations) {
            const t = (l.title || "").toLowerCase();
            if (!t.includes(q) || t === q || seen.has(t)) continue;
            seen.add(t);
            out.push(l);
            if (out.length >= 6) break;
        }
        return out;
    }, [reportForm.placeTitle, locations]);

    const selectSuggestedPlace = (loc: Location) => {
        setReportForm(prev => ({
            ...prev,
            placeTitle: loc.title,
            placeSlug: loc.id.replace(/^(rest|bar|cafe)-/, ""),
        }));
    };

    const handleReportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const message = reportForm.message.trim();
        if (!message && !reportImages.length) {
            setReportError("Add menu photo(s) or a message.");
            return;
        }
        setReportStatus("sending");
        setReportError("");
        try {
            const fd = new FormData();
            fd.append("placeTitle", reportForm.placeTitle.trim());
            const slug = reportForm.placeSlug.trim()
                || reportForm.placeTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
            fd.append("placeSlug", slug);
            fd.append("message", message);
            fd.append("email", reportForm.email.trim());
            reportImages.forEach(f => fd.append("image", f));

            const res = await fetch("/api/menu-report", {
                method: "POST",
                body: fd,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.details || data.error || "Failed to send report");
            }
            setReportStatus("success");
            setReportForm({ placeTitle: "", placeSlug: "", message: "", email: "" });
            setReportImages([]);
            setReportImagePreviews(prev => {
                prev.forEach(u => URL.revokeObjectURL(u));
                return [];
            });
        } catch (err: any) {
            setReportStatus("error");
            setReportError(err.message || "Something went wrong");
        }
    };

    const handleVisibleIdsChange = useCallback((ids: string[]) => {
        setVisibleLocationIds(ids);
    }, []);

    // Fetch locations (events) + bars from PostgreSQL with mock data fallback
    useEffect(() => {
        async function loadLocations() {
            const mapped: Location[] = [];

            // Events (existing locations table)
            try {
                const response = await fetch("/api/locations");
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                if (data && Array.isArray(data) && data.length > 0) {
                    mapped.push(...data.map(loc => ({
                        ...loc,
                        mainCategory: mapToMainCategory(loc.category) || loc.mainCategory
                    })));
                }
            } catch (err: any) {
                console.warn("PostgreSQL locations fetch failed:", err.message);
            }

            // Bars (places table, type=bar)
            try {
                const response = await fetch("/api/bars");
                if (response.ok) {
                    const bars = await response.json();
                    if (Array.isArray(bars)) {
                        mapped.push(...bars);
                    }
                }
            } catch (err: any) {
                console.warn("Bars fetch failed:", err.message);
            }

            // Restaurants (places table, type=restaurant) — includes Döner/Kebab
            try {
                const response = await fetch("/api/restaurants");
                if (response.ok) {
                    const restaurants = await response.json();
                    if (Array.isArray(restaurants)) {
                        mapped.push(...restaurants);
                    }
                }
            } catch (err: any) {
                console.warn("Restaurants fetch failed:", err.message);
            }

            if (mapped.length > 0) {
                setLocations(mapped);
                console.log("Data loaded:", { count: mapped.length });
            } else {
                // Fallback to static mockLocations
                const fallback = mockLocations.map(loc => ({
                    ...loc,
                    mainCategory: mapToMainCategory(loc.category) || loc.mainCategory
                }));
                setLocations(fallback);
                console.log("Fallback mock data loaded:", { count: fallback.length });
            }
            setIsLoading(false);
        }
        loadLocations();
    }, []);

    const FILTER_CATEGORIES = ["Beer", "Cocktail", "Döner"];

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

    // Match a location against a Beer / Cocktail / Döner filter pill
    const matchesFilterCategory = (loc: Location, cat: string): boolean => {
        const subtype = (loc.subtype || loc.googlePrimaryType || "").toLowerCase();
        const main = (loc.mainCategory || "").toLowerCase();
        const cats = (loc.category || []).map(c => String(c).toLowerCase());
        const tags = (loc.tags || []).map(t => String(t).toLowerCase());
        const hay = [subtype, main, ...cats, ...tags].join(" ");

        if (cat === "Döner") {
            return /d[oö]ner|doner|kebab|kebap/.test(hay);
        }
        if (cat === "Beer") {
            return (
                subtype === "beer_garden" ||
                subtype === "brewpub" ||
                subtype === "brewery" ||
                subtype === "pub" ||
                subtype === "irish_pub" ||
                subtype === "gastropub" ||
                subtype === "sports_bar" ||
                /\b(pub|beer|bier|brew)\b/.test(hay) ||
                hay.includes("beer_garden") ||
                hay.includes("brewpub")
            );
        }
        if (cat === "Cocktail") {
            return subtype === "cocktail_bar" || hay.includes("cocktail");
        }
        return true;
    };

    // Filter Logic — Bezirk AND Beer/Cocktail/Döner pills (OR)
    const filteredLocations = useMemo(() => {
        return locations.filter(loc => {
            if (selectedBezirk !== "all" && loc.neighborhood !== selectedBezirk) return false;
            if (activeCategories.length > 0) {
                const matchAny = activeCategories.some(c => matchesFilterCategory(loc, c));
                if (!matchAny) return false;
            }
            return true;
        });
    }, [selectedBezirk, activeCategories, locations]);

    const clearAllFilters = () => {
        setSelectedBezirk("all");
        activeCategories.forEach(c => toggleCategory(c));
    };

    const displayLocations = useMemo(() => {
        if (!visibleLocationIds) return filteredLocations;
        return filteredLocations.filter(loc => visibleLocationIds.includes(loc.id));
    }, [filteredLocations, visibleLocationIds]);

    return (
        <main className="flex h-screen w-full flex-col bg-[#fcfaee] overflow-hidden pt-16">
            {/* Navigation */}
            <Navigation onReportMenuClick={openReportModal} onAskAiClick={() => router.push("/ask")} />

            {/* Content */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Left: Scrollable Grid */}
                <div className="w-full lg:w-3/5 xl:w-[55%] h-full overflow-y-auto no-scrollbar p-4 sm:p-6 pb-32 scroll-smooth">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between mb-6">
                        {/* Bezirk Picker */}
                        <div
                            className={twMerge(
                                "relative flex items-center gap-2 border-2 border-black px-4 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full sm:w-auto",
                                selectedBezirk !== "all"
                                    ? "bg-[#39FF14]"
                                    : "bg-white"
                            )}
                        >
                            <MapPin
                                className={twMerge(
                                    "h-4 w-4 shrink-0",
                                    selectedBezirk !== "all"
                                        ? "text-black"
                                        : "text-black"
                                )}
                            />
                            <select
                                className={twMerge(
                                    "bg-transparent text-sm font-bold uppercase outline-none font-mono cursor-pointer w-full sm:w-auto pr-6 appearance-none",
                                    selectedBezirk !== "all"
                                        ? "text-black"
                                        : "text-black"
                                )}
                                value={selectedBezirk}
                                onChange={(e) => setSelectedBezirk(e.target.value)}
                            >
                                {BEZIRKE.map(b => (
                                    <option key={b.value} value={b.value} className="text-black bg-white">
                                        {b.label}
                                    </option>
                                ))}
                            </select>
                            <span
                                className={twMerge(
                                    "pointer-events-none absolute right-3 text-xs",
                                    selectedBezirk !== "all"
                                        ? "text-black"
                                        : "text-black"
                                )}
                            >
                                ▼
                            </span>
                        </div>

                        {/* Beer / Cocktail / Döner */}
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto">
                            {FILTER_CATEGORIES.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => toggleCategory(cat)}
                                    className={twMerge(
                                        "whitespace-nowrap px-4 py-2 text-xs font-bold uppercase transition-all border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none font-mono",
                                        activeCategories.includes(cat)
                                            ? "bg-black text-white border-black"
                                            : "bg-white text-black border-black hover:bg-black hover:text-white"
                                    )}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {isLoading ? (
                            Array.from({ length: 9 }).map((_, i) => (
                                <div key={i} className="flex flex-col gap-3">
                                    <div className="w-full aspect-[4/3] bg-gray-200 rounded-xl animate-pulse" />
                                    <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
                                    <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse" />
                                </div>
                            ))
                        ) : (
                            <>
                                {displayLocations.map(loc => (
                                    <ListingCard key={loc.id} location={loc} />
                                ))}
                                {displayLocations.length === 0 && (
                                    <div className="col-span-full py-12 flex flex-col items-center justify-center gap-3 text-gray-500 text-center">
                                        <p>No results for this selection.</p>
                                        <p className="text-xs uppercase tracking-widest opacity-70">
                                            Bezirk: {selectedBezirk === "all" ? "All" : selectedBezirk}
                                            {activeCategories.length > 0 ? ` · ${activeCategories.join(", ")}` : ""}
                                        </p>
                                        <button onClick={clearAllFilters} className="mt-1 text-rose-500 underline text-sm">
                                            Clear all filters
                                        </button>
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
                            if (activeLocation && (activeLocation.detail || activeLocation.menuMd || activeLocation.hours || activeLocation.openingHoursRaw)) {
                                const menuItems = parseMenuMd(activeLocation.menuMd);
                                const hoursObj = activeLocation.hours && typeof activeLocation.hours === "object"
                                    ? activeLocation.hours
                                    : null;
                                const hourRows: { day: string; hours: string }[] = hoursObj
                                    ? DAY_ORDER.filter((d) => hoursObj[d] != null).map((d) => ({
                                        day: d,
                                        hours: formatDayHours(hoursObj[d]),
                                    }))
                                    : parseRawHoursList(activeLocation.openingHoursRaw || "") || [];
                                const detailLines = (activeLocation.detail || "")
                                    .split("\n")
                                    .filter((l) => l && !l.startsWith("Hours: "));

                                return (
                                    <div className="p-0 h-full overflow-y-auto no-scrollbar">
                                        <h2 className="text-2xl font-semibold mb-3 text-[#b92626] uppercase tracking-tight">
                                            {activeLocation.title}
                                        </h2>

                                        {/* Menu first (swapped with hours) */}
                                        {menuItems.length > 0 && (
                                            <div className="mb-3">
                                                <h3 className="text-xs font-bold uppercase tracking-widest text-black mb-1">
                                                    Menu
                                                    {activeLocation.lowestPrice != null && (
                                                        <span className="ml-2 text-amber-600">
                                                            from {formatPrice(activeLocation.lowestPrice)} €
                                                        </span>
                                                    )}
                                                </h3>
                                                <table className="w-full text-xs border-collapse">
                                                    <thead>
                                                        <tr className="border-b border-black/20 text-left text-black">
                                                            <th className="py-1 pr-2 font-semibold">Item</th>
                                                            <th className="py-1 pl-2 text-right font-semibold">Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {menuItems.map((item) => (
                                                            <tr
                                                                key={`${item.name}-${item.price}`}
                                                                className="border-b border-black/10"
                                                            >
                                                                <td className="py-1 pr-2 text-black">{item.name}</td>
                                                                <td className="py-1 pl-2 text-right whitespace-nowrap text-black">
                                                                    {formatPrice(item.price)} €
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* Opening hours as list (swapped with menu) */}
                                        {hourRows.length > 0 && (
                                            <div className="mb-3">
                                                <h3 className="text-xs font-bold uppercase tracking-widest text-black mb-1">
                                                    Opening Hours
                                                </h3>
                                                <ul className="text-sm leading-relaxed text-black">
                                                    {hourRows.map((row) => (
                                                        <li
                                                            key={row.day}
                                                            className="flex justify-between gap-4 border-b border-black/10 py-0.5"
                                                        >
                                                            <span className="font-medium">{DAY_LABELS[row.day] || row.day}</span>
                                                            <span className={row.hours === "Closed" ? "text-gray-500" : ""}>
                                                                {row.hours}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {detailLines.length > 0 && (
                                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-black">
                                                {detailLines.join("\n")}
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                            return (
                                <div className="flex items-center justify-center h-full border-t border-black/10">
                                    <p className="text-gray-400 text-xs uppercase tracking-widest italic">
                                        SELECT AN EVENT TO SEE DETAILS
                                    </p>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Report Menu Fix Modal */}
            {isReportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto">
                    <div className="relative w-full max-w-xl bg-[#fcfaee] border-4 border-black p-6 md:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] my-8">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b-4 border-black pb-4 mb-6">
                            <h2 className="text-2xl md:text-3xl font-black uppercase font-mono tracking-tight text-black flex items-center gap-2">
                                <span className="bg-sky-400 text-black px-2 py-1 border-2 border-black text-lg md:text-xl">FIX</span>
                                Report Menu Fix
                            </h2>
                            <button
                                onClick={closeReportModal}
                                className="p-2 border-2 border-black bg-white hover:bg-black hover:text-white transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {reportStatus === "success" ? (
                            <div className="space-y-4 font-mono text-sm text-black">
                                <p className="border-2 border-black bg-sky-400 px-3 py-2 font-bold uppercase">
                                    Report sent — thanks!
                                </p>
                                <p className="text-xs leading-relaxed">
                                    We&apos;ll review the new menu photo or price note and update the listing.
                                </p>
                                <button
                                    type="button"
                                    onClick={closeReportModal}
                                    className="px-5 py-3 border-2 border-black bg-white hover:bg-black hover:text-white transition-all font-bold text-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                                >
                                    Close
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleReportSubmit} className="space-y-5 font-mono text-xs">
                                <p className="text-xs text-black/70 leading-relaxed">
                                    Found wrong prices or a new menu? Upload photo(s) of the current menu
                                    and/or leave a short message.
                                </p>

                                <div className="flex flex-col gap-1">
                                    <label className="font-bold text-black uppercase tracking-wider">Place</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={reportForm.placeTitle}
                                            onChange={e => {
                                                const v = e.target.value;
                                                const exact = locations.find(l => l.title.toLowerCase() === v.trim().toLowerCase());
                                                setReportForm(prev => ({
                                                    ...prev,
                                                    placeTitle: v,
                                                    placeSlug: exact
                                                        ? exact.id.replace(/^(rest|bar|cafe)-/, "")
                                                        : "",
                                                }));
                                            }}
                                            placeholder="E.G. HAKIKI DÖNER NEUKÖLLN"
                                            className="w-full border-2 border-black p-3 bg-white text-black outline-none focus:bg-[#fffdf4] text-sm"
                                            autoComplete="off"
                                        />
                                        {placeSuggestions.length > 0 && (
                                            <ul className="absolute z-10 left-0 right-0 top-full mt-1 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-h-48 overflow-y-auto">
                                                {placeSuggestions.map(loc => (
                                                    <li key={loc.id}>
                                                        <button
                                                            type="button"
                                                            onClick={() => selectSuggestedPlace(loc)}
                                                            className="w-full text-left px-3 py-2 hover:bg-sky-400/30 flex flex-col gap-0.5"
                                                        >
                                                            <span className="font-bold text-black text-sm">{loc.title}</span>
                                                            <span className="text-[10px] uppercase text-black/50">
                                                                {[loc.mainCategory, loc.neighborhood].filter(Boolean).join(" · ") || loc.id}
                                                            </span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-black/50 uppercase">
                                        {reportForm.placeSlug
                                            ? `Linked: ${reportForm.placeSlug}`
                                            : "New place? Just type its name."}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="font-bold text-black uppercase tracking-wider">
                                        Menu photos (up to {MAX_REPORT_IMAGES})
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        multiple
                                        onChange={e => handleReportImagesChange(e.target.files)}
                                        className="border-2 border-black p-3 bg-white text-black outline-none text-sm file:mr-3 file:px-3 file:py-1 file:border-2 file:border-black file:bg-sky-400 file:text-black file:font-bold file:text-xs file:uppercase file:cursor-pointer"
                                    />
                                    {reportImagePreviews.length > 0 && (
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            {reportImagePreviews.map((src, i) => (
                                                <div key={i} className="border-2 border-black bg-white p-2">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={src}
                                                        alt={`Menu preview ${i + 1}`}
                                                        className="max-h-40 w-auto mx-auto object-contain"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleReportImageRemove(i)}
                                                        className="mt-1 text-[10px] font-bold uppercase text-rose-500 underline"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="font-bold text-black uppercase tracking-wider">
                                        Message / price update
                                    </label>
                                    <textarea
                                        value={reportForm.message}
                                        onChange={e => setReportForm(prev => ({ ...prev, message: e.target.value }))}
                                        placeholder="E.G. DÖNER IM BROT IS NOW 7.50€ — MENU PHOTO ATTACHED"
                                        rows={4}
                                        className="border-2 border-black p-3 bg-white text-black outline-none focus:bg-[#fffdf4] text-sm"
                                    />
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="font-bold text-black uppercase tracking-wider">
                                        Your email (optional)
                                    </label>
                                    <input
                                        type="email"
                                        value={reportForm.email}
                                        onChange={e => setReportForm(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder="YOU@EXAMPLE.COM"
                                        className="border-2 border-black p-3 bg-white text-black outline-none text-sm"
                                    />
                                </div>

                                {reportError && (
                                    <p className="border-2 border-black bg-rose-500 text-black px-3 py-2 font-bold uppercase">
                                        {reportError}
                                    </p>
                                )}

                                <div className="flex items-center justify-end gap-3 pt-4 border-t-2 border-black">
                                    <button
                                        type="button"
                                        onClick={closeReportModal}
                                        className="px-5 py-3 border-2 border-black bg-white hover:bg-black hover:text-white transition-all font-bold text-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={reportStatus === "sending"}
                                        className="px-5 py-3 border-2 border-black bg-sky-400 hover:bg-black hover:text-sky-400 hover:border-sky-400 transition-all font-bold text-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-60"
                                    >
                                        {reportStatus === "sending" ? "Sending…" : "Send Report"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}


