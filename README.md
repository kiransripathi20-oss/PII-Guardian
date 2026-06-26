# PII Guardian

Filter PII from code and chat before sending to LLMs.

## Features

### Free

| Feature | Description |
|---|---|
| **PII Highlighting** | Detected PII highlighted with orange background + scrollbar marks. Hover to see entity type and confidence. |
| **Code Action (Lightbulb)** | Click on PII text and a lightbulb offers "Anonymize this". Also works on selections. |
| **Anonymize Selection** | Replace PII with `placeholder` (`<EMAIL_1>`) or `mask` (`***`). |
| **Restore PII** | Reverse anonymization (requires mapping from a prior session). |
| **Detected Types** | EMAIL, PHONE, CREDIT_CARD, SSN, IP_ADDRESS, URL |

### Pro (requires license key)

| Feature | Description |
|---|---|
| **Advanced PII Detection** | PERSON, LOCATION, DATE — names, cities, and dates |
| **Hash Redaction** | `[EMAIL_a1b2c3d4]` — deterministic, consistent across runs |
| **Inline PII Warnings** | Ghost text hints when typing a line containing PII |
| **Chat Participant** | `@pii-guardian` in VS Code Chat — anonymizes prompts, de-anonymizes responses |

## Requirements

- Visual Studio Code 1.85+
- For chat features: [Ollama](https://ollama.ai) (local) or an OpenAI-compatible API endpoint

## Configuration

| Setting | Default | Description |
|---|---|---|
| `piiGuardian.enabled` | `true` | Enable/disable PII filtering |
| `piiGuardian.entities` | `EMAIL, PHONE, CREDIT_CARD, SSN, IP_ADDRESS, PERSON` | PII types to detect (advanced types require Pro) |
| `piiGuardian.redactWith` | `placeholder` | Redaction method: `placeholder`, `mask` (free); `hash` (Pro) |
| `piiGuardian.licenseKey` | `""` | Pro license key |
| `piiGuardian.enableDeAnonymization` | `true` | Restore original PII in LLM responses |
| `piiGuardian.ollamaEndpoint` | `http://localhost:11434` | Ollama server URL |
| `piiGuardian.ollamaModel` | auto-detect | Ollama model to use |
| `piiGuardian.llmEndpoint` | `""` | OpenAI-compatible API endpoint |
| `piiGuardian.apiKey` | `""` | API key for the LLM endpoint |

## Detected PII Types

### Free

- EMAIL — `user@example.com`
- PHONE — `+1 (555) 123-4567`
- CREDIT_CARD — `4111-1111-1111-1111`
- SSN — `123-45-6789`
- IP_ADDRESS — `192.168.1.1`
- URL — `https://example.com`

### Pro (advanced entities)

- PERSON — `John Smith`
- LOCATION — Major US cities
- DATE — `01/15/2024`

## Commands

- `PII Guardian: Anonymize PII in Selection` — Replace PII with placeholders (free)
- `PII Guardian: Restore PII in Selection` — Attempt to restore original PII values (free)

## Usage

### Editor

Open any file. PII is automatically highlighted. Click the lightbulb or use the command palette to anonymize.

### Chat (Pro)

Open VS Code Chat and use `@pii-guardian`:

```
@pii-guardian What's the email in this code?
```

Your message is scanned for PII, redacted before reaching the LLM, and the response has PII restored.

## License

MIT

---

## Feedback

Found a bug or have a suggestion? [Submit feedback](https://forms.gle/zg5dT8931KPX6PST8).

---

*This extension uses [Microsoft Presidio](https://github.com/microsoft/presidio) (MIT License) for PII detection patterns.*

*&copy; Copyright (c) Microsoft Corporation. Licensed under the MIT License.*
