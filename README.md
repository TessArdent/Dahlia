# Dahlia

Dahlia scans Magic: The Gathering cards on stream and keeps a ManaBox-style collection.

This repo is the public home of Dahlia. Today it holds the **collection viewer**, a static web page.
The app itself is not public yet; its place is reserved in [`app/`](app/).

## Collection viewer

A static page that shows published collections as a grid or table, with card images, prices and totals.
Live at https://tessardent.github.io/Dahlia/, with its source in [`docs/`](docs/) (plain HTML, CSS and JS, no build step).

- It reads only the collections published in [`docs/exports/`](docs/exports/). It has no upload.
- Card images and prices come from [Scryfall](https://scryfall.com)'s public API (only card IDs are sent). GBP and other currencies are converted from EUR with ECB rates from [frankfurter.app](https://frankfurter.app).

To publish a collection: export it from Dahlia's Collection tab (*Export CSV…*, ManaBox format), put the file in `docs/exports/`, and add `{ "file": "...", "title": "..." }` to `docs/exports/index.json`.
The CSV includes purchase prices and dates added, and everything in this repo is public.

To try it locally: `python -m http.server -d docs` and open http://localhost:8000.

## Layout

| Path | What |
| --- | --- |
| `docs/` | The viewer, served by GitHub Pages from `main` |
| `app/` | Reserved for the Dahlia app source |

Card data and images belong to Scryfall and Wizards of the Coast. Dahlia is unofficial fan software.
No license has been chosen yet, so all rights are reserved until one is added.
