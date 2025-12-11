
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const csvData = `
David Bay,Event,['Tickets']
Close Enough . Perspectives by Women Photographers,Exhibition,[]
STELLA & THE LONGOS - Amour Propre Release Party,Event,['+18']
ORIGINS - eine immersive Reise zum Ursprung des Lebens,Exhibition,[]
10. Türchen: Ninja Cripsi Airfryer mit Hansefit,Event,['Angebot']
Hinterhöfe im historischen Berlin - Stadtführung,Event,[]
Street-Art & Graffiti Tour mit deinem Smartphone,Event,[]
Fun Facts Tour mit deinem Smartphone,Event,[]
Joachim Ringelnatz in Berlin Westend,Event,[]
David Bowies Leben in Berlin,Event,[]
Berliner Kiez-Geschichten: Brecht & Biermann,Event,[]
LGBTQIA* Winterdays,Event,['Angebot']
Auroras Magischer Würfel - Outdoor Escape für Familien,Event,['Family']
"Abenteuer Outdoor Escape ""Theodors Herausforderung""",Event,[]
Harry Potter und der Feuerkelch,Event,['Family']
Sssmile Afterhour,Event,['+18']
Outdoor Escape mit Glühwein-Stopp,Event,['+18']
RUN-N-RAVE,Event,[]
Samavarta - Outdoor Escape Game,Event,[]
Stadtrallye Berlin: Das Zeit-Verbrechen,Event,[]
Wochenmarkt am Bundesplatz,Dining,['Angebot']
Wochenmarkt am Richard Wagner Platz,Dining,['Angebot']
"planlos.in-Rätseltour ""Tanz auf dem Vulkan""",Event,[]
Zu Gast bei uns: Mission KI,Exhibition,[]
Die lebende Stadt,Exhibition,[]
Weihnachtsmarkt am KaDeWe,Event,['Angebot']
"planlos.in-Rätseltour ""Das Vermächtnis des Kaisers""",Event,[]
„Mission:Reflexion“ – Eine kritische Entdeckungsreise,Exhibition,[]
IKONO Berlin: Das Neue Immersive Erlebnis,Exhibition,[]
RESPIRATION. atelier le balto im Kunstgewerbemuseum,Exhibition,[]
Mode aus Paris. Schenkung Erika Hoffmann,Exhibition,[]
Rallye Roads – eine Entdeckungstour,Event,['Family']
VINCENT Zwischen Wahn und Wunder,Exhibition,[]
Interaktiv Abenteuer Minigolf,Event,['Family']
Bauernmarkt auf dem Wittenbergplatz,Dining,['Angebot']
Live Escape Room,Event,['Family']
Premium Zone Lasertag,Event,[]
Wochenmarkt am Hermannplatz,Dining,['Angebot']
OPEN ATELIER (DNA. CAFÉ),Exhibition,[]
Äthiopien '84/ 85. Hunger — Hilfe — Kalter Krieg,Exhibition,[]
Roads Not Taken. Oder: Es hätte auch anders kommen können,Exhibition,[]
Einhorn. Das Fabeltier in der Kunst,Exhibition,[]
Zeitreise ins alte Tiergartenviertel,Exhibition,[]
Grundstein Antike. Berlins erstes Museum,Exhibition,[]
Das Taufbecken von Siena,Exhibition,[]
Auf unbetretenen Wegen. Georg Schweinfurth,Exhibition,[]
Klartext: Zur Geschichte des Bode-Museums,Exhibition,[]
Petrit Halilaj. An Opera Out of Time,Exhibition,[]
Hommage an Vittore Carpaccio,Exhibition,[]
Annika Kahrs. OFF SCORE,Exhibition,[]
Delcy Morelos. Madre,Exhibition,[]
Madamme Tussauds Berlin,Exhibition,['Family']
The Scharf Collection Goya – Monet – Cézanne,Exhibition,[]
Toyin Ojih Odutola. U22 – Adijatu Straße,Exhibition,[]
Natur und deutsche Geschichte,Exhibition,[]
Die Weihnachtsgans Auguste,Event,['Family']
Hans im Glück,Event,['Family']
ORIGINS - eine immersive Reise (Tekrar),Exhibition,[]
Videopanorama - Geschichte des Ortes,Event,[]
Feliciano Lana. Die Geschichte der Weißen,Exhibition,[]
Beziehungsweise Familie,Exhibition,[]
Manatunga. Künstlerische Interventionen von George Nuku,Exhibition,[]
Sich verwandt machen,Exhibition,[]
Systemrelevant. Frauen in Herrscherfamilien,Exhibition,[]
An das wir uns festhalten,Exhibition,[]
Alles unter dem Himmel,Exhibition,[]
Weihnachtsmarkt am KaDeWe 2025,Event,['Angebot']
Holly Herndon & Mat Dryhurst – Starmirror,Exhibition,[]
Kazuko Miyamoto – String Constructions,Exhibition,[]
Rico Puhlmann. Fashion Photography 50s–90s,Exhibition,[]
Close Enough (Tekrar),Exhibition,[]
Isadora Romero . After Nature Prize 25,Exhibition,[]
Lisa Barnard . After Nature Prize 25,Exhibition,[]
Charmaine Poh: Make a travel deep of your inside,Exhibition,[]
LICHTAUS LICHTAN,Exhibition,[]
Konrad oder Das Kind aus der Konservenbüchse,Event,['Family']
Im Gespräch mit Geistern,Exhibition,[]
Weihnachtsmarkt und Winterwelt am Potsdamer Platz,Event,"['Angebot', 'Family']"
Spandauer Weihnachtsmarkt,Event,"['Angebot', 'Family']"
Weihnachtsmarkt auf dem Alexanderplatz,Event,"['Angebot', 'Family']"
Wintermarkt Schloßplatz Berlin Mitte,Event,"['Angebot', 'Family']"
Führung durch die Ausstellung ICONIC (Kinder <13 yasak),Exhibition,['+18']
BPA// Exhibition 2025,Exhibition,[]
Die Weihnachtsgans Auguste (Tekrar),Event,['Family']
Love Letters to the City,Exhibition,[]
Friendly Capitalism Lounge Vol. 22,Exhibition,[]
Vintage Y2K and 90s Market,Event,['Angebot']
Ökomarkt Kollwitzplatz,Dining,['Angebot']
Krimi-Trail Berlin Kreuzberg,Event,[]
Diane Arbus: Konstellationen,Exhibition,[]
I AM FLUX,Exhibition,[]
Rotation,Exhibition,[]
EBENHOLZ,Exhibition,[]
EXIL: KUNST OHNE GRENZEN,Exhibition,[]
Open Training (Intermediate),Event,[]
"Was bedeutet es für einen Ort, geliebt zu werden?",Exhibition,[]
Lichtenberger Winterzeit,Event,"['Angebot', 'Family']"
Zoomania 2,Event,['Family']
Winter-Film-Fest im Nikolaiviertel,Event,['Angebot']
fl'AIR Aerial Yoga,Event,[]
SWEAT BODY - DANCE AEROBICS,Event,[]
Eve Arnold. Capturing Compassion,Exhibition,[]
Weihnachtsmarkt am Schloss Charlottenburg,Event,"['Angebot', 'Family']"
Spandauer Winterland,Event,"['Angebot', 'Family']"
Eine Stunde Museum für Asiatische Kunst,Exhibition,[]
DESACTA,Exhibition,[]
Vintage Pop Up Mystery Boxes Weekend,Event,['Angebot']
Eisstockschießen im cassiopeia Sommergarten,Event,['Family']
Wicked: For Good,Event,['Family']
Bibi Blocksberg - Das große Hexentreffen,Event,['Family']
Der Held vom Bahnhof Friedrichstraße,Event,[]
Der Held vom Bahnhof Friedrichstraße,Event,[]
Weihnachten mit Bibi & Tina,Event,['Family']
Zoomania 2,Event,['Family']
Der Held vom Bahnhof Friedrichstraße,Event,[]
Der Held vom Bahnhof Friedrichstraße,Event,[]
Die drei ??? und die Salztote,Event,['Family']
EMIXAR II Berlin,Exhibition,[]
Weihnachtsmarkt im Winterquartier Berlin,Event,['Angebot']
Stromberg - Wieder alles wie immer,Event,[]
Piscolabis - Karmen Kraft & Pepita Glück,Exhibition,[]
Lucia Weihnachtsmarkt in der Kulturbrauerei,Event,"['Angebot', 'Family']"
Bibi Blocksberg - Das große Hexentreffen,Event,['Family']
Stiller,Event,[]
Lolita lesen in Teheran,Event,[]
Bibi Blocksberg - Das große Hexentreffen,Event,['Family']
"HOPFEN, SNACKS, WINTERMARKT",Dining,['Angebot']
Daily Martini Hour,Dining,['+18']
Eine Stunde Ethnologisches Museum,Exhibition,[]
Glühwald Berlin,Dining,['+18']
HEISSA HOLZMARKT WINTERFESTIVAL,Event,['Angebot']
Christmas Avenue Berlin,Event,['Angebot']
100 GRAMM Bar Nights,Event,['+18']
Martini Hour,Dining,['+18']
Angel's Egg,Event,[]
Im Schatten des Orangenbaums,Event,[]
Klitzekleines Abenteuer,Event,['Family']
Christmas Garden Berlin,Exhibition,['Family']
Skyline Berlin,Event,[]
Im Schatten des Orangenbaums,Event,[]
Zoomania 2,Event,['Family']
Sentimental Value,Event,[]
Open Lab Abend: Green AI,Event,[]
After Work Soli Fundraiser,Dining,['+18']
schau depot architektur modelle,Exhibition,[]
Humboldt Forum for Newbies (English),Exhibition,[]
Skyline Berlin,Event,[]
Bar der Kulturfabrik Moabit (Kicker & Billard),Dining,['+18']
Every Artist Must Take Sides,Exhibition,[]
Wake Up Dead Man: A Knives Out Mystery,Event,['+18']
Vulva Painting,Event,['+18']
Zoomania 2,Event,['Family']
All inclusive Weihnachtsmarkt am Spreespeicher,Event,['Angebot']
SOFT BODY SOUND MACHINE,Exhibition,[]
Vulva Painting,Event,['+18']
Im Rausch. Von Ekstase bis Erleuchtung,Exhibition,[]
THURSDAY GATHERING,Event,[]
Sentimental Value,Event,[]
Sentimental Value,Event,[]
Der Held vom Bahnhof Friedrichstraße,Event,[]
One Battle After Another,Event,[]
Dann passiert das Leben,Event,[]
Der Held vom Bahnhof Friedrichstraße,Event,[]
Der Held vom Bahnhof Friedrichstraße,Event,[]
One Battle After Another,Event,[]
Danke für nichts,Event,[]
tipBerlin Kiezgourmet - Nicht nur Weinachtliches,Dining,['Angebot']
Eddington,Event,[]
Sentimental Value,Event,[]
Sehnsucht in Sangerhausen,Event,[]
BREAK DANCE,Event,[]
Der Held vom Bahnhof Friedrichstraße,Event,[]
Stromberg - Wieder alles wie immer,Event,[]
Der Held vom Bahnhof Friedrichstraße,Event,[]
Bugonia,Event,[]
Mit Liebe und Chansons,Event,[]
Shibari Performance im THE KNAST,Event,['+18']
Afterwork Negroni im MANI,Dining,['+18']
Wicked: For Good,Event,['Family']
Expressive Painting Thursdays,Event,[]
Angelus,Event,[]
JUGAD pick-up football,Event,[]
Rasen,Event,[]
Intro To Aerial Silks,Event,[]
Queer Christmas Mini Market,Event,['Angebot']
Immersive Wall Painting - Adults Session,Event,['+18']
Eternity,Event,[]
4Wochen - Töpferkurs an der Drehscheibe,Event,[]
Finissage „Tutti Stutti“,Exhibition,[]
Amrum,Event,[]
Die My Love,Event,[]
MiRAGE - die orientalische Dinnershow,Event,['Tickets']
DRINK & DRAW: SKETCH EDITION,Event,[]
A Techno Ballet Odyssey,Event,['Tickets']
Peemöllers Heimat-Talk im DRIVE,Event,[]
Romeo und Julia – Liebe ist alles,Event,[]
Triosence live im Zig Zag Jazzclub,Event,['Tickets']
Das große Mix it! Finale,Event,[]
Live-Musik,Event,[]
"Festive, Fierce & Fabulous: A Christmas Cabaret",Event,['+18']
Book Club Pomeranze x BuchHafen,Event,[]
AUSVERKAUF(T) - LIN und YUNUS auf großer 1 € Tour,Event,['Angebot']
Aktzeichnen All-level (Kurze Posen),Event,['+18']
TWERK (open level),Event,['+18']
Halunke Comedy Open Mic (English),Event,[]
Kiezkonzert No. 7,Event,[]
Unconventional Speed Dating for Kinksters,Event,['+18']
pako peng Tour 2025,Event,['Tickets']
Voll Bingo! Feat. Bingo Brudis,Event,[]
Soda Social Club,Event,['+18']
Kalipo & T. Raumschmiere Live,Event,['Tickets']
Das perfekte Schlager Dinner,Dining,['Tickets']
PULSE,Event,[]
WARRIOR + DREAMER,Event,[]
The Toughest Row,Event,[]
O Magnum Mysterium,Event,[]
Punk Concert: Manolo Kabezabolo,Event,['Tickets']
HAYLEY REARDON,Event,[]
CAPELLA DE LA TORRE & KATHARINA BÄUML,Event,[]
Eternity,Event,[]
The New Design Museum,Event,[]
CAPELLA DE LA TORRE & KATHARINA BÄUML,Event,[]
The Rocky Horror Drag Show,Event,['+18']
Stromberg - Wieder alles wie immer,Event,[]
Rosenthal & Friends: »Cross Culture«,Event,[]
Fantômas,Event,[]
Leben im Liegen,Event,[]
Clever & Curious Charlottenburg! Quiz,Event,[]
Literaturabend von Pravda Kryvda,Event,[]
Quiz #67.2 @ Bar Degendorff,Dining,['+18']
Another Tune Vol. 1 feat. Katha Pauer,Event,[]
Süßer die Klöckner nie klingelt,Event,[]
WORDS TO LIFE - ART SHOW,Exhibition,[]
The Secret Agent,Event,[]
Der Held vom Bahnhof Friedrichstraße,Event,[]
Kurzfilmabend: Stille Kammern,Event,[]
Comedy meets Beats,Event,['+18']
One Battle After Another,Event,[]
Laughing Spree Comedy (FREE SHOTS),Event,"['+18', 'Free Entrance']"
Lolita lesen in Teheran,Event,[]
Phaidras Liebe,Event,[]
orbit - Tour 2025,Event,['Tickets']
Konzerthaus Kammerorchester,Event,[]
Bellmer & Friends,Event,['+18']
»Hör auf die Liebe«-Tour,Event,['Tickets']
Die Ades Zabel Company,Event,['+18']
"DU, ICH, ETC. MIT JOHANNA & SEBASTIAN",Event,[]
Lachkater Stand Up Comedy Show,Event,[]
REGGAETON DANCE CLASS,Event,[]
KUKURÍKU,Event,[]
Jens-Fietje Dwars Märchen,Event,['Family']
SIEGFRIED & JOY,Event,['Family']
Kreatur,Event,[]
Berliner Philharmoniker,Event,['Tickets']
Die Kunst zu Lieben (ENG),Event,[]
Vetrarsól 2025 - ÁRSTÍÐIR,Event,[]
Comedy Slam Berlin,Event,[]
CONNY - Manic Pixie Dreamboy 3 Tour,Event,['Tickets']
Working Title,Event,[]
Der Held vom Bahnhof Friedrichstraße,Event,[]
World Cuisine in Berlin,Dining,[]
A Techno Ballet Odyssey,Event,['Tickets']
Schillerkiez Mysterium,Event,[]
Alternative Stadtführung: Real-Talk in Neukölln,Event,[]
Das Universum zum Anfassen im Zeiss-Großplanetarium,Exhibition,['Family']
Rückenwind. Mehr Stadt fürs Rad!,Exhibition,[]
Der Treck – Fotografien einer Flucht 1945,Exhibition,[]
Street Art Tour App,Event,[]
YES TO ALL. Kupferstichkabinett,Exhibition,[]
Flucht. Fotografien von Frank Gaudlitz,Exhibition,[]
Detektiv-Trail Berlin: Entlang der Spree,Event,['Family']
On Water. WasserWissen in Berlin,Exhibition,[]
Dara Tûyê – Der Maulbeerbaum,Exhibition,[]
Ökomarkt Lützowstraße,Dining,['Angebot']
Humboldt Forum für Neugierige,Exhibition,[]
Weihnachtsmarkt an der Gedächtniskirche,Event,"['Angebot', 'Family']"
"planlos.in-Rätseltour ""Rennen um die Weltherrschaft""",Event,[]
Ligia Lewis: I’M NOT HERE FORRRRR…,Exhibition,[]
Europacity-Vibes-Weihnachtsmarkt,Event,"['Angebot', 'Family']"
Wie Netty Reiling zu Anna Seghers wurde,Exhibition,[]
Weihnachtsmarkt Berlin Schöneberg,Event,['Angebot']
`;

