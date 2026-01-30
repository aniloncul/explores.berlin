"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function Navigation() {
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const links = [
        { href: "/", label: "Home" },
        { href: "/newsletter", label: "Newsletter" },
        { href: "/contact", label: "Contact" },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-zinc-800/50">
            <div className="w-full px-6 lg:px-12">
                <div className="flex items-center justify-between h-16">

                    {/* Logo - Left */}
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="relative">
                            <img
                                src="/nazli.jpg"
                                alt="Explores Berlin"
                                className="h-9 w-9 rounded-full object-cover ring-2 ring-zinc-700 group-hover:ring-rose-500 transition-all"
                            />
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-rose-500 rounded-full border-2 border-black" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-white font-bold text-lg tracking-tight leading-none">
                                EXPLORES
                            </span>
                            <span className="text-rose-500 text-[10px] font-medium tracking-[0.2em] uppercase">
                                Berlin
                            </span>
                        </div>
                    </Link>

                    {/* Desktop Menu - Right */}
                    <div className="hidden md:flex items-center gap-1">
                        {links.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`relative px-4 py-2 text-sm font-medium uppercase tracking-wider transition-all duration-200 ${isActive
                                        ? "text-white"
                                        : "text-zinc-400 hover:text-white"
                                        }`}
                                >
                                    {link.label}
                                    {isActive && (
                                        <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-rose-500 rounded-full" />
                                    )}
                                </Link>
                            );
                        })}
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
                    <div className="px-6 py-4 space-y-1">
                        {links.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`block px-4 py-3 text-sm font-medium uppercase tracking-wider transition-colors ${isActive
                                        ? "text-white bg-zinc-900 border-l-2 border-rose-500"
                                        : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                                        }`}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </nav>
    );
}
