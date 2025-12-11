export interface Location {
    id: string;
    title: string;
    category: string[];
    description: string;
    address: string;
    coordinates: {
        lat: number;
        lng: number;
    };
    startDate: string; // ISO date string
    endDate: string;   // ISO date string
    images: string[];
    highlight: boolean;
    mainCategory?: string;
    tags?: string[];
}
