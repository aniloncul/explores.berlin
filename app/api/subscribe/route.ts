
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

        // Add contact to Brevo
        const response = await fetch('https://api.brevo.com/v3/contacts', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                updateEnabled: true, // Update if exists
                // listIds: [2] // Optional: Add to specific list ID if you have created one in Brevo
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            // If contact already exists, we consider it a success (or handle specifically)
            if (errorData.code === 'duplicate_parameter') {
                return NextResponse.json({ message: 'Contact already exists', status: 'exists' }, { status: 200 });
            }
            console.error('Brevo API Error:', errorData);
            return NextResponse.json({ error: 'Failed to add to newsletter' }, { status: response.status });
        }

        return NextResponse.json({ message: 'Successfully subscribed' }, { status: 200 });

    } catch (error) {
        console.error('Subscription API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
