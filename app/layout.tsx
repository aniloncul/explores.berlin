import type { Metadata } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const pressStart2P = Press_Start_2P({
    weight: "400",
    subsets: ["latin"],
    variable: "--font-pixel"
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
            <body className={`${inter.className} ${pressStart2P.variable}`} suppressHydrationWarning>{children}</body>
        </html>
    );
}
