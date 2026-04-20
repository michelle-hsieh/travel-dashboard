// AI Service — 支援 OpenAI + Gemini 雙供應商
// API Key 只存在使用者瀏覽器的 localStorage 裡

// ── Types ──

export type AIProvider = 'openai' | 'gemini';

export interface ModelInfo {
  id: string;
  label: string;
  description: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string; // function name for tool responses (needed by Gemini)
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface SendMessageOptions {
  messages: ChatMessage[];
  tripContext?: { name?: string; startDate?: string; endDate?: string };
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
  useTools?: boolean;
}

export interface SendMessageResult {
  content: string | null;
  toolCalls?: ToolCall[];
}

// ── Constants ──

const PROVIDER_KEY = 'ai_provider';
const OPENAI_KEY_STORE = 'openai_api_key';
const GEMINI_KEY_STORE = 'gemini_api_key';
const OPENAI_MODEL_STORE = 'openai_model';
const GEMINI_MODEL_STORE = 'gemini_model';

export const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-4o', label: 'GPT-4o', description: '快速且聰明' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', description: '最便宜' },
  { id: 'gpt-4.1', label: 'GPT-4.1', description: '最新最強' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', description: '新一代平衡' },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', description: '新一代最快' },
];

export const GEMINI_MODELS: ModelInfo[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: '免費・快速' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: '免費・最強' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: '免費・輕量' },
];

export const PROVIDER_INFO: Record<AIProvider, { label: string; icon: string; keyPrefix: string; keyPlaceholder: string; keyUrl: string; keyUrlLabel: string }> = {
  openai: {
    label: 'OpenAI',
    icon: '🟢',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlLabel: '前往 OpenAI 申請 API Key ↗',
  },
  gemini: {
    label: 'Gemini',
    icon: '🔵',
    keyPrefix: '',
    keyPlaceholder: 'AIza...',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyUrlLabel: '前往 Google AI Studio 申請 API Key ↗',
  },
};

// ── Provider Management ──

export function getProvider(): AIProvider {
  return (localStorage.getItem(PROVIDER_KEY) as AIProvider) || 'openai';
}

export function setProvider(p: AIProvider): void {
  localStorage.setItem(PROVIDER_KEY, p);
}

// ── Key Management ──

export function getApiKey(provider?: AIProvider): string | null {
  const p = provider ?? getProvider();
  return localStorage.getItem(p === 'openai' ? OPENAI_KEY_STORE : GEMINI_KEY_STORE);
}

export function setApiKey(key: string, provider?: AIProvider): void {
  const p = provider ?? getProvider();
  localStorage.setItem(p === 'openai' ? OPENAI_KEY_STORE : GEMINI_KEY_STORE, key.trim());
}

export function clearApiKey(provider?: AIProvider): void {
  const p = provider ?? getProvider();
  localStorage.removeItem(p === 'openai' ? OPENAI_KEY_STORE : GEMINI_KEY_STORE);
}

export function hasApiKey(provider?: AIProvider): boolean {
  const key = getApiKey(provider);
  if (!key || key.length < 8) return false;
  const p = provider ?? getProvider();
  if (p === 'openai') return key.startsWith('sk-');
  return true; // Gemini keys can vary
}

// ── Model Management ──

export function getAvailableModels(provider?: AIProvider): ModelInfo[] {
  const p = provider ?? getProvider();
  return p === 'openai' ? OPENAI_MODELS : GEMINI_MODELS;
}

export function getSelectedModel(provider?: AIProvider): string {
  const p = provider ?? getProvider();
  const storeKey = p === 'openai' ? OPENAI_MODEL_STORE : GEMINI_MODEL_STORE;
  const stored = localStorage.getItem(storeKey);
  const models = getAvailableModels(p);
  if (stored && models.some(m => m.id === stored)) return stored;
  return models[0].id;
}

export function setSelectedModel(model: string, provider?: AIProvider): void {
  const p = provider ?? getProvider();
  localStorage.setItem(p === 'openai' ? OPENAI_MODEL_STORE : GEMINI_MODEL_STORE, model);
}

// ── Tool Definitions (shared format) ──

