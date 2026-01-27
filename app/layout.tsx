import type { Metadata } from "next";
import { Inter, Press_Start_2P, Goldman } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const pressStart2P = Press_Start_2P({
    weight: "400",
    subsets: ["latin"],
    variable: "--font-pixel"
});
const goldman = Goldman({
    weight: ["400", "700"],
    subsets: ["latin"],
    variable: "--font-goldman"
});

export const metadata: Metadata = {
    title: "Explores.Berlin",
    description: "Curated map of Berlin's best spots",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${inter.className} ${pressStart2P.variable} ${goldman.variable}`} suppressHydrationWarning>{children}</body>
        </html>
    );
}
