
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data } = await supabase.from('locations').select('main_category');
    const counts = {};
    if (data) {
        data.forEach(d => {
            const c = d.main_category;
            counts[c] = (counts[c] || 0) + 1;
        });
    }
    console.log("Categories in DB:", counts);
}

run();
