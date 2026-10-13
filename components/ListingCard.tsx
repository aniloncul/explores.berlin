"use client";

import { useState } from "react";
import { Location } from "@/types";
import { useMapStore } from "@/store/useMapStore";
import { ChevronLeft, ChevronRight, Martini } from "lucide-react";
import { twMerge } from "tailwind-merge";

interface ListingCardProps {
    location: Location;
}

const getBadgeColor = (text: string) => {
    const t = text.toLowerCase().replace(/[\[\]'"]/g, '');
    if (t === 'event') return "bg-blue-100 text-blue-700";
    if (t === 'restaurant' || t.includes('restaurant') || t.includes('kebab') || t.includes('döner') || t.includes('doner') || t.includes('turkish')) return "bg-orange-100 text-orange-700";
    if (t === 'bar') return "bg-pink-100 text-pink-700";
    if (t.includes('angebot') || t.includes('recommended')) return "bg-purple-100 text-purple-700";
    if (t.includes('+18')) return "bg-red-100 text-red-700";
    if (t.includes('cocktail') || t.includes('wine')) return "bg-amber-100 text-amber-700";
    if (t.includes('pub') || t.includes('beer') || t.includes('brew')) return "bg-lime-100 text-lime-700";
    if (t.includes('sport')) return "bg-cyan-100 text-cyan-700";
    if (t.includes('night') || t.includes('club')) return "bg-indigo-100 text-indigo-700";

    return "bg-gray-100 text-gray-700";
};

export default function ListingCard({ location }: ListingCardProps) {
    const { setHoveredId, hoveredId, selectedId, setSelectedId } = useMapStore();
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    const isHovered = hoveredId === location.id;
    const isSelected = selectedId === location.id;

    const nextImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setCurrentImageIndex((prev) => (prev + 1) % location.images.length);
    };

    const prevImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setCurrentImageIndex((prev) =>
            prev === 0 ? location.images.length - 1 : prev - 1
        );
    };

    const handleCardClick = () => {
        if (isSelected) {
            setSelectedId(null);
        } else {
            setSelectedId(location.id);
        }
    };

    return (
        <div
            className={twMerge(
                "group relative flex flex-col gap-3 rounded-none p-3 transition-all duration-300 border-2 cursor-pointer",
                isSelected
                    ? "border-purple-600 bg-purple-50"
                    : "border-transparent hover:border-black",
                isHovered && !isSelected ? "bg-gray-100" : ""
            )}
            onMouseEnter={() => setHoveredId(location.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={handleCardClick}
        >
            {isSelected && (
                <div className="absolute -top-3 -right-1 bg-purple-600 text-white px-2 py-1 text-[10px] font-bold uppercase border border-white shadow-[2px_2px_0px_0px_rgba(147,51,234,0.5)] z-20">
                    Selected
                </div>
            )}
            {/* Image Carousel */}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gray-200">
                {location.images.length > 0 ? (
                    <img
                        src={location.images[currentImageIndex]}
                        alt={location.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-violet-500/15 via-gray-100 to-pink-500/15">
                        <div className="flex flex-col items-center gap-2 text-violet-600">
                            <Martini className="w-10 h-10" />
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                                {location.subtype
                                    ? location.subtype.replace(/_/g, " ")
                                    : (location.mainCategory || "Bar")}
                            </span>
                        </div>
                    </div>
                )}

                {/* Removed duplicate Recommended badge - using only yellow corner badge */}

                {location.images.length > 1 && (
                    <>
                        <button
                            onClick={prevImage}
                            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 opacity-0 shadow-sm transition-opacity hover:bg-white group-hover:opacity-100 disabled:opacity-0 focus:outline-none focus:ring-2 focus:ring-black"
                            aria-label="Previous image"
                        >
                            <ChevronLeft className="h-4 w-4 text-black" />
                        </button>
                        <button
                            onClick={nextImage}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 opacity-0 shadow-sm transition-opacity hover:bg-white group-hover:opacity-100 disabled:opacity-0 focus:outline-none focus:ring-2 focus:ring-black"
                            aria-label="Next image"
                        >
                            <ChevronRight className="h-4 w-4 text-black" />
                        </button>
                        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                            {location.images.map((_, idx) => (
                                <div
                                    key={idx}
                                    className={twMerge(
                                        "h-1.5 w-1.5 rounded-full shadow-sm transition-all",
                                        idx === currentImageIndex
                                            ? "bg-white scale-110"
                                            : "bg-white/50 hover:bg-white/75"
                                    )}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Content */}
            <div className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-lg leading-tight text-[#b92626]">
                        {location.title}
                    </h3>
                    {location.subtype && (
                        <span className={twMerge(
                            "shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase border border-black font-mono",
                            getBadgeColor(location.subtype.replace(/_/g, " "))
                        )}>
                            {location.subtype.replace(/_/g, " ")}
                        </span>
                    )}
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">
                    {location.description}
                </p>

                <div className="mt-2 text-sm font-medium text-gray-900">

                </div>
                <p className="text-xs text-gray-400">
                    {location.address}
                </p>
            </div>
        </div>
    );
}
