// OpenAI API Service — BYOK (Bring Your Own Key)
// API Key 只存在使用者瀏覽器的 localStorage 裡

const STORAGE_KEY = 'openai_api_key';
const MODEL_KEY = 'openai_model';

export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4.1' | 'gpt-4.1-mini' | 'gpt-4.1-nano';

export const AVAILABLE_MODELS: { id: OpenAIModel; label: string; description: string }[] = [
  { id: 'gpt-4o', label: 'GPT-4o', description: '快速且聰明' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', description: '最便宜' },
  { id: 'gpt-4.1', label: 'GPT-4.1', description: '最新最強' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', description: '新一代平衡' },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', description: '新一代最快' },
];

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Key Management ──

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasApiKey(): boolean {
  const key = getApiKey();
  return !!key && key.startsWith('sk-');
}

// ── Model Selection ──

export function getSelectedModel(): OpenAIModel {
  const stored = localStorage.getItem(MODEL_KEY);
  if (stored && AVAILABLE_MODELS.some(m => m.id === stored)) {
    return stored as OpenAIModel;
  }
  return 'gpt-4o'; // 預設
}

export function setSelectedModel(model: OpenAIModel): void {
  localStorage.setItem(MODEL_KEY, model);
}

// ── System Prompt ──

function buildSystemPrompt(tripContext?: { name?: string; startDate?: string; endDate?: string }): string {
  let prompt = `You are a friendly and knowledgeable travel planning assistant. You help users plan their trips, suggest activities, provide local tips, and answer travel-related questions. Always respond in the same language the user writes in. Be concise but helpful, and use emojis where appropriate to make the conversation lively.`;

  if (tripContext?.name) {
    prompt += `\n\nThe user is currently planning a trip: "${tripContext.name}"`;
    if (tripContext.startDate && tripContext.endDate) {
      prompt += ` from ${tripContext.startDate} to ${tripContext.endDate}`;
    }
    prompt += `. Keep this context in mind when answering questions.`;
  }

  return prompt;
}

// ── API Call ──

export interface SendMessageOptions {
  messages: ChatMessage[];
  tripContext?: { name?: string; startDate?: string; endDate?: string };
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

export async function sendMessage({ messages, tripContext, onChunk, signal }: SendMessageOptions): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('請先設定 OpenAI API Key');

  const model = getSelectedModel();
  const systemMessage: ChatMessage = {
    role: 'system',
    content: buildSystemPrompt(tripContext),
  };

  const fullMessages = [systemMessage, ...messages];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: fullMessages,
      stream: !!onChunk,
      temperature: 0.7,
      max_tokens: 2048,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const code = response.status;
    if (code === 401) throw new Error('API Key 無效，請重新設定。');
    if (code === 429) throw new Error('API 額度不足或請求頻率過高，請稍後再試。');
    if (code === 404) throw new Error(`模型 ${model} 不存在或你的帳號無法使用此模型。`);
    throw new Error(err?.error?.message || `API 錯誤 (${code})`);
  }

  // Streaming response
  if (onChunk && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            result += content;
            onChunk(result);
          }
        } catch {
          // skip invalid JSON lines
        }
      }
    }
    return result;
  }

  // Non-streaming response
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
