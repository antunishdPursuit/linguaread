# LinguaRead

<img src="public/branding/linguaread-logo.png" alt="LinguaRead logo" width="280">

LinguaRead is a PDF-first Chrome reading aid for Mandarin-speaking students who read academic English. It gives focused help for a selected word while keeping the original English document visible.

## Demo

[Watch the LinguaRead demo on YouTube](https://youtu.be/fouIw9q5ms0)

## Why LinguaRead exists

A reader may understand most of an English PDF but lose focus when a few unfamiliar words interrupt the page. Looking up each word in another application breaks the reading flow. Translating the full document removes too much of the English the reader is trying to practice.

LinguaRead keeps the PDF in English. The reader asks for help only when it is needed.

## What it does

- Opens local, text-based PDFs in an extension-owned reader.
- Opens contextual word help after a deliberate double-click.
- Shows a Mandarin translation, pinyin, part of speech, a context-matched English definition, the source sentence, and a short usage explanation when a safe result is available.
- Highlights analyzed words in blue with a white underline.
- Restores exact cached highlights when the same PDF text is opened again.
- Saves useful words to a searchable Dictionary in Chrome's side panel.
- Keeps the complete PDF in the browser.

## How it works

1. Open a text-based English PDF in Chrome.
2. Select LinguaRead from the extension toolbar, or choose a PDF from the LinguaRead landing page.
3. Double-click a word.
4. Review the word help card.
5. Select **Save to Dictionary** to keep the result for later review.
6. Double-click the highlighted word again to hide its active highlight for the current session.

Repeated requests for the same normalized word and sentence use the local validated-result cache. Cached results remain available after the daily new-analysis allowance is reached.

### Public test document

Use the [LinguaRead public demo PDF](assets/store/LinguaRead%20Public%20Demo.pdf) to test the reader without supplying a private document. This file is a repository test asset and is not included in the Chrome extension package.

## Language system

LinguaRead uses a bounded dictionary-plus-model flow:

1. FreeDict and a ranked ECDICT subset provide local English-to-Chinese candidates.
2. LinguaRead sends the selected word, its surrounding sentence, the fixed B2 target, and a short candidate list to a Cloudflare Worker.
3. Gemini 3.6 Flash selects a supplied candidate that fits the sentence or returns no safe match. It is not allowed to invent a Chinese translation.
4. The Worker and extension validate the response before showing it.
5. `pinyin-pro` generates pinyin locally.

The current hosted service permits three successful new analyses per installation per UTC day. Cached results and failed provider requests do not use the allowance. A SQLite-backed Cloudflare Durable Object coordinates the count for an opaque hashed installation identifier.

### Why Gemini 3.6 Flash

The production model was selected with a 159-request comparison across Gemini 3.5 Flash, Gemini 3.6 Flash, and Gemini 3.5 Flash-Lite. Gemini 3.6 Flash produced the best complete decision score in that test: 49 of 53 decisions, or 92.5%, while remaining inside the supplied candidate boundary in all 53 responses. Mandarin-speaker review is still required before treating the language output as externally validated.

## Privacy and security

- The complete PDF stays in the browser.
- An uncached request sends the selected word, its surrounding sentence, the fixed reading level, bounded dictionary candidates, and the random installation identifier in a request header.
- The Gemini API key is stored as a Cloudflare secret. It is not included in the extension, repository, or browser storage.
- Saved words, validated results, consent state, and the random installation identifier are stored in the user's Chrome profile.
- The Worker hashes the installation identifier before using it as the per-installation Cloudflare Durable Object key. It is not an account ID or email address.
- The hosted service permits three successful new analyses per installation per UTC day. Cached results and failed provider requests do not use the allowance.
- The Worker accepts requests only from approved extension origins, validates request and response data, applies a rate limit, and returns safe errors.

Read the [LinguaRead Privacy Policy](https://antunishdpursuit.github.io/linguaread-privacy/) for the broader data-use description. This README documents the current allowance and Worker-origin rules.

## Technology

| Area | Implementation |
| --- | --- |
| Chrome extension | WXT, React, TypeScript, Manifest V3 |
| PDF reader | PDF.js through React-PDF |
| Local language data | FreeDict and ranked ECDICT shards |
| Context selection | Gemini 3.6 Flash through a Cloudflare Worker |
| Daily allowance | SQLite-backed Cloudflare Durable Object |
| Saved Dictionary and cache | `chrome.storage.local` |
| Dictionary panel | Chrome Side Panel API |

## Run locally

### Requirements

- A current Node.js release
- pnpm
- Chrome 127 or newer

### Build and load the extension

```powershell
Copy-Item .env.example .env
# Edit .env and set VITE_LINGUAREAD_LANGUAGE_BROKER_URL to your own Worker endpoint.
pnpm install
pnpm build
```

Then open `chrome://extensions` in Chrome:

1. Turn on **Developer mode**.
2. Select **Load unpacked**.
3. Choose `.output/chrome-mv3` from this repository.
4. Pin LinguaRead and test it with the public demo PDF.

The public repository does not contain a default maintainer Worker URL or a Gemini API key. A functional build receives its Worker endpoint from the ignored `.env` file. For a build configured with your own Worker, an uncached word-help request sends the selected word, its surrounding sentence, the fixed B2 level, bounded local dictionary candidates, and a random installation identifier to that Worker. The Worker sends the bounded request to Gemini 3.6 Flash using a server-side API key; the key is not included in the repository or extension. The complete PDF stays in the browser.

No Gemini API key is required in the extension build. The unlisted Chrome Web Store beta uses the maintainer's hosted service and its allowance of three successful new analyses per installation per UTC day. Local unpacked clones are not authorized to use that service. Cached results and failed provider requests do not consume the allowance.

### Use your own Worker

To run a clone or fork with language help:

1. In `wrangler.jsonc`, replace `ALLOWED_ORIGINS` with this temporary valid
   extension origin:

   ```text
   chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
   ```

   Do not reuse the maintainer's extension origin.
2. Set your own provider secret. Do not put it in `.env`, the extension, or the repository.

   ```powershell
   pnpm exec wrangler secret put GEMINI_API_KEY
   ```

3. Run `pnpm broker:check`, then deploy the checked-in Worker to your own
   Cloudflare account. Copy its Worker endpoint.
4. Set `VITE_LINGUAREAD_LANGUAGE_BROKER_URL` in `.env` to that endpoint, run
   `pnpm build`, and load `.output/chrome-mv3` from `chrome://extensions`.
5. On the extension's card in `chrome://extensions`, copy the extension ID.
6. In `wrangler.jsonc`, replace the temporary origin with
   `chrome-extension://YOUR_EXTENSION_ID`, using the exact ID Chrome assigned.
7. Run `pnpm broker:check` again and redeploy the Worker.
8. Reload LinguaRead from `chrome://extensions`, then test uncached word help
   with the public demo PDF.

The first Worker deployment is only for obtaining the endpoint needed to build
the extension. Its temporary allowed origin does not authorize the local
extension. Word help works only after the Worker is redeployed with the exact
origin assigned to that extension build.

The Chrome Web Store build uses a maintainer-only `.env` value for its approved Worker endpoint. That value is not part of the public repository.

## Verification

```powershell
pnpm test
pnpm compile
pnpm build
pnpm zip
pnpm audit
```

These checks cover the local extension. The current 0.1.1 release candidate also passed a maintainer-only Cloudflare Worker dry run and a full dependency audit with zero known findings.

The generated Store package is `.output/linguaread-<version>-chrome.zip`. Generated output is not committed.

## Current limits

- English-to-Mandarin support uses a fixed B2 target.
- Image-only scanned PDFs are not supported because LinguaRead requires selectable text.
- Ordinary website reading, OCR, pronunciation, dictionary export, alphabetical navigation, account sync, and additional language pairs are not part of the current release.
- A safe Chinese translation is not guaranteed for every word and context.
- Language choices and pinyin still need review by Mandarin-speaking testers.
- The Chrome Web Store build is an unlisted beta. Anyone with its direct Store link can install it, but it is not discoverable through Chrome Web Store search and is not a public production release.

## Contributors and acknowledgments

- **Dennis** — product development, PDF experience, word interactions, language-service integration, and release engineering
- **Jingru Zhao (Ji)** — product collaboration and language-learning direction
- **Hack Your Summer** — program, community, and mentorship support
- [FreeDict](https://freedict.org/) English-Chinese data, release 2025.11.23, under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- [ECDICT](https://github.com/skywind3000/ECDICT) ranked English-Chinese data under its [MIT License](https://github.com/skywind3000/ECDICT/blob/master/LICENSE)
