const fs = require('fs');
const path = require('path');

const eventsFile = path.join(__dirname, 'events.json');
const indexFile = path.join(__dirname, 'index.html');

// Read events.json
const events = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));

// Helper function to format date for display (e.g., "11.09.2026")
function formatDate(isoString) {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

// Helper function to format time range for display (e.g., "07:30-08:15" or "07:30-8:15")
function formatTime(startIso, endIso) {
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    const startHour = String(startDate.getHours()).padStart(2, '0');
    const startMin = String(startDate.getMinutes()).padStart(2, '0');
    const endHour = String(endDate.getHours()).padStart(2, '0');
    const endMin = String(endDate.getMinutes()).padStart(2, '0');
    return `${startHour}:${startMin}-${endHour}:${endMin}`;
}

// 1. Generate Schema.org JSON-LD
const schemaData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": events.map((event, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
            "@type": "Event",
            "name": event.name,
            "startDate": event.startDate,
            "endDate": event.endDate,
            "eventStatus": "https://schema.org/EventScheduled",
            "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
            "location": {
                "@type": "Place",
                "name": event.locationName,
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": event.streetAddress,
                    "addressLocality": event.addressLocality,
                    "postalCode": event.postalCode,
                    "addressCountry": event.addressCountry
                }
            },
            "description": event.description,
            "organizer": {
                "@type": "Person",
                "name": event.organizer
            },
            "offers": {
                "@type": "Offer",
                "price": event.price,
                "priceCurrency": event.priceCurrency,
                "availability": "https://schema.org/InStock"
            }
        }
    }))
};

const schemaScriptContent = JSON.stringify(schemaData, null, 2);

// 2. Generate HTML markup for upcoming events
let htmlEventsContent = '';
events.forEach(event => {
    const dateStr = formatDate(event.startDate);
    const timeStr = formatTime(event.startDate, event.endDate);
    htmlEventsContent += `
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:shadow-sm transition-shadow">
                    <div>
                        <p class="font-bold text-gray-800 text-lg">${dateStr}</p>
                        <p class="text-gray-600">${timeStr}</p>
                    </div>
                    <div>
                        <span class="inline-block bg-pastel-green text-green-800 px-3 py-1 rounded-full text-sm font-semibold">${event.locationName}, ${event.addressLocality}</span>
                    </div>
                </div>`;
});

// Read index.html
let indexHtml = fs.readFileSync(indexFile, 'utf8');

// Replace Schema block using markers
const schemaRegex = /(<!-- START_EVENTS_SCHEMA -->)([\s\S]*?)(<!-- END_EVENTS_SCHEMA -->)/;
if (schemaRegex.test(indexHtml)) {
    indexHtml = indexHtml.replace(schemaRegex, `$1\n    <script type="application/ld+json">\n    ${schemaScriptContent}\n    </script>\n    $3`);
} else {
    console.error('Error: START_EVENTS_SCHEMA markers not found in index.html');
}

// Replace HTML events block using markers
const htmlRegex = /(<!-- START_EVENTS_HTML -->)([\s\S]*?)(<!-- END_EVENTS_HTML -->)/;
if (htmlRegex.test(indexHtml)) {
    indexHtml = indexHtml.replace(htmlRegex, `$1${htmlEventsContent}\n                <!-- Add more events here manually in the future or via generate.js -->\n            $3`);
} else {
    console.error('Error: START_EVENTS_HTML markers not found in index.html');
}

fs.writeFileSync(indexFile, indexHtml, 'utf8');
console.log('Successfully updated index.html from events.json!');
