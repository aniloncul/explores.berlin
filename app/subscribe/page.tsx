"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function SubscribePage() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error" | "exists">("idle");
    const [errorMessage, setErrorMessage] = useState("");

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
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-600 shadow-[0_0_40px_-5px_rgba(244,63,94,0.4)]" />
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                        <span className="bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
                            Explores.Berlin
                        </span>
                    </h1>
                    <p className="mt-2 text-zinc-400">
                        The unspoken guide to the city's underground.<br />
                        <span className="text-rose-500/80">Raves. Culture. Secrets.</span>
                    </p>
                </div>

                {/* Form Card */}
                <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">

                    {status === "success" ? (
                        <div className="flex flex-col items-center space-y-4 py-6 text-center animate-in zoom-in duration-300">
                            <div className="rounded-full bg-green-500/10 p-3">
                                <CheckCircle2 className="h-8 w-8 text-green-500" />
                            </div>
                            <h3 className="text-xl font-semibold text-white">You're on the list.</h3>
                            <p className="text-zinc-400">Keep an eye on your inbox. Things move fast in Berlin.</p>
                            <button
                                onClick={() => setStatus("idle")}
                                className="mt-4 text-sm text-zinc-500 underline underline-offset-4 hover:text-white"
                            >
                                Add another email
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubscribe} className="space-y-4">
                            <div className="space-y-2 text-left">
                                <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 ml-1">
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full rounded-xl border border-zinc-800 bg-black/50 px-4 py-3.5 text-base text-white placeholder-zinc-600 outline-none transition-all focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:opacity-50"
                                    disabled={isLoading}
                                />
                                {/* Hint so mobile keyboard doesn't hide input */}
                                <p className="text-[10px] text-zinc-600 pl-1">
                                    Weekly updates. No spam. Unsubscribe anytime.
                                </p>
                            </div>

                            {status === "error" && (
                                <div className="flex items-center gap-2 rounded-lg bg-red-950/30 px-3 py-2 text-sm text-red-400">
                                    <AlertCircle className="h-4 w-4" />
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            {status === "exists" && (
                                <div className="flex items-center gap-2 rounded-lg bg-orange-950/30 px-3 py-2 text-sm text-orange-400">
                                    <AlertCircle className="h-4 w-4" />
                                    <span>You are already subscribed!</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="group relative w-full overflow-hidden rounded-xl bg-white px-4 py-3.5 text-base font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
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
                    <Link href="https://instagram.com/exploresberlin" target="_blank" className="hover:text-white transition-colors">Instagram</Link>
                </div>
            </div>
        </main>
    );
}
