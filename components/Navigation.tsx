"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Sparkles } from "lucide-react";

interface NavigationProps {
    onReportMenuClick?: () => void;
    onAskAiClick?: () => void;
}

export default function Navigation({ onReportMenuClick, onAskAiClick }: NavigationProps) {
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-zinc-800/50">
            <div className="w-full px-6 lg:px-12">
                <div className="flex items-center justify-between h-16">

                    {/* Left: Home + Ask AI */}
                    <div className="flex items-center gap-3">
                        <Link
                            href="/"
                            className={`px-4 py-2 text-sm font-medium uppercase tracking-wider transition-all duration-200 border-2 ${
                                pathname === "/"
                                    ? "text-black bg-white border-white"
                                    : "text-zinc-400 border-zinc-700 hover:text-white hover:border-white"
                            }`}
                        >
                            Home
                        </Link>

                        {onAskAiClick && (
                            <button
                                onClick={onAskAiClick}
                                className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-neon text-black border-2 border-neon hover:bg-black hover:text-neon transition-all shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none font-mono"
                            >
                                <Sparkles className="w-4 h-4" />
                                Ask AI
                            </button>
                        )}
                    </div>

                    {/* Desktop Menu - Right */}
                    <div className="hidden md:flex items-center gap-4">
                        {onReportMenuClick && (
                            <button
                                onClick={onReportMenuClick}
                                className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-rose-500 text-black border-2 border-rose-500 hover:bg-black hover:text-rose-500 hover:border-rose-500 transition-all shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none font-mono"
                            >
                                Report Menu Fix
                            </button>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 text-zinc-400 hover:text-white transition-colors"
                    >
                        {mobileMenuOpen ? (
                            <X className="w-6 h-6" />
                        ) : (
                            <Menu className="w-6 h-6" />
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Dropdown */}
            {mobileMenuOpen && (
                <div className="md:hidden bg-black border-t border-zinc-800">
                    <div className="px-6 py-4 space-y-2">
                        <Link
                            href="/"
                            onClick={() => setMobileMenuOpen(false)}
                            className={`block px-4 py-3 text-sm font-medium uppercase tracking-wider transition-colors ${
                                pathname === "/"
                                    ? "text-white bg-zinc-900 border-l-2 border-rose-500"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                            }`}
                        >
                            Home
                        </Link>
                        
                        {onAskAiClick && (
                            <button
                                onClick={() => {
                                    setMobileMenuOpen(false);
                                    onAskAiClick();
                                }}
                                className="w-full text-left flex items-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wider text-black bg-neon border-l-2 border-neon font-mono"
                            >
                                <Sparkles className="w-4 h-4" />
                                Ask AI
                            </button>
                        )}

                        {onReportMenuClick && (
                            <button
                                onClick={() => {
                                    setMobileMenuOpen(false);
                                    onReportMenuClick();
                                }}
                                className="w-full text-left block px-4 py-3 text-sm font-bold uppercase tracking-wider text-rose-500 hover:text-white hover:bg-zinc-900 border-l-2 border-transparent hover:border-rose-500"
                            >
                                Report Menu Fix
                            </button>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}
