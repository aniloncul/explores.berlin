
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function getRandomDate(start, daysRange) {
    const date = new Date(start);
    date.setDate(date.getDate() + Math.floor(Math.random() * daysRange));
    return date;
}

async function run() {
    console.log("Fetching locations...");
    const { data: locations, error } = await supabase.from('locations').select('id');

    if (error) {
        console.error("Error fetching locations:", error);
        return;
    }

    console.log(`Updating ${locations.length} locations with future dates...`);

    const today = new Date();
    // Base start date: Today minus 2 days to Today plus 5 days

    let success = 0;

    for (const loc of locations) {
        // Start date: Today (so it's active)
        const startDate = new Date();

        // End date: Random between Dec 20 2025 and Jan 12 2026
        const minEnd = new Date('2025-12-20');
        const maxEnd = new Date('2026-01-12');
        const range = maxEnd.getTime() - minEnd.getTime();
        const randomTime = Math.random() * range;
        const endDate = new Date(minEnd.getTime() + randomTime);

        const { error: updateError } = await supabase
            .from('locations')
            .update({
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString()
            })
            .eq('id', loc.id);

        if (!updateError) {
            success++;
            if (success % 20 === 0) process.stdout.write('.');
        } else {
            console.error(`Failed ${loc.id}:`, updateError.message);
        }
    }

    console.log(`\nUpdate complete. ${success} updated.`);
}

run();
