# Interactive SVG web app

This directory contains the source for the interactive web app hosted at `https://app.michaelgroom.net`.

The app turns publication-quality **static SVG figures** (e.g. Markov chain plots and DAGs) into **interactive visualisations** by attaching a data/metadata layer (JSON) and UI behaviour (tooltips, modals, highlighting, simple calculators) in client-side JavaScript.

## Quick start (local)

Because the pages use ES modules (`<script type="module">`), you should serve the directory via a local web server (opening `index.html` via `file://` may fail in some browsers).

From the repository root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## What’s included

- `index.html`: landing page with navigation
- `markov-chain.html`: interactive Markov chain SVGs (lead time selector, date slider highlighting, MFPT tool)
- `dag.html`: interactive DAG SVGs (season selector, date slider highlighting, cumulative probability, most probable path)
- `case-studies.html`: case study video explorer (target date, detrended toggle, synchronisation)
- `precursor-plots.html`: feature-importance / correlation movies (season/class selection, sync)
- `js/`: modular ES6 JavaScript code powering the above pages
- `style.css`: app styling

## What’s not included

- `svg_files/`: the SVG figure exports
- `json_files/`: the JSON data/metadata that drives the SVG interactivity
- `mp4_files/`: video assets (e.g. composites, case studies, feature-importance movies)
- `png_files/`: image assets used by some modals

This repository is intended to be a lightweight “framework” for interactive figures. To run it locally with full functionality, you’ll need to supply your own versions of the above directories (or fetch them from wherever you host your assets).

## Adapting this for your own paper figures

At a high level, the pattern is:

1. Export your figure as an SVG with stable, selectable elements (nodes/edges/etc.).
2. Create a JSON file that provides the semantic meaning and metadata for those elements.
3. Implement a mapping between SVG elements and JSON records, then attach behaviours (hover/tap tooltips, click/long-press modals, etc.).

In this codebase, the entry point is `js/InteractiveSVGApp.js`, which wires together loaders/parsers/UI controllers for each page.

## Licence

See `LICENSE` in this directory.

