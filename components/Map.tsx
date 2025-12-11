"use client";

import { APIProvider, Map, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import { useMapStore } from "@/store/useMapStore";
import { Location } from "@/types";

interface MapProps {
    filteredLocations: Location[];
}

export default function MapComponent({ filteredLocations }: MapProps) {
    const { hoveredId, setHoveredId } = useMapStore();

    const defaultCenter = { lat: 52.490, lng: 13.39 };

    return (
        <div className="h-full w-full bg-gray-100 rounded-xl overflow-hidden">
            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}>
                <Map
                    defaultCenter={defaultCenter}
                    defaultZoom={12}
                    mapId="a7eda2070fe64de9f7bb5860"
                    className="h-full w-full"
                    gestureHandling={'greedy'}
                    disableDefaultUI={true}
                >
                    {filteredLocations.map((location) => {
                        const isHovered = hoveredId === location.id;

                        // Determine Color
                        let colorClass = "bg-gray-500";
                        const t = ((location.mainCategory || '') + ' ' + (location.tags || []).join(' ')).toLowerCase();

                        if (t.includes('exhibition') || t.includes('ausstellung')) colorClass = "bg-green-500";
                        else if (t.includes('dining') || t.includes('essen')) colorClass = "bg-orange-500";
                        else if (t.includes('+18')) colorClass = "bg-red-500";
                        else if (t.includes('angebot') || t.includes('recommended')) colorClass = "bg-purple-500";
                        else if (t.includes('event')) colorClass = "bg-blue-500";

                        return (
                            <AdvancedMarker
                                key={location.id}
                                position={location.coordinates}
                                zIndex={isHovered ? 50 : 10}
                                onMouseEnter={() => setHoveredId(location.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                onClick={() => setHoveredId(location.id)}
                            >
                                <div
                                    className={`w-3 h-3 rounded-full border border-white shadow-sm transition-all duration-300 ${colorClass} ${isHovered ? 'w-5 h-5 ring-2 ring-black z-50' : ''}`}
                                />
                            </AdvancedMarker>
                        );
                    })}
                </Map>
            </APIProvider>
        </div>
    );
}
