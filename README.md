# Dahlia

Dahlia scans Magic: The Gathering cards on stream and keeps a ManaBox-style collection.

This repo is the public home of Dahlia. Today it holds the **collection viewer**, a static web page.
The app itself is not public yet; its place is reserved in [`app/`](app/).

## Collection viewer

Open the viewer, then drop in a CSV exported from Dahlia's Collection tab (*Export CSV…*).
It shows your cards as a grid or table, with card images, prices and totals.

- Runs entirely in your browser. Your CSV is never uploaded anywhere.
- Card images and current prices come from [Scryfall](https://scryfall.com)'s public API. Only card identifiers are sent to Scryfall, never your quantities, binder names or purchase prices.
- Also reads ManaBox collection and binder exports.

Live at https://tessardent.github.io/Dahlia/ and in [`docs/`](docs/) (plain HTML, CSS and JS, no build step).
To try it locally: `python -m http.server -d docs` and open http://localhost:8000.

## Layout

| Path | What |
| --- | --- |
| `docs/` | The viewer, served by GitHub Pages from `main` |
| `app/` | Reserved for the Dahlia app source |

Card data and images belong to Scryfall and Wizards of the Coast. Dahlia is unofficial fan software.
No license has been chosen yet, so all rights are reserved until one is added.
