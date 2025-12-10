
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Config
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer Service Role Key for writing
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!GOOGLE_MAPS_API_KEY || !SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("Warning: SUPABASE_SERVICE_ROLE_KEY is missing. Writes might fail due to RLS.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Base URL provided by user
const BASE_SEARCH_URL = 'https://rausgegangen.de/en/eventsearch/?start_date__gte=2025-12-11&start_date__lte=2025-12-31&category=&city=berlin';

const monthMap = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Mär': '03', 'Apr': '04', 'May': '05', 'Mai': '05', 'Jun': '06',
    'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Okt': '10', 'Nov': '11', 'Dec': '12', 'Dez': '12'
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function geocode(address) {
    if (!address) return null;
    // Clean address: remove "| Berlin" suffix if present
    let cleanAddr = address.replace('| Berlin', '').trim();
    // Ensure "Berlin" is in the query
    if (!cleanAddr.toLowerCase().includes('berlin')) {
        cleanAddr += ", Berlin";
    }

    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanAddr)}&key=${GOOGLE_MAPS_API_KEY}`;
        const res = await axios.get(url);
        if (res.data.status === 'OK' && res.data.results.length > 0) {
            return res.data.results[0].geometry.location; // { lat, lng }
        } else {
            // console.log("Geocode returned " + res.data.status, cleanAddr);
        }
    } catch (e) {
        console.error(`Geocoding failed for ${address}:`, e.message);
    }
    return null;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    try {
        // Example: "Today, 11. Dez |" or "Tomorrow, 12. Dez |" or just "11. Dez |"
        // Remove "Today, " etc.
        // Regex to find "DD. MMM"
        const match = dateStr.match(/(\d{1,2})\.\s*([A-Za-zäüö]+)/);
        if (!match) return null;

        const day = match[1];
        const monthName = match[2];
        const month = monthMap[monthName] || monthMap[monthName.substring(0, 3)];

        if (!day || !month) return null;

        // Use query year if possible, else 2025 as per user URL
        // Or dynamic logic: content date is "Dec", current is "Dec 2024"? 
        // User URL says 2025-12-11. We will assume 2025.
        const year = 2025;

        return `${year}-${month}-${day.padStart(2, '0')}`;
    } catch (e) {
        return null;
    }
}

async function scrapePage(page) {
    const url = `${BASE_SEARCH_URL}&page=${page}`;
    console.log(`Fetching Page ${page}: ${url}`);

    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);
        const tiles = $('.tile-wide');

        if (tiles.length === 0) return false;

        console.log(` - Found ${tiles.length} events.`);

        const events = [];
        tiles.each((i, el) => {
            const $el = $(el);

            // Extract logic for Search Results (.tile-wide)
            const img = $el.find('a.aspect-video img').attr('src');
            const linkRel = $el.find('a.aspect-video').attr('href');
            const link = linkRel ? `https://rausgegangen.de${linkRel}` : null;

            const contentBlock = $el.find('a.flex-1'); // The right side
            const title = contentBlock.find('h4').text().trim();

            // Date is text within one of the divs
            // "Today, 11. Dez |"
            const dateStr = contentBlock.find('.text-sm.font-medium > div').first().text().trim();

            // Location
            const locationName = contentBlock.find('.text-sm.opacity-70').first().text().trim();

            const category = contentBlock.find('.event-text-pill-outline').text().trim();

            if (title && link) {
                events.push({ title, link, img, dateStr, locationName, category });
            }
        });

        for (const ev of events) {
            const startDate = parseDate(ev.dateStr);
            if (!startDate) continue;

            // Optional: Skip execution if exists? Upsert handles it.

            process.stdout.write(`   Processing: ${ev.title.substring(0, 30)}... `);

            const coords = await geocode(ev.locationName);
            if (!coords) {
                console.log("[No Coords]");
                continue;
            }

            const { error } = await supabase.from('locations').upsert({
                id: ev.link,
                title: ev.title,
                category: [ev.category || 'Event'],
                description: 'Imported from Rausgegangen',
                address: ev.locationName,
                lat: coords.lat,
                lng: coords.lng,
                start_date: startDate,
                end_date: startDate,
                images: ev.img ? [ev.img] : [],
                highlight: false
            });

            if (error) console.log(`[DB Error: ${error.message}]`);
            else console.log("[Saved]");

            // Be nice to API limits
            await delay(100);
        }

        return true;
    } catch (e) {
        console.error("Page fetch error:", e.message);
        return false;
    }
}

async function run() {
    let page = 1;
    let keepGoing = true;

    while (keepGoing && page <= 20) { // Safety limit 20 pages
        keepGoing = await scrapePage(page);
        page++;
        await delay(1000); // Wait 1s between pages
    }
    console.log("Done.");
}

run();