async function run() {
    console.log("Starting bulk update from CSV data...");

    // Split lines and parse CSV roughly
    // Regex for basic CSV parsing handling quotes
    // Note: The input format has Title, Main, Tags.
    // Tags are like "['a', 'b']".

    const lines = csvData.trim().split('\n');
    let success = 0;
    let failed = 0;

    // Fetch all current locations to match by Title (fuzzy or exact)
    const { data: dbLocs } = await supabase.from('locations').select('id, title');
    if (!dbLocs) {
        console.error("Could not fetch locations.");
        return;
    }

    console.log(`Loaded ${dbLocs.length} locations from DB.`);

    for (const line of lines) {
        // Parse CSV line
        // Simple regex to handle quoted strings containing matchers

        // Strategy: Match 3 parts. 
        // 1. Title (might be quoted)
        // 2. Main Category
        // 3. Tags (might be quoted)

        // Split by last 2 commas? Title can contain commas.
        // Let's iterate backwards.

        let rem = line.trim();
        const lastCommaObj = rem.lastIndexOf(',');
        if (lastCommaObj === -1) continue;

        let tagsRaw = rem.substring(lastCommaObj + 1);
        rem = rem.substring(0, lastCommaObj);

        const lastCommaCat = rem.lastIndexOf(',');
        if (lastCommaCat === -1) continue;

        let mainCat = rem.substring(lastCommaCat + 1);
        let titleRaw = rem.substring(0, lastCommaCat);

        // Clean up quotes
        if (titleRaw.startsWith('"') && titleRaw.endsWith('"')) {
            titleRaw = titleRaw.substring(1, titleRaw.length - 1).replace(/""/g, '"');
        }
        if (tagsRaw.startsWith('"') && tagsRaw.endsWith('"')) {
            tagsRaw = tagsRaw.substring(1, tagsRaw.length - 1).replace(/""/g, '"').replace(/'/g, '"'); // change single quotes to double for JSON parse?
        }

        // Parse Tags Array
        let tags = [];
        try {
            // "['a', 'b']" -> JSON: ["a", "b"]
            // Replace single quotes with double quotes for JSON parsing
            let jsonTags = tagsRaw.replace(/'/g, '"');
            tags = JSON.parse(jsonTags);
        } catch (e) {
            console.warn(`Error parsing tags for ${titleRaw}: ${tagsRaw}`);
            tags = [];
        }

        // Title Matching
        // Try strict match first, then startsWith or contains
        let match = dbLocs.find(l => l.title === titleRaw);
        if (!match) {
            // Try simplified title
            match = dbLocs.find(l => l.title.includes(titleRaw) || titleRaw.includes(l.title));
        }

        if (match) {
            const { error } = await supabase.from('locations').update({
                main_category: mainCat,
                tags: tags
            }).eq('id', match.id);

            if (!error) {
                success++;
                if (success % 10 === 0) process.stdout.write('.');
            } else {
                console.error(`DB Error for ${titleRaw}: ${error.message}`);
                failed++;
            }
        } else {
            // console.warn(`No match found for: ${titleRaw}`);
            failed++;
        }
    }

    console.log(`\nDone. Success: ${success}, Failed (No match): ${failed}`);
}

run();
