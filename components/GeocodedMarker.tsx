"use client";

import { useEffect, useState } from "react";
import { AdvancedMarker, useMapsLibrary } from "@vis.gl/react-google-maps";

interface GeocodedMarkerProps {
    address: string;
    children?: React.ReactNode;
    zIndex?: number;
    onClick?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

export default function GeocodedMarker({ address, children, ...markerProps }: GeocodedMarkerProps) {
    const geocodingLib = useMapsLibrary("geocoding");
    const [position, setPosition] = useState<google.maps.LatLngLiteral | null>(null);

    useEffect(() => {
        if (!geocodingLib || !address) return;

        const geocoder = new geocodingLib.Geocoder();
        geocoder.geocode({ address }, (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
            if (status === "OK" && results && results[0]) {
                const location = results[0].geometry.location;
                const pos = { lat: location.lat(), lng: location.lng() };
                setPosition(pos);
            } else {
                console.error("Geocoding failed for:", address, status);
            }
        });
    }, [geocodingLib, address]);

    if (!position) return null;

    return (
        <AdvancedMarker position={position} {...markerProps}>
            {children}
        </AdvancedMarker>
    );
}
