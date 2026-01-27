
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    try {
        // 1. Add contact to the main newsletter list (ID 2)
        // If contact doesn't exist, this creates it. If exists, it updates lists.
        const response = await fetch('https://api.brevo.com/v3/contacts', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                listIds: [2], // Main Newsletter List
                updateEnabled: true
            })
        });

        // 2. Redirect user to the confirmed page
        return NextResponse.redirect('https://explores-berlin.vercel.app/subscribe?verified=true');

    } catch (error) {
        console.error('Confirmation Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