const TOOL_DEFS = [
  {
    name: 'navigate_to_page',
    description: 'Navigate the app to a specific page/tab. Use when the user asks to go to, view, or check a specific section of the travel app.',
    parameters: {
      type: 'object' as const,
      properties: {
        page: {
          type: 'string',
          enum: ['home', 'planner', 'logistics', 'resources', 'admin'],
          description: 'The page to navigate to. "home" = 旅程列表, "planner" = 行程規劃, "logistics" = 準備 (機票/住宿/票券/清單/預算), "resources" = 連結, "admin" = 授權管理',
        },
      },
      required: ['page'],
    },
  },
  {
    name: 'add_flight',
    description: 'Add a new flight record to the current trip. Use when the user provides flight information either directly or through a PDF upload.',
    parameters: {
      type: 'object' as const,
      properties: {
        airline: { type: 'string', description: 'Airline name (e.g. "長榮航空", "中華航空")' },
        flightNo: { type: 'string', description: 'Flight number (e.g. "BR197", "CI100")' },
        departureAirport: { type: 'string', description: 'Departure airport code or name (e.g. "TPE 桃園")' },
        departureTime: { type: 'string', description: 'Departure date and time (e.g. "2026-04-10 08:30")' },
        arrivalAirport: { type: 'string', description: 'Arrival airport code or name (e.g. "KIX 關西")' },
        arrivalTime: { type: 'string', description: 'Arrival date and time (e.g. "2026-04-10 12:45")' },
        confirmNo: { type: 'string', description: 'Booking confirmation number' },
        amount: { type: 'number', description: 'Ticket price amount' },
        currency: { type: 'string', description: 'Currency code (e.g. "TWD", "JPY")' },
      },
      required: ['airline', 'flightNo'],
    },
  },
  {
    name: 'add_hotel',
    description: 'Add a new hotel/accommodation record to the current trip.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Hotel name' },
        address: { type: 'string', description: 'Hotel address' },
        checkIn: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
        checkOut: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
        confirmNo: { type: 'string', description: 'Booking confirmation number' },
        amount: { type: 'number', description: 'Total price' },
        currency: { type: 'string', description: 'Currency code' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_checklist_item',
    description: 'Add an item to the trip checklist (e.g. things to prepare, souvenirs to buy).',
    parameters: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The checklist item text' },
        category: { type: 'string', description: 'Category (e.g. "行前準備", "伴手禮")' },
        recipient: { type: 'string', description: 'Who this souvenir is for (only for 伴手禮 category)' },
        amount: { type: 'number', description: 'Estimated cost' },
        currency: { type: 'string', description: 'Currency code (default TWD)' },
      },
      required: ['text', 'category'],
    },
  },
];

// ── System Prompt ──

function buildSystemPrompt(tripContext?: { name?: string; startDate?: string; endDate?: string }): string {
  let prompt = `You are a friendly and knowledgeable travel planning assistant embedded in a travel dashboard app. You help users plan their trips, suggest activities, provide local tips, and answer travel-related questions. Always respond in the same language the user writes in. Be concise but helpful, and use emojis where appropriate.

You have access to tools that can control the app:
- navigate_to_page: Switch to different pages in the app.
- add_flight: Add flight information to the current trip.
- add_hotel: Add hotel/accommodation to the current trip.
- add_checklist_item: Add items to the checklist.

When the user uploads a PDF (its text content will be provided), analyze it carefully and extract relevant travel information. If it's a flight booking confirmation, use add_flight. If it's a hotel booking, use add_hotel.

IMPORTANT: When calling tools that create data (add_flight, add_hotel, add_checklist_item), always explain what you're about to add BEFORE calling the tool, so the user knows what to expect in the confirmation dialog.`;

  if (tripContext?.name) {
    prompt += `\n\nThe user is currently planning a trip: "${tripContext.name}"`;
    if (tripContext.startDate && tripContext.endDate) {
      prompt += ` from ${tripContext.startDate} to ${tripContext.endDate}`;
    }
    prompt += `. Keep this context in mind when answering questions.`;
  }

  return prompt;
}

// ══════════════════════════════════
// OpenAI API
// ══════════════════════════════════

