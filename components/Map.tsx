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
                        return (
                            <AdvancedMarker
                                key={location.id}
                                position={location.coordinates}
                                zIndex={isHovered ? 50 : 10}
                                onMouseEnter={() => setHoveredId(location.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                onClick={() => setHoveredId(location.id)}
                            >
                                <div style={{
                                    transform: isHovered ? 'scale(1.5)' : 'scale(1)',
                                    transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                    cursor: 'pointer'
                                }}>
                                    <Pin
                                        background={isHovered ? "#222222" : "#FF5A5F"}
                                        borderColor={'#ffffff'}
                                        glyphColor={'#ffffff'}
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
