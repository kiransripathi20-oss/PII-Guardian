import * as vscode from 'vscode';
import { anonymizeText, deanonymizeText } from './piiEngine';
import { PiiEntityType, RedactMethod } from './piiTypes';

interface SessionState {
  history: { role: string; content: string }[];
  mapping: Map<string, string>;
}

const sessionStates = new Map<string, SessionState>();

function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration('piiGuardian').get<T>(key) ?? defaultValue;
}

function parseSessionId(context: vscode.ChatContext): string {
  const hist = context.history;
  const lastMsg = hist.length > 0 ? hist[hist.length - 1] : undefined;
  if (lastMsg && 'message' in lastMsg) {
    const msg = (lastMsg as any).message as any;
    if (msg?.fingerprint) return msg.fingerprint;
  }
  return `session-${hist.length}-${Date.now()}`;
}

export function createChatParticipant(context: vscode.ExtensionContext): vscode.ChatParticipant | undefined {
  try {
    const participant = vscode.chat.createChatParticipant('pii-guardian.chat', async (request, chatContext, stream, token) => {
      const isEnabled = getConfig<boolean>('enabled', true);
      if (!isEnabled) {
        stream.markdown('PII filtering is disabled. Enable it with `piiGuardian.enabled`.');
        return { metadata: { filtered: false } };
      }

      const enabledEntities = getConfig<PiiEntityType[]>('entities', [
        'EMAIL', 'PHONE', 'CREDIT_CARD', 'SSN', 'IP_ADDRESS', 'PERSON'
      ]);
      const redactWith = getConfig<RedactMethod>('redactWith', 'placeholder');
      const enableDeAnon = getConfig<boolean>('enableDeAnonymization', true);

      const sessionId = parseSessionId(chatContext);
      let state = sessionStates.get(sessionId);
      if (!state) {
        state = { history: [], mapping: new Map() };
        sessionStates.set(sessionId, state);
      }

      const historyText = state.history.map(h => `${h.role}: ${h.content}`).join('\n');
      const fullPrompt = historyText ? `${historyText}\nuser: ${request.prompt}` : request.prompt;

      const piiResult = anonymizeText(fullPrompt, {
        entities: enabledEntities,
        redactWith,
      });

      state.history.push({ role: 'user', content: piiResult.anonymizedText });

      stream.markdown(`_PII detected and redacted: ${piiResult.entities.length} item(s)_\n\n`);

      if (piiResult.entities.length > 0) {
        const details = piiResult.entities
          .map(e => `- \`${e.type}\`: ~~${e.text}~~ → \`${getRedactedPreview(e.text, redactWith)}\``)
          .join('\n');
        stream.markdown(details);
        stream.markdown('\n---\n\n');
      }

      const llmPrompt = piiResult.anonymizedText;

      const responseText = await simulateLLMResponse(llmPrompt, stream, token);

      let finalResponse = responseText;
      if (enableDeAnon && piiResult.mapping.size > 0) {
        finalResponse = deanonymizeText(responseText, piiResult.mapping);
      }

      state.history.push({ role: 'assistant', content: finalResponse });

      return { metadata: { filtered: true, entitiesFound: piiResult.entities.length } };
    });

    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'shield-icon.svg');

    return participant;
  } catch (e) {
    console.error('Failed to create chat participant:', e);
    return undefined;
  }
}

function getRedactedPreview(text: string, method: RedactMethod): string {
  if (method === 'mask') {
    if (text.includes('@')) {
      const [local] = text.split('@');
      return `${local[0]}***`;
    }
    return text.length > 4 ? `***${text.slice(-4)}` : '***';
  }
  if (method === 'hash') {
    return `[${text.length} chars]`;
  }
  return `<redacted>`;
}

interface OllamaModelInfo {
  name: string;
}

interface OllamaTagsResponse {
  models: OllamaModelInfo[];
}

interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream: boolean;
}

interface OllamaChatResponse {
  message?: { content: string };
  done?: boolean;
}

let selectedOllamaModel: string | undefined;
let cachedModels: string[] | undefined;

async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  if (cachedModels) return cachedModels;
  const url = `${baseUrl.replace(/\/+$/, '')}/api/tags`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  const data = await response.json() as OllamaTagsResponse;
  cachedModels = (data.models || []).map(m => m.name);
  return cachedModels;
}

async function getOllamaModel(baseUrl: string): Promise<string | null> {
  const configured = vscode.workspace.getConfiguration('piiGuardian').get<string>('ollamaModel');
  if (configured) return configured;

  if (selectedOllamaModel) return selectedOllamaModel;

  try {
    const models = await fetchOllamaModels(baseUrl);
    if (models.length === 0) {
      vscode.window.showWarningMessage('No Ollama models found. Pull one with `ollama pull qwen2.5-coder:7b` or similar.');
      return null;
    }
    if (models.length === 1) {
      selectedOllamaModel = models[0];
      return selectedOllamaModel;
    }

    const picked = await vscode.window.showQuickPick(models, {
      placeHolder: 'Select an Ollama model for this session',
      ignoreFocusOut: true,
    });
    if (!picked) return null;
    selectedOllamaModel = picked;
    return selectedOllamaModel;
  } catch (err) {
    return null;
  }
}

async function callOllama(
  prompt: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<string | null> {
  const baseUrl = vscode.workspace.getConfiguration('piiGuardian').get<string>('ollamaEndpoint') || 'http://localhost:11434';

  const model = await getOllamaModel(baseUrl);
  if (!model) return null;

  const url = `${baseUrl.replace(/\/+$/, '')}/api/chat`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      } as OllamaChatRequest),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const chunks: string[] = [];
    const reader = response.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done || token.isCancellationRequested) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data: OllamaChatResponse = JSON.parse(line);
          const content = data.message?.content || '';
          if (content) {
            chunks.push(content);
            stream.markdown(content);
          }
        } catch { }
      }
    }

    return chunks.join('');
  } catch (err) {
    stream.markdown(`_Ollama unavailable (${err})._\n\n`);
    return null;
  }
}

async function callExternalLLM(
  prompt: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<string | null> {
  const llmEndpoint = vscode.workspace.getConfiguration('piiGuardian').get<string>('llmEndpoint');
  const apiKey = vscode.workspace.getConfiguration('piiGuardian').get<string>('apiKey');
  if (!llmEndpoint || !apiKey) return null;

  try {
    const response = await fetch(llmEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM returned ${response.status}`);
    }

    const chunks: string[] = [];
    const reader = response.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done || token.isCancellationRequested) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          const content = data.choices?.[0]?.delta?.content || '';
          if (content) {
            chunks.push(content);
            stream.markdown(content);
          }
        } catch { }
      }
    }

    return chunks.join('');
  } catch (err) {
    stream.markdown(`_External LLM call failed: ${err}._\n\n`);
    return null;
  }
}

async function simulateLLMResponse(
  prompt: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<string> {
  stream.markdown(`_Anonymized prompt sent to LLM — streaming response:_\n\n`);

  let result = await callOllama(prompt, stream, token);
  if (result !== null) return result;

  result = await callExternalLLM(prompt, stream, token);
  if (result !== null) return result;

  const echoMessage = `[PII Guardian] Received anonymized prompt:\n\n\`\`\`\n${prompt}\n\`\`\``;
  stream.markdown(echoMessage);
  return echoMessage;
}
