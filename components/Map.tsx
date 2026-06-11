"use client";

import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { useMapStore } from "@/store/useMapStore";
import { Location } from "@/types";
import { 
    Music, 
    Utensils, 
    Martini, 
    Calendar, 
    Palette, 
    ShoppingBag, 
    MapPin,
    Coffee, 
    Camera,
    Sparkles
} from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useEffect, useState } from "react";

interface MapProps {
    filteredLocations: Location[];
    onVisibleIdsChange?: (ids: string[]) => void;
}

function MapUpdater({ locations, onVisibleIdsChange }: { locations: Location[], onVisibleIdsChange?: (ids: string[]) => void }) {
    const map = useMap();

    useEffect(() => {
        if (!map || !onVisibleIdsChange) return;

        const updateVisible = () => {
            const bounds = map.getBounds();
            if (!bounds) return;

            const visibleIds = locations
                .filter(loc => bounds.contains(loc.coordinates))
                .map(loc => loc.id);

            onVisibleIdsChange(visibleIds);
        };

        // Update on idle (end of pan/zoom) and when locations change
        const listener = map.addListener('idle', updateVisible);
        // Also run immediately in case bounds are already ready (or on location update)
        updateVisible();

        return () => {
            google.maps.event.removeListener(listener);
        };
    }, [map, locations, onVisibleIdsChange]);

    return null;
}

export default function MapComponent({ filteredLocations, onVisibleIdsChange }: MapProps) {
    const { hoveredId, setHoveredId, selectedId, setSelectedId } = useMapStore();
    const [zoom, setZoom] = useState(12);

    const defaultCenter = { lat: 52.490, lng: 13.39 };

    // Calculate base size based on zoom
    const getBaseSizeClass = () => {
        if (zoom >= 16) return "w-12 h-12";
        if (zoom >= 14) return "w-8 h-8";
        return "w-5 h-5";
    };

    const getHoverSizeClass = () => {
        if (zoom >= 16) return "w-16 h-16";
        if (zoom >= 14) return "w-12 h-12";
        return "w-8 h-8";
    };

    const baseSize = getBaseSizeClass();
    const hoverSize = getHoverSizeClass();

    return (
        <div className="h-full w-full bg-white rounded-none overflow-hidden border-2 border-black dark:border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}>
                <Map
                    defaultCenter={defaultCenter}
                    defaultZoom={12}
                    mapId="a7eda2070fe64de91bdd42e4"
                    className="h-full w-full"
                    gestureHandling={'greedy'}
                    disableDefaultUI={true}
                    onZoomChanged={(ev) => setZoom(ev.detail.zoom)}
                >
                    <MapUpdater locations={filteredLocations} onVisibleIdsChange={onVisibleIdsChange} />
                    {filteredLocations.map((location) => {
                        const isHovered = hoveredId === location.id;
                        const isSelected = selectedId === location.id;
                        const isActive = isHovered || isSelected;

                        // Determine Color & Icon based on categories and tags
                        let bgColor = "#6B7280"; // gray-500 default
                        let IconComponent = MapPin;
                        const t = ((location.mainCategory || '') + ' ' + (location.tags || []).join(' ') + ' ' + (location.category || []).join(' ')).toLowerCase();

                        if (t.includes('nightlife') || t.includes('club')) {
                            bgColor = "#EC4899"; // pink-500
                            IconComponent = Music;
                        } else if (t.includes('bar')) {
                            bgColor = "#8B5CF6"; // violet-500
                            IconComponent = Martini;
                        } else if (t.includes('culture') || t.includes('exhibition') || t.includes('ausstellung')) {
                            bgColor = "#06B6D4"; // cyan-500
                            IconComponent = Palette;
                        } else if (t.includes('food') || t.includes('dining') || t.includes('essen') || t.includes('restaurant')) {
                            bgColor = "#F59E0B"; // amber-500
                            IconComponent = Utensils;
                        } else if (t.includes('cafe') || t.includes('coffee')) {
                            bgColor = "#8B4513"; // brown
                            IconComponent = Coffee;
                        } else if (t.includes('+18')) {
                            bgColor = "#EF4444"; // red-500
                            IconComponent = Camera;
                        } else if (t.includes('shopping') || t.includes('market')) {
                            bgColor = "#84CC16"; // lime-500
                            IconComponent = ShoppingBag;
                        } else if (t.includes('event') || t.includes('concert')) {
                            bgColor = "#D946EF"; // fuchsia-500
                            IconComponent = Calendar;
                        }

                        return (
                            <AdvancedMarker
                                key={location.id}
                                position={location.coordinates}
                                zIndex={isActive ? 50 : 10}
                                onMouseEnter={() => setHoveredId(location.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                onClick={() => {
                                    if (isSelected) setSelectedId(null);
                                    else setSelectedId(location.id);
                                }}
                            >
                                <div className="relative flex flex-col items-center group cursor-pointer">
                                    {isActive && (
                                        <div className={twMerge(
                                            "absolute bottom-full mb-3 w-max max-w-[200px] text-white text-[10px] font-bold px-2 py-1 shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] z-[60] pointer-events-none text-center uppercase tracking-tighter",
                                            isSelected ? "bg-purple-600" : "bg-black"
                                        )}>
                                            {location.title}
                                            <div className={twMerge(
                                                "absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent",
                                                isSelected ? "border-t-purple-600" : "border-t-black"
                                            )} />
                                        </div>
                                    )}
                                    
                                    {/* Custom Pin Design */}
                                    <div 
                                        className={twMerge(
                                            "relative transition-all duration-300 ease-out flex items-center justify-center rounded-full border-2 shadow-lg",
                                            isSelected ? "border-purple-600 ring-2 ring-white" : "border-white",
                                            isActive ? "w-10 h-10 -translate-y-1 scale-110" : "w-7 h-7"
                                        )}
                                        style={{ 
                                            backgroundColor: isSelected ? "#9333ea" : bgColor,
                                            boxShadow: isActive ? `0 0 15px ${isSelected ? "#9333ea" : bgColor}` : '0 2px 4px rgba(0,0,0,0.3)'
                                        }}
                                    >
                                        <IconComponent 
                                            className={twMerge(
                                                "text-white transition-all",
                                                isActive ? "w-5 h-5" : "w-3.5 h-3.5"
                                            )} 
                                        />
                                        
                                        {/* Pin Tail */}
                                        <div 
                                            className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-t-[6px] border-x-[5px] border-x-transparent"
                                            style={{ borderTopColor: isSelected ? "#9333ea" : 'white' }}
                                        />
                                        <div 
                                            className="absolute top-full left-1/2 -translate-x-1/2 -mt-[5px] border-t-[4px] border-x-[4px] border-x-transparent"
                                            style={{ borderTopColor: isSelected ? "#9333ea" : bgColor }}
                                        />
                                    </div>
                                </div>
                            </AdvancedMarker>
                        );
                    })}
                </Map>
            </APIProvider>
        </div>
    );
}
