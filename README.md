# Plushie Dreadfuls Tracker

A gothic-cute PWA for tracking your Plushie Dreadfuls collection and wish list.

## Features
- **My Collection** — photo, name, personal meaning, date collected, how acquired, retired badge.
- **Wish List** — photo, name, product URL, out-of-stock toggle, "Got It! 🖤" promotes the item into your collection, "Check All Restocks" opens every saved URL.
- **Search** across both tabs; filter collection by All / Active / Retired.
- **Social** — friends (your "Coven"), a directed "Inner Coffin" inner circle, photo posts/stories about your plushes, likes + comments, and a MySpace-style **Top 8** showcase on your profile. Posts are scoped Public / Coven / Inner Coffin, enforced in the database via RLS. Account required (no anonymous viewing). Backed by migration `db/0021_social.sql`.
- **Daily browser reminders** when out-of-stock wishlist items are waiting (opt-in).
- **PWA** — installs to your phone's home screen, works offline, IndexedDB-backed.
- **Photo compression** to JPEG ≤800px via canvas before storing.

## Running locally
Open `index.html` through a local web server (the service worker won't register over `file://`):

```sh
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Deploy
Hosted on GitHub Pages from `main`. All your collection data lives in your browser only.
