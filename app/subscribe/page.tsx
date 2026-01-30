"use client";

import { useState, useEffect, Suspense } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function SubscribeContent() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error" | "exists" | "verified">("idle");
    const [errorMessage, setErrorMessage] = useState("");

    const searchParams = useSearchParams();

    useEffect(() => {
        if (searchParams.get('verified')) {
            setStatus('verified');
        }
    }, [searchParams]);

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email) return;

        setIsLoading(true);
        setStatus("idle");
        setErrorMessage("");

        try {
            const response = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (response.ok) {
                if (data.status === 'exists') {
                    setStatus("exists");
                } else {
                    setStatus("success");
                    setEmail("");
                }
            } else {
                throw new Error(data.error || "Subscription failed");
            }

        } catch (error: any) {
            console.error("Subscription error:", error);
            setStatus("error");
            setErrorMessage(error.message || "Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="flex min-h-screen w-full flex-col items-center justify-center bg-black px-4 py-8 text-white selection:bg-rose-500 selection:text-white font-goldman">

            {/* Background Effects */}
            <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black opacity-50" />
            <div className="absolute inset-0 z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150" />

            <div className="z-10 w-full max-w-md space-y-8 text-center">

                {/* Logo / Brand */}
                {/* Logo / Brand */}
                {/* Logo / Brand */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 flex flex-col items-center">

                    <div className="flex flex-col items-center justify-center mb-4">
                        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-center px-2 mb-2">
                            <span className="bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent font-goldman">
                                EXPLORES BERLIN
                            </span>
                        </h1>

                        {status !== "verified" && (
                            <div className="flex items-center justify-center">
                                {/* Left Bear - Faces Right (Default) */}
                                <img
                                    src="https://explores-berlin.vercel.app/rave-bear-black.png"
                                    alt="Bear Left"
                                    className="h-48 w-auto object-contain -mr-8"
                                />
                                {/* Right Bear - Faces Left (Flipped) */}
                                <img
                                    src="https://explores-berlin.vercel.app/rave-bear-black.png"
                                    alt="Bear Right"
                                    className="h-48 w-auto object-contain scale-x-[-1] -ml-8"
                                />
                            </div>
                        )}
                    </div>

                    {status !== "verified" && (
                        <p className="text-zinc-400 font-goldman text-sm">
                            The actual Berliner experience.<br />
                            <span className="text-rose-500/80">Discover the city's underground.</span>
                        </p>
                    )}
                </div>

                {/* Form Card */}
                <div className="relative overflow-hidden rounded-2xl border border-zinc-900 bg-[#0f0f0f] p-10 shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">

                    {status === "verified" ? (
                        <div className="flex flex-col items-start space-y-6 pb-2 text-left animate-in zoom-in duration-300">
                            {/* Hero Image - Flush with card edges using negative margins */}
                            <div className="-mx-6 -mt-6 mb-2 border-b border-zinc-800">
                                <img
                                    src="https://explores-berlin.vercel.app/newsletter/assets/welcome-header-neon.png"
                                    alt="Berlin Vibes"
                                    className="w-full h-auto object-cover"
                                />
                            </div>

                            <h2 className="text-2xl font-bold uppercase text-white font-goldman">
                                You represent the culture.
                            </h2>

                            <p className="text-zinc-300 text-base leading-relaxed font-goldman">
                                Thanks for subscribing. You’re now part of a community that looks beyond the Brandenburger Tor.
                            </p>

                            <div className="w-full space-y-3">
                                {[
                                    "Weekly curated guides (Thursday drops)",
                                    "Hidden bars & underground venues",
                                    "Sunday survival tips"
                                ].map((item, i) => (
                                    <div key={i} className="flex items-start gap-4">
                                        <span className="text-[#4deeea] font-bold text-lg leading-none mt-0.5 font-mono">x</span>
                                        <span className="text-zinc-400 text-sm font-goldman">{item}</span>
                                    </div>
                                ))}
                            </div>

                            <p className="text-zinc-500 text-xs uppercase tracking-wider font-goldman pt-2">
                                Explore our current map while waiting for the next drop.
                            </p>

                            <div className="flex justify-center w-full pt-2">
                                <Link
                                    href="/"
                                    className="inline-block border-[3px] border-white bg-white text-black px-8 py-3.5 text-base font-bold uppercase tracking-widest transition-all duration-300 hover:bg-transparent hover:text-white hover:border-[#4deeea] hover:shadow-[0_0_20px_rgba(77,238,234,0.6)] font-goldman rounded"
                                >
                                    Start Exploring
                                </Link>
                            </div>
                        </div>
                    ) : status === "success" ? (
                        <div className="flex flex-col items-center space-y-4 py-6 text-center animate-in zoom-in duration-300">
                            <div className="rounded-full bg-blue-500/10 p-3">
                                <CheckCircle2 className="h-8 w-8 text-blue-500" />
                            </div>
                            <h3 className="text-xl font-semibold text-white font-goldman">Check your email.</h3>
                            <p className="text-zinc-400 font-goldman">We sent you a confirmation link.<br />Click it to join the list.</p>
                            <button
                                onClick={() => setStatus("idle")}
                                className="mt-4 text-sm text-zinc-500 underline underline-offset-4 hover:text-white font-goldman"
                            >
                                Use a different email
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubscribe} className="space-y-4">
                            <div className="space-y-2 text-left">
                                <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 ml-1 font-goldman">
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full rounded-xl border border-zinc-800 bg-black/50 px-4 py-3.5 text-base text-white placeholder-zinc-600 outline-none transition-all focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:opacity-50 font-goldman"
                                    disabled={isLoading}
                                />
                                {/* Hint */}
                                <p className="text-[10px] text-zinc-600 pl-1 font-goldman">
                                    Weekly updates. No spam. Unsubscribe anytime.
                                </p>
                            </div>

                            {status === "error" && (
                                <div className="flex items-center gap-2 rounded-lg bg-red-950/30 px-3 py-2 text-sm text-red-400 font-goldman">
                                    <AlertCircle className="h-4 w-4" />
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            {status === "exists" && (
                                <div className="flex items-center gap-2 rounded-lg bg-orange-950/30 px-3 py-2 text-sm text-orange-400 font-goldman">
                                    <AlertCircle className="h-4 w-4" />
                                    <span>You are already subscribed!</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="group relative w-full overflow-hidden rounded-xl bg-white px-4 py-3.5 text-base font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 font-goldman tracking-widest"
                            >
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>JOINING...</span>
                                        </>
                                    ) : (
                                        "SUBSCRIBE"
                                    )}
                                </span>
                                {/* Hover Glow */}
                                <div className="absolute inset-0 -z-0 bg-gradient-to-r from-rose-500 to-orange-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                            </button>
                        </form>
                    )}
                </div>

                {/* Footer Links */}
                <div className="flex justify-center gap-6 text-xs font-medium text-zinc-600 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                    <Link href="/" className="hover:text-white transition-colors">Frontpage</Link>
                    <span>•</span>
                    <Link href="/impressum" className="hover:text-white transition-colors">Impressum</Link>
                    <span>•</span>
                    <Link href="https://instagram.com/explores.berlin" target="_blank" className="hover:text-white transition-colors">Instagram</Link>
                    <span>•</span>
                    <Link href="https://www.tiktok.com/@explores.berlin" target="_blank" className="hover:text-white transition-colors">TikTok</Link>
                </div>
            </div>
        </main>
    );
}

export default function SubscribePage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen w-full items-center justify-center bg-black text-white">Loading...</div>}>
            <SubscribeContent />
        </Suspense>
    );
}
