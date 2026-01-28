
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
        // 1. Add contact to the main newsletter list (ID 2)
        const response = await fetch('https://api.brevo.com/v3/contacts', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                listIds: [3], // Add to Main List
                unlinkListIds: [2], // Remove from Temporary List
                updateEnabled: true, // Update if exists
                emailBlacklisted: false // Unsubscribe them from blacklist if they are re-subscribing
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Brevo Contact Creation Error:', errorData);
            // Redirect to an error state so the user knows something went wrong
            return NextResponse.redirect('https://explores-berlin.vercel.app/subscribe?verified=false');
        }

        // 2. Redirect user to the confirmed page
        return NextResponse.redirect('https://explores-berlin.vercel.app/subscribe?verified=true');

    } catch (error) {
        console.error('Confirmation Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
