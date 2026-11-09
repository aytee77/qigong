# Qigong Zürich Albisrieden

Personal website for Qigong Events in Zürich.

## Managing Events

Upcoming Qigong events are pulled automatically from the public Google Calendar
(`vereinhochneun@gmail.com`) – no manual editing of `events.json` required.

The sync script (`fetch-events.js`):

- keeps only events whose title contains "Qi Gong" (rentals/meetings are filtered out),
- drops events that are already in the past,
- expands recurring sessions (weekly classes) including `EXDATE` exceptions,
- respects the `Europe/Zurich` timezone (DST-aware `+01:00` / `+02:00` offsets).

To refresh `events.json` from the calendar and regenerate the upcoming-events
list and Schema.org structured data in `index.html`:

```bash
npm install   # first time only
npm run update
```

Then commit and push `events.json` and `index.html`.

### Automatic updates

`.github/workflows/update-events.yml` runs `npm run update` once a week
(every Friday, 12:00 UTC) and commits any changes automatically, so the
published site stays up to date without manual work. You can also trigger it
manually from the Actions tab
(*Update events from calendar → Run workflow*).

### Configuration

The `CONFIG` block at the top of `fetch-events.js` controls the sync:

| Option | Purpose |
| --- | --- |
| `icsUrl` | The calendar's public iCal feed |
| `includePattern` / `excludePatterns` | Which event titles count as Qigong |
| `horizonDays` | How far into the future to look |
| `maxEvents` | How many upcoming sessions to publish |
| `location`, `description`, `organizer`, `price`, `priceCurrency` | Static details applied to every event |

