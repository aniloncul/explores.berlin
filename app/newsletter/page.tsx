"use client";

import Link from "next/link";
import Navigation from "@/components/Navigation";

export default function NewsletterPage() {
    // Read the newsletter HTML content
    // Since we can't directly import HTML, we'll embed it or use an iframe approach

    return (
        <main className="min-h-screen bg-black">
            <Navigation />

            {/* Spacer for fixed nav */}
            <div className="h-16" />

            {/* Subscribe Banner */}
            <div className="bg-gradient-to-r from-rose-600 to-orange-500 py-4">
                <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
                    <p className="text-white font-medium">
                        Get the weekly newsletter delivered to your inbox
                    </p>
                    <Link
                        href="/subscribe"
                        className="bg-black text-white px-6 py-2 font-bold uppercase text-sm hover:bg-zinc-900 transition-colors"
                    >
                        Subscribe
                    </Link>
                </div>
            </div>

            {/* Newsletter Content */}
            <div className="max-w-[600px] mx-auto py-8">
                {/* Embedded Newsletter - Week 06 */}
                <article className="bg-[#050505] text-white font-goldman">

                    {/* Header */}
                    <div className="bg-black py-10 text-center">
                        <h1 className="text-5xl font-bold tracking-widest uppercase">
                            Explores Berlin
                        </h1>
                    </div>

                    {/* Navigation Links */}
                    <div className="bg-black py-4 text-center text-sm tracking-wider">
                        <span className="text-white mx-3">EVENTS</span> |
                        <span className="text-white mx-3">FOOD</span> |
                        <span className="text-white mx-3">EXHIBITIONS</span> |
                        <span className="text-white mx-3">CULTURE</span>
                    </div>

                    {/* Editor Intro */}
                    <div className="bg-[#0a0a0a] p-8 flex gap-6">
                        <div className="flex-shrink-0 text-center">
                            <img
                                src="https://explores-berlin.vercel.app/nazli.jpg"
                                alt="Editor"
                                className="w-20 h-20 rounded-full object-cover mx-auto"
                            />
                            <p className="text-zinc-500 text-sm mt-2">NAZLI</p>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold uppercase mb-4">
                                WEEK 06: INTO THE DUST
                            </h2>
                            <p className="text-zinc-400 text-sm leading-relaxed mb-3">
                                The winter fog has settled over the Spree, but the basements are hotter than ever.
                                This week, we saw the closure of a beloved Neukölln spot, but two new industrial
                                spaces just opened in Marzahn.
                            </p>
                            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                                This weekend is special. We have a rare b2b set at RSO and a 36-hour marathon
                                kicking off Friday. Check the full guide below.
                            </p>
                            <a href="#" className="text-white font-bold border-b border-rose-500">
                                READ FULL EDITORIAL →
                            </a>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-zinc-800" />

                    {/* Highlight Section */}
                    <div className="p-8">
                        <p className="text-rose-500 font-bold text-sm tracking-wider uppercase mb-6">
                            Don't Miss This
                        </p>
                        <a href="https://www.instagram.com/p/DTyY3HjiGRm/?img_index=1" target="_blank">
                            <img
                                src="https://explores-berlin.vercel.app/newsletter/2026_W06/weekend_guide.png"
                                alt="Weekend Guide"
                                className="w-full rounded border-2 border-rose-500 shadow-[0_0_15px_rgba(255,0,51,0.5)]"
                            />
                        </a>
                        <h3 className="text-2xl font-bold uppercase mt-6">
                            <a href="https://www.instagram.com/p/DTyY3HjiGRm/?img_index=1" target="_blank" className="text-white hover:text-rose-500 transition-colors">
                                The Ultimate Weekend Guide: Jan 30 - Feb 01
                            </a>
                        </h3>
                        <p className="text-zinc-500 text-sm mt-3">
                            Your comprehensive list of every open floor, timetable, and door policy for the upcoming 72 hours.
                        </p>
                    </div>

                    {/* Events Section */}
                    <div className="bg-[#080808] p-8">
                        <p className="text-rose-500 font-bold text-sm tracking-wider uppercase mb-6">
                            Weekly Recap (5 Events)
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Event 1 */}
                            <a href="https://www.instagram.com/p/DT8bvQ9CCod/" target="_blank" className="block group">
                                <img
                                    src="https://explores-berlin.vercel.app/newsletter/2026_W06/Event-3.png"
                                    alt="Event 1"
                                    className="w-full h-48 object-cover rounded group-hover:opacity-80 transition-opacity"
                                />
                                <p className="text-white font-bold mt-3 group-hover:text-rose-500 transition-colors">
                                    Wesserstraße: Berlin's Iconic Street to Go Out
                                </p>
                            </a>

                            {/* Event 2 */}
                            <a href="https://www.instagram.com/p/DTtdR7FCOA3/" target="_blank" className="block group">
                                <img
                                    src="https://explores-berlin.vercel.app/newsletter/2026_W06/Event-4.png"
                                    alt="Event 2"
                                    className="w-full h-48 object-cover rounded group-hover:opacity-80 transition-opacity"
                                />
                                <p className="text-white font-bold mt-3 group-hover:text-rose-500 transition-colors">
                                    Northen Lights of Berlin
                                </p>
                                <p className="text-zinc-600 text-sm">Saturday, 23:59</p>
                            </a>

                            {/* Event 3 */}
                            <a href="https://www.instagram.com/p/DT0Qm7KiBy1/" target="_blank" className="block group">
                                <img
                                    src="https://explores-berlin.vercel.app/newsletter/2026_W06/Event-5.png"
                                    alt="Event 3"
                                    className="w-full h-48 object-cover rounded group-hover:opacity-80 transition-opacity"
                                />
                                <p className="text-white font-bold mt-3 group-hover:text-rose-500 transition-colors">
                                    New Exhibition at Berghain Halle
                                </p>
                            </a>

                            {/* Event 4 */}
                            <a href="https://www.instagram.com/p/DUD9pEOCFl0/" target="_blank" className="block group">
                                <img
                                    src="https://explores-berlin.vercel.app/newsletter/2026_W06/Event-1.png"
                                    alt="Event 4"
                                    className="w-full h-48 object-cover rounded group-hover:opacity-80 transition-opacity"
                                />
                                <p className="text-white font-bold mt-3 group-hover:text-rose-500 transition-colors">
                                    Berlinale 2026 in the former E-Werk Techno Club
                                </p>
                            </a>

                            {/* Event 5 */}
                            <a href="https://www.instagram.com/p/DT_QqsYiOqu/" target="_blank" className="block group">
                                <img
                                    src="https://explores-berlin.vercel.app/newsletter/2026_W06/Event-2.png"
                                    alt="Event 5"
                                    className="w-full h-48 object-cover rounded group-hover:opacity-80 transition-opacity"
                                />
                                <p className="text-white font-bold mt-3 group-hover:text-rose-500 transition-colors">
                                    5 Club Nights 26 Jan - 1 Feb
                                </p>
                            </a>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-black border-t border-zinc-800 py-10 text-center">
                        <p className="text-zinc-600 text-xs uppercase tracking-wider">
                            © 2026 Explores Berlin
                        </p>
                        <div className="mt-4 text-zinc-600 text-xs">
                            <Link href="/subscribe" className="hover:text-white transition-colors">Subscribe</Link>
                            <span className="mx-2">|</span>
                            <Link href="/impressum" className="hover:text-white transition-colors">Impressum</Link>
                        </div>
                    </div>
                </article>
            </div>

            {/* Bottom Subscribe CTA */}
            <div className="bg-zinc-900 py-12 text-center">
                <h2 className="text-2xl font-bold text-white mb-4">
                    Never miss a beat in Berlin
                </h2>
                <p className="text-zinc-400 mb-6">
                    Join our weekly newsletter for the best events, food spots, and underground culture.
                </p>
                <Link
                    href="/subscribe"
                    className="inline-block bg-gradient-to-r from-rose-500 to-orange-500 text-white px-8 py-3 font-bold uppercase hover:opacity-90 transition-opacity"
                >
                    Subscribe Now
                </Link>
            </div>
        </main>
    );
}
