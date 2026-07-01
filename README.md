# PII Guardian

Filter PII from code and chat before sending to LLMs.

## Features

| Feature | Description |
|---|---|
| **PII Highlighting** | Detected PII highlighted with orange background + scrollbar marks. Hover to see entity type and confidence. |
| **Code Action (Lightbulb)** | Click on PII text and a lightbulb offers "Anonymize this". Also works on selections. |
| **Anonymize Selection** | Replace PII with `placeholder` (`<EMAIL_1>`), `mask` (`***`), or `hash` (`[EMAIL_a1b2c3d4]`). |
| **Restore PII** | Reverse anonymization (requires mapping from a prior session). |
| **Inline PII Warnings** | Ghost text hints when typing a line containing PII. |
| **Chat Participant** | `@pii-guardian` in VS Code Chat — anonymizes prompts, de-anonymizes responses. |
| **Advanced PII Detection** | PERSON, LOCATION, DATE — names, cities, and dates. |
| **US Passport Detection** | `A12345678` — detected when context keywords like "passport" are nearby. |
| **US Driver's License Detection** | `A1234567` / `12345678` — detected when context keywords like "driver's license" are nearby. |

## Requirements

- Visual Studio Code 1.85+
- For chat features: [Ollama](https://ollama.ai) (local) or an OpenAI-compatible API endpoint

## Getting Started

1. Install the extension from the VS Code Marketplace
2. Open **Settings** (`Ctrl+,`) → search for `pii-guardian`
3. Configure your LLM backend:
   - **Local (Ollama)**: Install [Ollama](https://ollama.ai), pull a model (e.g. `ollama pull qwen2.5-coder:7b`), and set `piiGuardian.ollamaModel` if you want a specific one. The extension auto-detects your installed models.
   - **Remote (OpenAI-compatible)**: Set `piiGuardian.llmEndpoint` to your API endpoint and `piiGuardian.apiKey` to your key.
4. Open any file — PII is highlighted automatically. Use `@pii-guardian` in VS Code Chat to use the chat feature.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `piiGuardian.enabled` | `true` | Enable/disable PII filtering |
| `piiGuardian.entities` | `EMAIL, PHONE, CREDIT_CARD, SSN, IP_ADDRESS, PERSON` | PII types to detect |
| `piiGuardian.redactWith` | `placeholder` | Redaction method: `placeholder`, `mask`, or `hash` |
| `piiGuardian.enableDeAnonymization` | `true` | Restore original PII in LLM responses |
| `piiGuardian.ollamaEndpoint` | `http://localhost:11434` | Ollama server URL |
| `piiGuardian.ollamaModel` | auto-detect | Ollama model to use |
| `piiGuardian.llmEndpoint` | `""` | OpenAI-compatible API endpoint |
| `piiGuardian.apiKey` | `""` | API key for the LLM endpoint |

<video src="https://github.com/kiransripathi20-oss/PII-Guardian/raw/main/media/PII_Guardian_Install_and_Configure.mp4" width="100%" controls></video>

## Detected PII Types

- EMAIL — `user@example.com`
- PHONE — `+1 (555) 123-4567`
- CREDIT_CARD — `4111-1111-1111-1111`
- SSN — `123-45-6789`
- IP_ADDRESS — `192.168.1.1`
- URL — `https://example.com`
- PERSON — `John Smith`
- LOCATION — Major US cities
- DATE — `01/15/2024`
- PASSPORT_US — `A12345678` (requires nearby context like "passport")
- DRIVERS_LICENSE_US — `A1234567` / `12345678` (requires nearby context like "driver's license")

## Commands

- `PII Guardian: Anonymize PII in Selection` — Replace PII with placeholders
- `PII Guardian: Restore PII in Selection` — Attempt to restore original PII values

## Usage

### Editor

Open any file. PII is automatically highlighted. Click the lightbulb or use the command palette to anonymize.

<video src="https://github.com/kiransripathi20-oss/PII-Guardian/raw/main/media/PII_Guardian_Anonymize_File.mp4" width="100%" controls></video>

### Chat

Open VS Code Chat and use `@pii-guardian`:

```
@pii-guardian What's the email in this code?
```

Your message is scanned for PII, redacted before reaching the LLM, and the response has PII restored.

<video src="https://github.com/kiransripathi20-oss/PII-Guardian/raw/main/media/PII_Guardian_Chat.mp4" width="100%" controls></video>

## License

Proprietary / Source-Available. See the [LICENSE](LICENSE) file for details.

---

## Feedback

Found a bug or have a suggestion? [Submit feedback](https://forms.gle/zg5dT8931KPX6PST8).

---

*This extension uses [Microsoft Presidio](https://github.com/microsoft/presidio) (MIT License) for PII detection patterns.*

*&copy; Copyright (c) Microsoft Corporation. Licensed under the MIT License.*
