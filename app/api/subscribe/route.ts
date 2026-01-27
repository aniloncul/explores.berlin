
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const apiKey = process.env.BREVO_API_KEY;

        if (!apiKey) {
            console.error('BREVO_API_KEY is not defined');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        // Send Double Opt-in Confirmation
        const response = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                includeListIds: [2], // Target list ID after confirmation
                templateId: 1, // Using Default DOI Template ID #1 to ensure it works
                redirectionUrl: 'https://explores-berlin.vercel.app/subscribe?verified=true' // Redirect here after clicking email
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            // If contact already exists/subscribed, Brevo might return 400.
            // We can check error code but for DOI flow, usually we just show "Check email"
            console.error('Brevo API Error:', errorData);
            return NextResponse.json({ error: 'Failed to initiate subscription' }, { status: response.status });
        }

        return NextResponse.json({ message: 'Confirmation email sent' }, { status: 200 });

    } catch (error) {
        console.error('Subscription API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
