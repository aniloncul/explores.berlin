"use client";

import { useState } from "react";
import { Location } from "@/types";
import { useMapStore } from "@/store/useMapStore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { twMerge } from "tailwind-merge";

interface ListingCardProps {
    location: Location;
}

export default function ListingCard({ location }: ListingCardProps) {
    const { setHoveredId, hoveredId } = useMapStore();
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    const isHovered = hoveredId === location.id;

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

    return (
        <div
            className={twMerge(
                "group relative flex flex-col gap-3 rounded-xl p-3 transition-all duration-300",
                isHovered ? "bg-gray-100 dark:bg-zinc-800" : "hover:bg-gray-50 dark:hover:bg-zinc-800/50"
            )}
            onMouseEnter={() => setHoveredId(location.id)}
            onMouseLeave={() => setHoveredId(null)}
        >
            {/* Image Carousel */}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gray-200 dark:bg-zinc-700">
                <img
                    src={location.images[currentImageIndex]}
                    alt={location.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />

                {location.highlight && (
                    <div className="absolute left-3 top-3 z-10 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-black shadow-sm backdrop-blur-md">
                        Recommended
                    </div>
                )}

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
                <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-lg leading-tight text-gray-900 dark:text-white">
                        {location.title}
                    </h3>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 dark:text-gray-400">
                    {location.description}
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                    {location.mainCategory && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 font-medium">
                            {location.mainCategory}
                        </span>
                    )}
                    {(location.tags || []).map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300">
                            {tag}
                        </span>
                    ))}
                </div>
                <div className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-200">
                    {new Date(location.startDate).toLocaleDateString()} - {new Date(location.endDate).toLocaleDateString()}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    {location.address}
                </p>
            </div>
        </div>
    );
}
