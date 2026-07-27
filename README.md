# LinguaRead

LinguaRead is a draft Chrome extension for Mandarin-speaking international students reading English PDFs at a fixed B2 level.

The first build will:

- open a text-based PDF in a LinguaRead viewer;
- keep B2-or-lower words in English;
- mark words that have a clear B2-or-lower English synonym;
- mark words that have Simplified Chinese help when no safe synonym fits;
- show a quick view on hover and a full card on double-click;
- keep Learning and Known Words in Chrome's native side panel.

## Current status

- Dennis and Ji approved the current product plan.
- The first local Chrome build now includes the PDF picker, page-one viewer, non-destructive word markers, hover card, double-click card, and native side panel.
- The code check, three mock-language tests, and production build pass.
- Loading and checking the unpacked build in Dennis Chrome is the next step.
- The first local layout-test file is `MIT CASE - Ferrari 2025.pdf`.
- The test PDF stays local and is not committed, shared with testers, or used in a public changed-text demo, avoiding a possible conflict with its no-derivatives term.
- Dennis and the project team own the PDF reader, word rules, side panel, backend, and integration.
- Test users will check the full reading flow and word choices.
- The free language services are deferred. This build uses mock data only and is not the full MVP language system.

## Run the first build

1. Open `chrome://extensions` in the Dennis Chrome profile.
2. Turn on Developer mode.
3. Choose **Load unpacked**.
4. Select `.output/chrome-mv3` from this repo.
5. Click the LinguaRead extension icon and choose a local text-based PDF.
6. Check the marked word `innovation`: confirm the original PDF text remains visible, hover for the quick view, and double-click for the full card.
7. Open the Learning and Known Words side panel.

If PDF text splits, shifts, or loses its click target, stop and fix the text layer before adding the language service.

## Service direction

- Active MVP: Gemini 3.1 Flash-Lite free tier plus Azure Translator F0 behind Cloudflare Workers Free.
- Paid AI and licensed dictionary data stay outside the MVP.

See [docs/mvp-plan.md](docs/mvp-plan.md) for the full build order and [docs/service-plan.md](docs/service-plan.md) for the service rules.

## Data and keys

- Keep every API key on a backend, never in the Chrome extension.
- Send only the target sentence or smallest useful text section.
- Keep the original English when a service fails or the result is not safe.
- Do not commit PDFs, API keys, or user reading data.
