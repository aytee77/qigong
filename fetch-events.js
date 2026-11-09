'use strict';

/**
 * Fetches upcoming Qigong events from the public Google Calendar iCal feed and
 * writes them to events.json (the file consumed by generate.js).
 *
 * Run with:  npm run fetch   (or `npm run update` to also regenerate index.html)
 */

const fs = require('fs');
const path = require('path');
const ical = require('node-ical');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CONFIG = {
    // Public iCal feed of the Google Calendar (no authentication needed while
    // the calendar is shared publicly).
    icsUrl:
        'https://calendar.google.com/calendar/ical/vereinhochneun%40gmail.com/public/basic.ics',

    // Keep only events whose title matches this (case-insensitive). Matches
    // "Qi Gong …", "Qi-Gong …" and "Qigong …".
    includePattern: /qi[\s-]?gong/i,

    // Drop events whose title matches any of these, even if they matched the
    // include pattern above (e.g. room rentals that merely mention Qi-Gong).
    excludePatterns: [/basteln/i, /\bmiete\b/i, /\bzahlt\b/i, /sitzung/i, /vorstand/i],

    // How far into the future to look for events …
    horizonDays: 400,
    // … and how many upcoming events to publish to the website.
    maxEvents: 7,

    // Static details applied to every Qigong event.
    location: {
        locationName: 'Schopf',
        streetAddress: 'Altstetterstrasse 334',
        addressLocality: 'Zürich',
        postalCode: '8047',
        addressCountry: 'CH',
    },
    description:
        'Gemeinsames Qigong praktizieren (Acht Brokate). Kostenlos (Kollekte) und ohne Anmeldung.',
    organizer: 'Timo',
    price: '0',
    priceCurrency: 'CHF',

    // Fallback timezone if a calendar entry carries no TZID.
    timezone: 'Europe/Zurich',
};

const eventsFile = path.join(__dirname, 'events.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unwrap an iCal property that may be a plain string or a { params, val } object. */
function text(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value.val === 'string') return value.val;
    return '';
}

/** True if a calendar event title identifies a Qigong session we care about. */
function isQigong(summary) {
    if (!summary) return false;
    if (!CONFIG.includePattern.test(summary)) return false;
    if (CONFIG.excludePatterns.some((re) => re.test(summary))) return false;
    return true;
}

/**
 * Format a Date as an ISO-8601 string carrying the UTC offset of the given
 * IANA timezone, e.g. "2026-11-13T09:00:00+01:00" (DST aware).
 */
function toZonedIso(date, timeZone) {
    const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));

    const asUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
    );
    const offsetMinutes = Math.round((asUtc - date.getTime()) / 60000);
    const sign = offsetMinutes < 0 ? '-' : '+';
    const abs = Math.abs(offsetMinutes);
    const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(
        abs % 60
    ).padStart(2, '0')}`;

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/**
 * Expand a single VEVENT (recurring or not) into concrete occurrences within
 * [from, to]. EXDATEs supplied by the calendar are honoured, and any occurrence
 * times listed in `skip` (RECURRENCE-ID overrides) are dropped.
 *
 * @returns {{start: Date, end: Date}[]}
 */
function expand(component, from, to, skip) {
    const excluded = new Set(skip || []);
    if (component.exdate) {
        for (const date of Object.values(component.exdate)) {
            if (date instanceof Date) excluded.add(date.getTime());
        }
    }

    if (!component.rrule) {
        return [{ start: component.start, end: component.end }];
    }

    const durationMs = component.end.getTime() - component.start.getTime();
    const occurrences = component.rrule.between(from, to, true);
    const result = [];
    for (const start of occurrences) {
        if (excluded.has(start.getTime())) continue;
        result.push({ start, end: new Date(start.getTime() + durationMs) });
    }
    return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    console.log(`Fetching calendar: ${CONFIG.icsUrl}`);
    const data = await ical.async.fromURL(CONFIG.icsUrl, {
        headers: { 'user-agent': 'qigong-site-event-sync/1.0' },
    });

    const components = Object.values(data).filter((c) => c && c.type === 'VEVENT');

    const from = new Date();
    const to = new Date(Date.now() + CONFIG.horizonDays * 24 * 60 * 60 * 1000);

    // Collect RECURRENCE-ID override times per UID so the recurring master does
    // not also emit those occurrences.
    const overrides = new Map();
    for (const c of components) {
        if (c.uid && c.recurrenceid instanceof Date) {
            if (!overrides.has(c.uid)) overrides.set(c.uid, new Set());
            overrides.get(c.uid).add(c.recurrenceid.getTime());
        }
    }

    const events = [];
    for (const c of components) {
        if (c.status === 'CANCELLED') continue;
        if (c.start && c.start.dateOnly) continue; // skip all-day events

        const summary = text(c.summary);
        if (!isQigong(summary)) continue;

        const skip = overrides.has(c.uid) ? [...overrides.get(c.uid)] : [];
        for (const { start, end } of expand(c, from, to, skip)) {
            if (!(start instanceof Date) || !(end instanceof Date)) continue;
            if (end <= from) continue; // drop events that already finished

            const tz = start.tz || CONFIG.timezone;
            events.push({
                name: summary,
                startDate: toZonedIso(start, tz),
                endDate: toZonedIso(end, tz),
                ...CONFIG.location,
                description: text(c.description) || CONFIG.description,
                organizer: CONFIG.organizer,
                price: CONFIG.price,
                priceCurrency: CONFIG.priceCurrency,
            });
        }
    }

    events.sort((a, b) => a.startDate.localeCompare(b.startDate));

    const published = events.slice(0, CONFIG.maxEvents);
    fs.writeFileSync(eventsFile, JSON.stringify(published, null, 2) + '\n', 'utf8');

    console.log(
        `Found ${events.length} upcoming Qigong event(s); wrote ${published.length} to events.json.`
    );
}

main().catch((err) => {
    console.error('Failed to update events:', err);
    process.exit(1);
});
