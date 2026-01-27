
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

        // Send Confirmation Email Manually (Bypassing DOI Validation)
        const confirmLink = `https://explores-berlin.vercel.app/api/confirm?email=${encodeURIComponent(email)}`;

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                to: [{ email: email }],
                templateId: 6, // Your Custom Design Template
                params: {
                    link: confirmLink // Simplified parameter name
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Brevo API Error:', errorData);
            return NextResponse.json({ error: 'Failed to send confirmation email' }, { status: response.status });
        }

        return NextResponse.json({ message: 'Confirmation email sent' }, { status: 200 });

    } catch (error) {
        console.error('Subscription API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
