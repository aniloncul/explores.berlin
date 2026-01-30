const mjml = require('mjml');
const fs = require('fs');
const path = require('path');

// ============================================
// NEWSLETTER GENERATOR
// Usage: node generate.js week-05
// ============================================

const weekArg = process.argv[2] || 'week-05';
const dataPath = path.join(__dirname, 'data', `${weekArg}.json`);

if (!fs.existsSync(dataPath)) {
    console.error(`❌ Data file not found: ${dataPath}`);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Generate event cards HTML
function generateEventCards(events) {
    let html = '';

    // Process events in pairs (2 per row)
    for (let i = 0; i < events.length; i += 2) {
        html += `
    <mj-section padding="0 10px 20px 10px" background-color="#080808">`;

        // First event in row
        html += generateEventColumn(events[i], i + 1);

        // Second event in row (if exists)
        if (events[i + 1]) {
            html += generateEventColumn(events[i + 1], i + 2);
        }

        html += `
    </mj-section>`;
    }

    return html;
}

function generateEventColumn(event, index) {
    return `
      <mj-column width="50%" padding="10px">
        <mj-image 
            src="${event.image}" 
            alt="Event ${index}"
            href="${event.link}"
            height="200px"
            object-fit="cover"
            border-radius="4px"
        ></mj-image>
        <mj-text font-size="16px" font-weight="bold" padding-top="15px">
           <a href="${event.link}" style="color:#ffffff;">${event.title}</a>
        </mj-text>
        <mj-text color="#666" font-size="12px" padding-top="5px">
            ${event.date || ''}
        </mj-text>
      </mj-column>`;
}

// Generate intro paragraphs
function generateIntro(introArray) {
    return introArray.map(text => `
        <mj-text color="#cccccc" font-size="14px" padding-top="10px">
          ${text}
        </mj-text>`).join('');
}

// Build the full MJML
const mjmlContent = `
<mjml>
  <mj-head>
    <mj-title>Explores Berlin - Week ${data.week}</mj-title>
    <mj-font name="Goldman" href="https://fonts.googleapis.com/css2?family=Goldman:wght@400;700&display=swap" />
    <mj-attributes>
      <mj-all font-family="'Goldman', 'Courier New', 'Lucida Console', monospace" padding="0px"></mj-all>
      <mj-text font-weight="400" font-size="14px" color="#ffffff" line-height="24px"></mj-text>
      <mj-button background-color="#ffffff" color="#000000" font-weight="bold" text-transform="uppercase"></mj-button>
    </mj-attributes>
    <mj-style>
      .title-text { text-transform: uppercase; letter-spacing: 4px; }
      .highlight-img img { border: 2px solid #ff0033; box-shadow: 0 0 15px rgba(255, 0, 51, 0.5); }
      a { color: #ff0033; text-decoration: none; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#050505">
    
    <!-- HEADER -->
    <mj-section padding="40px 0 20px 0" background-color="#000000">
      <mj-column>
        <mj-text align="center" font-size="52px" font-weight="700" color="#ffffff" css-class="title-text" line-height="1">
          Explores Berlin
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- Navigation -->
    <mj-section padding="10px 0 40px 0" background-color="#000000">
      <mj-column>
        <mj-text align="center" font-size="12px" letter-spacing="2px">
          <a href="#" style="color:#fff; margin:0 10px;">EVENTS</a> |
          <a href="#" style="color:#fff; margin:0 10px;">FOOD</a> |
          <a href="#" style="color:#fff; margin:0 10px;">EXHIBITIONS</a> |
          <a href="#" style="color:#fff; margin:0 10px;">CULTURE</a>
        </mj-text>
      </mj-column>
    </mj-section>
    
    <!-- EDITOR INTRO -->
    <mj-section background-color="#0a0a0a" padding="40px 20px">
      <mj-column width="25%">
         <mj-image width="80px" border-radius="50%" src="${data.editor.image}" alt="Editor"></mj-image>
         <mj-text align="center" font-size="12px" color="#666" padding-top="10px">
           ${data.editor.name}
         </mj-text>
      </mj-column>
      <mj-column width="75%">
        <mj-text font-size="24px" font-weight="700" color="#ffffff" text-transform="uppercase" padding-bottom="15px">
           WEEK ${data.week}: ${data.title}
        </mj-text>
        ${generateIntro(data.intro)}
        <mj-text padding-top="15px">
           <a href="#" style="font-weight:bold; border-bottom:1px solid #ff0033;">READ FULL EDITORIAL &rarr;</a>
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- DIVIDER -->
    <mj-section padding="0">
        <mj-column>
             <mj-divider border-color="#222" border-width="1px"></mj-divider>
        </mj-column>
    </mj-section>

    <!-- HIGHLIGHT -->
    <mj-section padding="40px 20px 10px 20px">
        <mj-column>
            <mj-text color="#ff0033" font-weight="bold" font-size="14px" letter-spacing="1px" padding-bottom="20px" text-transform="uppercase">
                Don't Miss This
            </mj-text>
        </mj-column>
    </mj-section>

    <mj-section padding="0 20px 40px 20px">
      <mj-column>
        <mj-image 
            src="${data.highlight.image}" 
            alt="Weekend Guide Highlight" 
            href="${data.highlight.link}"
            css-class="highlight-img"
            border-radius="4px"
        ></mj-image>
        
        <mj-text align="left" font-size="28px" font-weight="700" padding-top="20px" text-transform="uppercase">
          <a href="${data.highlight.link}" style="color:#fff; text-decoration:none;">
            ${data.highlight.title}
          </a>
        </mj-text>
        <mj-text color="#888" padding-top="10px">
            ${data.highlight.description}
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- EVENTS SECTION HEADER -->
    <mj-section padding="20px 20px 10px 20px" background-color="#080808">
        <mj-column>
             <mj-text color="#ff0033" font-weight="bold" font-size="14px" letter-spacing="1px" padding-bottom="10px" text-transform="uppercase">
                Weekly Recap (${data.events.length} Events)
            </mj-text>
        </mj-column>
    </mj-section>

    <!-- DYNAMIC EVENTS -->
    ${generateEventCards(data.events)}

    <!-- Footer -->
    <mj-section background-color="#000000" padding="40px 20px" border-top="1px solid #222">
      <mj-column>
        <mj-text align="center" color="#444444" font-size="10px" text-transform="uppercase" font-family="monospace">
          © ${data.year} Explores Berlin<br><br>
          <a href="{{{ unsubscribe }}}" style="color:#666; text-decoration:none;">Unsubscribe</a> &nbsp;|&nbsp; 
          <a href="{{{ mirror }}}" style="color:#666; text-decoration:none;">View in Browser</a> &nbsp;|&nbsp; 
          <a href="https://explores-berlin.vercel.app/impressum" style="color:#666; text-decoration:none;">Impressum</a>
        </mj-text>
      </mj-column>
    </mj-section>
    
  </mj-body>
</mjml>
`;

// Compile MJML to HTML
const { html, errors } = mjml(mjmlContent, { validationLevel: 'soft' });

if (errors.length > 0) {
    console.warn('⚠️  MJML Warnings:');
    errors.forEach(e => console.warn(`   - ${e.message}`));
}

// Save output
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, `${weekArg}.html`);
fs.writeFileSync(outputPath, html);

console.log(`✅ Newsletter generated: ${outputPath}`);
console.log(`   Events: ${data.events.length}`);
console.log(`   Week: ${data.week} - ${data.title}`);
