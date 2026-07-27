# LinguaRead free MVP plan

Status: local shell built; Dennis Chrome check pending

Target: a working, unpacked Chrome extension that helps a B2 Mandarin-speaking reader read one text-based English PDF by keeping easier words in English, using safe simpler English where possible, and using Simplified Chinese when needed.

## Free stack

| Need | Free choice |
| --- | --- |
| Extension | WXT, React, and TypeScript |
| PDF viewer | React-PDF and PDF.js |
| Word lists | Chrome native Side Panel API |
| Local state and response cache | `chrome.storage.local` |
| Context, B2 estimate, and synonym choice | Gemini 3.1 Flash-Lite free tier |
| Mandarin, dictionary choices, and pinyin | Azure Translator F0 |
| Secret-holding backend | Cloudflare Workers Free |
| Code checks | Vitest, React Testing Library, and Playwright |
| Human review | Three or more Mandarin-speaking test users or close stand-ins |
| Distribution during the MVP | Load the unpacked extension in Chrome; no Chrome Web Store fee |

The MVP will not use a paid fallback. If a free quota runs out, use cached or mock results for local work and wait for the quota to reset.

## Work ownership

- Dennis and the project team own the PDF reader, word rules, side panel, backend, and integration.
- Test users own the human review of meaning, Mandarin, pinyin, reading flow, and ease of use.
- Small code checks run before user testing so testers do not receive a broken build.

## Phase 0 - setup

- [ ] Create a Gemini API project and free-tier key.
- [ ] Create an Azure Translator F0 resource and key.
- [ ] Create a Cloudflare account and free Worker.
- [ ] Store service keys as Worker secrets, never in the extension or Git.
- [ ] Decide whether to create a GitHub remote; do not publish without Dennis's approval.
- [ ] Make an `.env.example` containing names only, with no real values.
- [ ] Write a short privacy notice: public test text only, smallest useful sentence sent, no full-PDF upload, no source-text logs.

Pass check: all three services can be called from a local test without exposing a key in browser code or Git.

## Phase 1 - extension shell

- [x] Create the WXT React and TypeScript project at the repo root.
- [x] Add viewer and side-panel entry points.
- [x] Request only `storage` and `sidePanel` permissions at first.
- [x] Add shared TypeScript types for language results and vocabulary state.
- [x] Add scripts for development, build, type checks, and unit tests.
- [ ] Add browser tests once the first Dennis Chrome check confirms the PDF flow.
- [ ] Load the unpacked extension in Dennis Chrome.

Pass check: clicking the extension opens the empty LinguaRead viewer and the empty side panel opens after a user action.

## Phase 2 - PDF proof

- [x] Add a local PDF picker.
- [x] Add React-PDF page-one rendering for the local Ferrari test.
- [ ] Keep the text layer selectable and aligned with the page.
- [x] Extract text from the first page for the local proof.
- [x] Add one word mark, one hover target, and one double-click target using mock data.
- [ ] If React-PDF splits or shifts the word, test direct PDF.js text rendering or a custom overlay before adding more features.

Code status: TypeScript passes, all three mock-language tests pass, and the Chrome MV3 build includes its PDF worker. The unchecked layout items need a visual check in Dennis Chrome.

The Ferrari case is for local layout work only. Do not commit it, give it to testers, or use changed Ferrari text in a public demo.

Pass check: page one remains readable, selectable, and aligned after one word receives a safe mock change.

## Phase 3 - free language backend

- [ ] Create a Cloudflare Worker endpoint such as `POST /analyze`.
- [ ] Accept only the target sentence, target words, fixed B2 level, and saved Learning and Known state needed for the decision.
- [ ] Ask Gemini for strict JSON matching the shared schema.
- [ ] Reject missing fields, unknown actions, invalid levels, and malformed JSON.
- [ ] Use Azure to check Simplified Chinese, get dictionary alternatives where supported, and transliterate Chinese to Latin for pinyin.
- [ ] Return `keep_english` when either service fails or the result is unsafe.
- [ ] Add request size limits, short timeouts, clear errors, and basic rate limits.
- [ ] Do not log source sentences.

Pass check: one public test sentence returns valid JSON without a key appearing in Chrome's network request or extension files.

## Phase 4 - free-service language check

- [ ] Write 30 original public test sentences; do not copy them from the Ferrari case.
- [ ] Include 10 words expected to stay in English.
- [ ] Include 10 words expected to use a safe B2-or-lower synonym.
- [ ] Include 10 words expected to use Mandarin.
- [ ] Run all 30 through Gemini plus Azure.
- [ ] Have Ji or a Mandarin-speaking reviewer check sense, synonym, Chinese, and pinyin.
- [ ] Record valid JSON rate, accepted language choices, response time, and any free-quota errors.
- [ ] Revise the prompt and rules, then rerun rejected cases.

Proposed pass check: all 30 responses contain valid JSON, at least 24 of 30 language choices pass human review, and no rejected change appears when the safe fallback should have kept English.

## Phase 5 - word decision engine

