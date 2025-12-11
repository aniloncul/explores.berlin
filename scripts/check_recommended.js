
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await supabase
        .from('locations')
        .select('id, title, main_category, tags');

    if (error) {
        console.error(error);
        return;
    }

    const recommended = data.filter(l =>
        l.main_category === 'Recommended' ||
        (l.tags && l.tags.includes('Recommended'))
    );

    console.log(`Total Locations: ${data.length}`);
    console.log(`Recommended Locations: ${recommended.length}`);
    if (recommended.length > 0) {
        console.log("Example Recommended:", recommended[0]);
    } else {
        console.log("No recommended locations found. The border logic won't trigger.");
    }
}

run();
