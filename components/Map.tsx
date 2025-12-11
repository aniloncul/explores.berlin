"use client";

import { APIProvider, Map, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import { useMapStore } from "@/store/useMapStore";
import { Location } from "@/types";
import { Flag } from "lucide-react";

interface MapProps {
    filteredLocations: Location[];
}

export default function MapComponent({ filteredLocations }: MapProps) {
    const { hoveredId, setHoveredId } = useMapStore();

    const defaultCenter = { lat: 52.490, lng: 13.39 };

    return (
        <div className="h-full w-full bg-zinc-900 rounded-xl overflow-hidden">
            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}>
                <Map
                    defaultCenter={defaultCenter}
                    defaultZoom={12}
                    mapId="a7eda2070fe64de989a69d7e"
                    className="h-full w-full"
                    gestureHandling={'greedy'}
                    disableDefaultUI={true}
                >
                    {filteredLocations.map((location) => {
                        const isHovered = hoveredId === location.id;

                        // Determine Color
                        let colorClass = "text-gray-500 fill-gray-500";
                        const t = ((location.mainCategory || '') + ' ' + (location.tags || []).join(' ')).toLowerCase();

                        if (t.includes('exhibition') || t.includes('ausstellung')) colorClass = "text-green-500 fill-green-500";
                        else if (t.includes('dining') || t.includes('essen')) colorClass = "text-orange-500 fill-orange-500";
                        else if (t.includes('+18')) colorClass = "text-red-500 fill-red-500";
                        else if (t.includes('angebot') || t.includes('recommended')) colorClass = "text-purple-500 fill-purple-500";
                        else if (t.includes('event')) colorClass = "text-blue-500 fill-blue-500";

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
                                        className={`w-5 h-5 transition-all duration-300 drop-shadow-sm ${colorClass} ${isHovered ? 'w-8 h-8 drop-shadow-md z-50' : ''}`}
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
