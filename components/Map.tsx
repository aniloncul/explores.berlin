"use client";

import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { useMapStore } from "@/store/useMapStore";
import { Location } from "@/types";
import { Flag } from "lucide-react";
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
    const { hoveredId, setHoveredId } = useMapStore();
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
        <div className="h-full w-full bg-zinc-900 rounded-none overflow-hidden border-2 border-black dark:border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}>
                <Map
                    defaultCenter={defaultCenter}
                    defaultZoom={12}
                    mapId="a7eda2070fe64de989a69d7e"
                    className="h-full w-full"
                    gestureHandling={'greedy'}
                    disableDefaultUI={true}
                    onZoomChanged={(ev) => setZoom(ev.detail.zoom)}
                >
                    <MapUpdater locations={filteredLocations} onVisibleIdsChange={onVisibleIdsChange} />
                    {filteredLocations.map((location) => {
                        const isHovered = hoveredId === location.id;

                        // Determine Color - Using brighter, more visible colors with outline style
                        let strokeColor = "#6B7280"; // gray-500 default
                        const t = ((location.mainCategory || '') + ' ' + (location.tags || []).join(' ')).toLowerCase();

                        if (t.includes('nightlife') || t.includes('club')) strokeColor = "#EC4899"; // pink-500
                        else if (t.includes('culture') || t.includes('exhibition') || t.includes('ausstellung')) strokeColor = "#22D3EE"; // cyan-400
                        else if (t.includes('food') || t.includes('dining') || t.includes('essen')) strokeColor = "#F59E0B"; // amber-500
                        else if (t.includes('+18')) strokeColor = "#EF4444"; // red-500
                        else if (t.includes('shopping') || t.includes('market')) strokeColor = "#A3E635"; // lime-400
                        else if (t.includes('event') || t.includes('concert')) strokeColor = "#D946EF"; // fuchsia-500

                        return (
                            <AdvancedMarker
                                key={location.id}
                                position={location.coordinates}
                                zIndex={isHovered ? 50 : 10}
                                onMouseEnter={() => setHoveredId(location.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                onClick={() => setHoveredId(location.id)}
                            >
                                <div className="relative flex flex-col items-center">
                                    {isHovered && (
                                        <div className="absolute bottom-full mb-2 w-max max-w-[200px] bg-white dark:bg-zinc-800 text-black dark:text-white text-xs font-semibold px-2 py-1 rounded shadow-lg z-[60] pointer-events-none text-center">
                                            {location.title}
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white dark:border-t-zinc-800" />
                                        </div>
                                    )}
                                    <Flag
                                        className={`transition-all duration-300 ${isHovered ? `${hoverSize} z-50` : baseSize}`}
                                        style={{
                                            stroke: strokeColor,
                                            strokeWidth: isHovered ? 2.5 : 2,
                                            fill: 'none',
                                            filter: `drop-shadow(0 0 ${isHovered ? '6px' : '3px'} ${strokeColor})`
                                        }}
                                    />
                                </div>
                            </AdvancedMarker>
                        );
                    })}
                </Map>
            </APIProvider>
        </div>
    );
}