- [ ] Split extracted text into sentences and word tokens.
- [ ] Skip names, links, numbers, page controls, punctuation, and words already covered by saved state.
- [ ] Batch only a small number of candidate words per request.
- [ ] Keep B2-or-lower words in English.
- [ ] Use a safe B2-or-lower synonym when it fits the sentence.
- [ ] Use Mandarin when no safe synonym fits.
- [ ] Keep the original word, decision reason, and service version linked to every change.
- [ ] Cache accepted results in `chrome.storage.local` by word, sense, B2 target, and service version.

Pass check: a reload uses cached results, does not repeat the same service call, and keeps the original English whenever a result is missing or rejected.

## Phase 6 - reading actions

- [ ] Mark changed words without hiding that LinguaRead changed the text.
- [ ] Show the small preview on hover.
- [ ] Pin the full word card on double-click.
- [ ] Close the full card when the reader clicks elsewhere.
- [ ] Show English, Simplified Chinese, pinyin, short meaning, and the original word where needed.
- [ ] Add the actions for Learning, Known Words, and `I don't know this synonym`.
- [ ] Apply Ji's `emissions` and `fumes` rule.

Pass check: one synonym and one Mandarin replacement complete the full hover, card, Learning, and Known flow.

## Phase 7 - side panel and saved state

- [ ] Build Learning and Known Words tabs in Chrome's native side panel.
- [ ] Prevent duplicates and prevent a word from being in both lists.
- [ ] Move words between lists from the card and panel.
- [ ] Keep B2-by-level words out of the user's Known Words list.
- [ ] Keep the lists after the viewer and Chrome close.
- [ ] Add search only if the two lists become hard to scan during testing.

Pass check: close and reopen Chrome without losing either list or placing a word in both lists.

## Phase 8 - integration and safety

- [ ] Connect the PDF viewer, decision engine, Worker, Azure check, word cards, and side panel.
- [ ] Show progress while a page is being checked.
- [ ] Show plain errors for unreadable PDFs, quota limits, timeouts, and service failures.
- [ ] Keep the original PDF readable when the service is offline.
- [ ] Confirm that no API keys, full PDFs, or source sentences appear in Git or logs.
- [ ] Check the densest reading state at desktop and a smaller laptop width.

Pass check: the agreed end-to-end flow works on at least one simple public PDF and fails safely without changing the original English.

## Phase 9 - test-user review

- [ ] Recruit at least three Mandarin-speaking international students or close stand-ins.
- [ ] Give each tester a public or self-owned text-based PDF, not the Ferrari case.
- [ ] Ask each person to open the PDF, inspect changed words, use hover and double-click, and move words between Learning and Known Words.
- [ ] Ask the five open questions in the project research note.
- [ ] Record wrong meanings, awkward Chinese, bad synonyms, layout problems, and confusing actions.
- [ ] Fix issues that block the main reading loop; place new feature requests in a later list.

Pass check: every tester completes the main loop, no serious language error remains in the demo text, and the team can name the top three changes from feedback.

## Phase 10 - Hack Your Summer demo

- [ ] Choose a public, change-friendly PDF for the final demo.
- [ ] Record the problem, current flow, progress, challenge, and next step.
- [ ] Show one English word, one synonym, one Mandarin replacement, and both side-panel lists.
- [ ] Upload the video with public-view access and test the link while signed out.
- [ ] Submit the required HYS reflection and demo link.

Pass check: a new viewer can watch the demo and understand the user, problem, product flow, and result without a live explanation.

## Schedule

### Week 2 - Build, July 20-24

- Finish Phases 0-3.
- Prove the PDF layer and one live free-service response.
- Start the 30-case language check.

### Week 3 - Test and improve, July 27-31

- Finish Phases 4-8.
- Complete the full PDF-to-side-panel flow.
- Prepare the test-user build.

### Week 4 - Share, August 3-7

- Finish Phases 9-10.
- Run user tests, fix the main blockers, record the final demo, and submit it.

## MVP definition of done

- [ ] Loads as an unpacked Chrome extension.
- [ ] Opens one text-based public PDF and preserves readable, selectable text.
- [ ] Uses the free Gemini, Azure, and Cloudflare path without exposing keys.
- [ ] Uses no hard-coded demo dictionary.
- [ ] Keeps B2 words in English and safely chooses a synonym or Mandarin for tested harder words.
- [ ] Supports hover, double-click, Learning, and Known Words.
- [ ] Keeps word state after Chrome closes.
- [ ] Fails back to unchanged English when unsure or offline.
- [ ] Passes the 30-case language check and at least three human tests.
- [ ] Has a public demo video and completed HYS submission.

## Not in the free MVP

- Paid AI or dictionary services
- Chrome Web Store publication
- Confidential or private school PDFs
- Scanned PDFs and OCR
- Website reading
- A1-C2 level selection or assessment
- Accounts, cloud sync, and a cloud vocabulary database
- Flashcards, study reminders, and export
- Languages other than English and Simplified Chinese
- A custom side panel inside the PDF viewer
