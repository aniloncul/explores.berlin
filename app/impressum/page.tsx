
import Link from "next/link";

export default function ImpressumPage() {
    return (
        <main className="flex min-h-screen w-full flex-col items-center justify-center bg-black px-4 py-12 text-zinc-300 font-goldman selection:bg-rose-500 selection:text-white">
            <div className="w-full max-w-2xl space-y-8">

                <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-white uppercase tracking-wider">Impressum</h1>
                    <p className="text-sm text-zinc-500">Legal Notice / Angaben gemäß § 5 TMG</p>
                </div>

                <div className="space-y-6 border-l-2 border-zinc-800 pl-6">

                    {/* Contact Info */}
                    <div className="space-y-2">
                        <h2 className="text-lg font-bold text-white">Contact Information</h2>
                        <div className="grid gap-1 text-sm">
                            <p className="font-bold text-white">Anıl Öncül</p>
                            <p>Musterstraße 1 (Adresinizi Buraya Yazın)</p>
                            <p>10000 Berlin</p>
                            <p>Germany</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-lg font-bold text-white">Contact</h2>
                        <div className="grid gap-1 text-sm">
                            <p>Email: aniloncul@gmail.com</p>
                            <p>Phone: +49 (0) 123 456789</p>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 text-xs text-zinc-500">
                        <p>
                            <strong>Responsible for content according to § 55 Abs. 2 RStV:</strong><br />
                            Anıl Öncül<br />
                            (Address same as above)
                        </p>
                        <p>
                            <strong>Dispute Resolution</strong><br />
                            The European Commission provides a platform for online dispute resolution (OS): https://ec.europa.eu/consumers/odr.<br />
                            We are not willing or obliged to participate in dispute resolution proceedings before a consumer arbitration board.
                        </p>
                    </div>

                </div>

                <div className="pt-8">
                    <Link href="/subscribe" className="text-rose-500 hover:text-white transition-colors text-sm">
                        &larr; Back to Subscription
                    </Link>
                </div>
            </div>
        </main>
    );
}
