# Hustle & Flow

A mobile-first freestyle rhyme trainer inspired by the rough, physical energy of early-2000s street-fighting game menus while using original branding and UI.

## Version 0.1

- WRITE mode: type any seed word
- RANDOM mode: one-tap random seed + rhyme bank
- CYPHER mode: automatic 15 / 30 / 60 / 90 second word changes
- HOLD / RELEASE
- NEXT
- Perfect rhymes, near rhymes, or both
- PWA install support
- No account or database required
- Datamuse-powered rhyme lookup
- Full-bank mode requests up to 1,000 perfect + 1,000 near rhymes per seed word (API maximum per query)

## Run locally

Any static file server works. Example:

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Deploy

This is a static site. It can be deployed directly to Vercel, Netlify, GitHub Pages, or another static host.

## API note

Datamuse announced that API keys will be required starting January 1, 2027. Before then, the current browser-side requests work without a key. When keys become required, route Datamuse requests through a serverless function so the key is never exposed in the browser.