async function sendOpenAI({ messages, tripContext, onChunk, signal, useTools = true }: SendMessageOptions): Promise<SendMessageResult> {
  const apiKey = getApiKey('openai');
  if (!apiKey) throw new Error('請先設定 OpenAI API Key');

  const model = getSelectedModel('openai');
  const systemMessage: ChatMessage = { role: 'system', content: buildSystemPrompt(tripContext) };
  const fullMessages = [systemMessage, ...messages];

  const body: any = {
    model,
    messages: fullMessages,
    temperature: 0.7,
    max_tokens: 2048,
  };

  if (useTools) {
    body.tools = TOOL_DEFS.map(t => ({ type: 'function', function: t }));
    body.tool_choice = 'auto';
    body.stream = false;
  } else {
    body.stream = !!onChunk;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const code = response.status;
    if (code === 401) throw new Error('API Key 無效，請重新設定。');
    if (code === 429) throw new Error('API 額度不足或請求頻率過高。請到 platform.openai.com/settings/organization/billing 儲值後再試。');
    if (code === 404) throw new Error(`模型 ${model} 不存在或你的帳號無法使用此模型。`);
    throw new Error(err?.error?.message || `API 錯誤 (${code})`);
  }

  // Streaming (only without tools)
  if (!useTools && onChunk && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n').filter(l => l.startsWith('data: '))) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) { result += content; onChunk(result); }
        } catch { /* skip */ }
      }
    }
    return { content: result };
  }

  // Non-streaming
  const data = await response.json();
  const message = data.choices?.[0]?.message;

  if (message?.tool_calls?.length > 0) {
    return { content: message.content || null, toolCalls: message.tool_calls };
  }
  return { content: message?.content || '' };
}

// ══════════════════════════════════
// Gemini API
// ══════════════════════════════════

function convertToGeminiContents(messages: ChatMessage[]): any[] {
  const contents: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue; // handled separately

    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content || '' }] });
    } else if (msg.role === 'assistant') {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const parts = msg.tool_calls.map(tc => ({
          functionCall: {
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments),
          },
        }));
        // If there's also text content, add it as well
        if (msg.content) parts.unshift({ text: msg.content } as any);
        contents.push({ role: 'model', parts });
      } else {
        contents.push({ role: 'model', parts: [{ text: msg.content || '' }] });
      }
    } else if (msg.role === 'tool') {
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: msg.name || 'unknown',
            response: { result: msg.content || '' },
          },
        }],
      });
    }
  }

  return contents;
}

async function sendGemini({ messages, tripContext, signal, useTools = true }: SendMessageOptions): Promise<SendMessageResult> {
  const apiKey = getApiKey('gemini');
  if (!apiKey) throw new Error('請先設定 Gemini API Key');

  const model = getSelectedModel('gemini');
  const systemPrompt = buildSystemPrompt(tripContext);
  const contents = convertToGeminiContents(messages);

  const body: any = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };

  if (useTools) {
    body.tools = [{
      function_declarations: TOOL_DEFS,
    }];
    body.tool_config = {
      function_calling_config: { mode: 'AUTO' },
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const code = response.status;
    if (code === 400) throw new Error(err?.error?.message || '請求格式錯誤，請確認 API Key 是否正確。');
    if (code === 403) throw new Error('API Key 無效或沒有權限，請重新設定。');
    if (code === 429) throw new Error('Gemini API 請求過多，請稍後再試。（免費版有每分鐘次數限制）');
    if (code === 404) throw new Error(`模型 ${model} 不存在，請選擇其他模型。`);
    throw new Error(err?.error?.message || `Gemini API 錯誤 (${code})`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  if (!candidate?.content?.parts) {
    // May be blocked by safety filter
    const reason = candidate?.finishReason;
    if (reason === 'SAFETY') throw new Error('回應被安全過濾器封鎖，請修改問題後重試。');
    return { content: '（AI 沒有回應，請再試一次）' };
  }

  const parts = candidate.content.parts;
  const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
  const functionCalls = parts.filter((p: any) => p.functionCall);

  if (functionCalls.length > 0) {
    const toolCalls: ToolCall[] = functionCalls.map((p: any, i: number) => ({
      id: `gemini-tc-${Date.now()}-${i}`,
      type: 'function' as const,
      function: {
        name: p.functionCall.name,
        arguments: JSON.stringify(p.functionCall.args || {}),
      },
    }));
    return { content: textParts.join('') || null, toolCalls };
  }

  return { content: textParts.join('') || '' };
}

// ══════════════════════════════════
// Unified sendMessage
// ══════════════════════════════════

export async function sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
  const provider = getProvider();
  if (provider === 'gemini') {
    return sendGemini(options);
  }
  return sendOpenAI(options);
}

// ── PDF Text Extraction (provider-independent) ──

export async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  const maxPages = Math.min(pdf.numPages, 3);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(' ');
    pages.push(text);
  }

  return pages.join('\n');
}
