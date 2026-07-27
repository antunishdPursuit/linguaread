# Language service plan

Reviewed July 20, 2026.

## Starting choice

Start at no direct cost with:

1. Gemini 3.1 Flash-Lite free tier for sentence meaning, B2 estimates, synonym choice, and strict JSON.
2. Azure Translator F0 for English-to-Simplified-Chinese translation, dictionary alternatives, examples, and Chinese-to-Latin transliteration.

Do not use the Gemini free tier with private or sensitive PDFs. Google states that free-tier content may be used to improve its products. Move to a paid API before use with private school work.

## MVP decision

The MVP will use only Gemini 3.1 Flash-Lite free and Azure Translator F0. Host the key-holding endpoint on Cloudflare Workers Free. Do not add a paid fallback during the MVP.

OpenAI and Cambridge remain later options only. They are not part of the build plan or the MVP test.

## Required result

The backend must return strict JSON with:

- source word and base form;
- sense used in the sentence;
- B2 decision;
- action: keep English, use a synonym, or use Mandarin;
- safe B2-or-lower synonym when one fits;
- Simplified Chinese;
- pinyin;
- short English meaning;
- confidence and fallback reason.

## Selection test

Before locking the free prompt and rules, run 30 original word-in-sentence cases through Gemini plus Azure:

- 10 words that should stay in English;
- 10 hard words that have a safe simpler synonym;
- 10 hard words that should use Mandarin.

Ji and the first test users should check meaning, natural Chinese, pinyin, and whether each synonym keeps the sentence clear. Also record valid JSON rate, response time, and cost. Keep the original English whenever the services disagree or the reviewers reject the change.

## Official references

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [OpenAI GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- [Azure Translator REST API](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/rest-api-guide)
- [Azure Translator language support](https://learn.microsoft.com/en-us/azure/ai-services/translator/language-support)
- [Azure Translator service limits](https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits)
- [Cloudflare Workers Free pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cambridge Dictionary API](https://dictionary-api.cambridge.org/)
- [Cambridge English Profile levels](https://dictionary-api.cambridge.org/index.php/blog/99-english-profile-levels)
