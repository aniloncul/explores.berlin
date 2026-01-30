"use client";

import Navigation from "@/components/Navigation";
import { Mail, Instagram } from "lucide-react";

export default function ContactPage() {
    return (
        <main className="min-h-screen bg-black">
            <Navigation />

            {/* Spacer for fixed nav */}
            <div className="h-16" />

            <div className="max-w-2xl mx-auto px-6 py-20">
                {/* Header */}
                <div className="text-center mb-16">
                    <h1 className="text-4xl font-bold text-white mb-4">
                        Get in Touch
                    </h1>
                    <p className="text-zinc-400">
                        Have a tip, want to collaborate, or just say hi? We'd love to hear from you.
                    </p>
                </div>

                {/* Contact Cards */}
                <div className="space-y-6">

                    {/* Email */}
                    <a
                        href="mailto:contact@explores-berlin.com"
                        className="flex items-center gap-6 p-6 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors group"
                    >
                        <div className="w-14 h-14 bg-zinc-800 rounded-full flex items-center justify-center group-hover:bg-rose-500 transition-colors">
                            <Mail className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p className="text-zinc-500 text-sm uppercase tracking-wider mb-1">Email</p>
                            <p className="text-white text-lg font-medium">contact@explores-berlin.com</p>
                        </div>
                    </a>

                    {/* Instagram */}
                    <a
                        href="https://instagram.com/explores.berlin"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-6 p-6 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors group"
                    >
                        <div className="w-14 h-14 bg-zinc-800 rounded-full flex items-center justify-center group-hover:bg-gradient-to-br group-hover:from-purple-500 group-hover:to-pink-500 transition-colors">
                            <Instagram className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p className="text-zinc-500 text-sm uppercase tracking-wider mb-1">Instagram</p>
                            <p className="text-white text-lg font-medium">@explores.berlin</p>
                        </div>
                    </a>

                    {/* Instagram Food */}
                    <a
                        href="https://www.instagram.com/explores.berlinfood/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-6 p-6 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors group"
                    >
                        <div className="w-14 h-14 bg-zinc-800 rounded-full flex items-center justify-center group-hover:bg-gradient-to-br group-hover:from-orange-500 group-hover:to-yellow-500 transition-colors">
                            <Instagram className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p className="text-zinc-500 text-sm uppercase tracking-wider mb-1">Instagram Food</p>
                            <p className="text-white text-lg font-medium">@explores.berlinfood</p>
                        </div>
                    </a>

                    {/* TikTok */}
                    <a
                        href="https://www.tiktok.com/@explores.berlin"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-6 p-6 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors group"
                    >
                        <div className="w-14 h-14 bg-zinc-800 rounded-full flex items-center justify-center group-hover:bg-black transition-colors">
                            {/* TikTok Icon (SVG) */}
                            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-zinc-500 text-sm uppercase tracking-wider mb-1">TikTok</p>
                            <p className="text-white text-lg font-medium">@explores.berlin</p>
                        </div>
                    </a>
                </div>
            </div>
        </main>
    );
}
