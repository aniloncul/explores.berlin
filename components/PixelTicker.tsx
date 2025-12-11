
import { twMerge } from "tailwind-merge";

interface PixelTickerProps {
    text: string;
    className?: string;
}

export default function PixelTicker({ text }: PixelTickerProps) {
    return (
        <div className="relative overflow-hidden w-full h-full flex items-center justify-end pointer-events-none select-none">
            {/* The moving container.
                 Using a simple marquee-like animation defined in globals CSS or inline style.
                 We want it to start from right (100%) and go towards left.
                 But "vanish when reaches Explores.Berlin".
                 The container in page.tsx will determine the bounds.
            */}
            <div className="animate-pixel-slide whitespace-nowrap absolute left-0">
                <span
                    className="font-pixel text-base md:text-lg text-red-600 uppercase tracking-widest leading-none"
                    style={{ textShadow: "3px 3px 0px #FACC15" }} // Slightly bigger shadow for bigger text
                >
                    {text}
                </span>
            </div>
        </div>
    );
}
