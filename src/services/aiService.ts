// AI Service — 支援 OpenAI + Gemini 雙供應商
// API Key 只存在使用者瀏覽器的 localStorage 裡

// ── Types ──

export type AIProvider = 'openai' | 'gemini' | 'cerebras';

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
  systemPrompt?: string;
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
const CEREBRAS_KEY_STORE = 'cerebras_api_key';
const CEREBRAS_MODEL_STORE = 'cerebras_model';

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
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite', description: '免費・極速・省資源' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: '免費・輕量' },
];

export const CEREBRAS_MODELS: ModelInfo[] = [
  { id: 'llama3.3-70b', label: 'Llama 3.3 70B', description: '強力推薦：解析能力最強' },
  { id: 'llama3.1-8b', label: 'Llama 3.1 8B', description: '極速版' },
  { id: 'gpt-oss-120b', label: 'GPT OSS 120B', description: '目前最快的超大模型' },
  { id: 'qwen-3-235b-a22b-instruct-2507', label: 'Qwen 3 235B', description: '高階指導模型' },
  { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 (70B)', description: '蒸餾模型' }
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
  cerebras: {
    label: 'Cerebras',
    icon: '⚡',
    keyPrefix: '',
    keyPlaceholder: 'csk-...',
    keyUrl: 'https://cloud.cerebras.ai/',
    keyUrlLabel: '前往 Cerebras Cloud 申請 API Key ↗',
  },
};

// ── Provider Management ──

export function getProvider(): AIProvider {
  const p = localStorage.getItem(PROVIDER_KEY);
  if (p === 'openai' || p === 'gemini' || p === 'cerebras') return p;
  return 'openai';
}

export function setProvider(p: AIProvider): void {
  localStorage.setItem(PROVIDER_KEY, p);
}

// ── Key Management ──

export function getApiKey(provider?: AIProvider): string | null {
  const p = provider ?? getProvider();
  if (p === 'openai') return localStorage.getItem(OPENAI_KEY_STORE);
  if (p === 'gemini') return localStorage.getItem(GEMINI_KEY_STORE);
  if (p === 'cerebras') return localStorage.getItem(CEREBRAS_KEY_STORE);
  return null;
}

export function setApiKey(key: string, provider?: AIProvider): void {
  const p = provider ?? getProvider();
  const store = p === 'openai' ? OPENAI_KEY_STORE : p === 'gemini' ? GEMINI_KEY_STORE : CEREBRAS_KEY_STORE;
  localStorage.setItem(store, key.trim());
}

export function clearApiKey(provider?: AIProvider): void {
  const p = provider ?? getProvider();
  const store = p === 'openai' ? OPENAI_KEY_STORE : p === 'gemini' ? GEMINI_KEY_STORE : CEREBRAS_KEY_STORE;
  localStorage.removeItem(store);
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
  if (p === 'openai') return OPENAI_MODELS;
  if (p === 'gemini') return GEMINI_MODELS;
  return CEREBRAS_MODELS;
}

export function getSelectedModel(provider?: AIProvider): string {
  const p = provider ?? getProvider();
  const storeKey = p === 'openai' ? OPENAI_MODEL_STORE : p === 'gemini' ? GEMINI_MODEL_STORE : CEREBRAS_MODEL_STORE;
  const stored = localStorage.getItem(storeKey);
  const models = getAvailableModels(p);
  if (stored && models.some(m => m.id === stored)) return stored;
  
  // If stored model is invalid or legacy, forcefully set and return the first available model
  const defaultModel = models[0].id;
  localStorage.setItem(storeKey, defaultModel);
  return defaultModel;
}

export function setSelectedModel(model: string, provider?: AIProvider): void {
  const p = provider ?? getProvider();
  const storeKey = p === 'openai' ? OPENAI_MODEL_STORE : p === 'gemini' ? GEMINI_MODEL_STORE : CEREBRAS_MODEL_STORE;
  localStorage.setItem(storeKey, model);
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
  {
    name: 'create_full_trip',
    description: 'Create a BRAND NEW trip with all its details (Flights, Hotels, Daily Plan) extracted from a PDF or comprehensive text. Only use this when the user asks to create/import a new trip from provided content.',
    parameters: {
      type: 'object' as const,
      properties: {
        tripData: {
          type: 'object' as const,
          description: "The full trip JSON structure. Important: every object in 'places' MUST have a 'dayId' string that exactly matches the 'id' of one of the objects in the 'days' array.",
          properties: {
            name: { type: 'string', description: 'Trip name' },
            startDate: { type: 'string', description: 'YYYY-MM-DD' },
            endDate: { type: 'string', description: 'YYYY-MM-DD' },
            subcollections: {
              type: 'object' as const,
              properties: {
                days: { type: 'array', items: { type: 'object' } },
                places: { type: 'array', items: { type: 'object' } },
                flights: { type: 'array', items: { type: 'object' } },
                hotels: { type: 'array', items: { type: 'object' } },
                checklistItems: { type: 'array', items: { type: 'object' } }
              }
            }
          },
          required: ['name']
        }
      },
      required: ['tripData']
    }
  },
  {
    name: 'geocode_trip',
    description: 'Find and label map coordinates (lat/lng) for all places and hotels in a trip. Use this AFTER create_full_trip if the user wants to see places on the map.',
    parameters: {
      type: 'object' as const,
      properties: {
        tripId: { type: 'string', description: 'The ID of the trip to geocode.' },
      },
      required: ['tripId']
    }
  }
];

// ── System Prompt ──

function buildSystemPrompt(tripContext?: { name?: string; startDate?: string; endDate?: string }): string {
  let prompt = `You are a friendly and knowledgeable travel planning assistant embedded in a travel dashboard app. You help users plan their trips, suggest activities, provide local tips, and answer travel-related questions. Always respond in the same language the user writes in. Be concise but helpful, and use emojis where appropriate.

You have access to tools that can control the app:
- navigate_to_page: Switch to different pages in the app.
- add_flight: Add flight information to the current trip.
- add_hotel: Add hotel/accommodation to the current trip.
- add_checklist_item: Add items to the checklist.
- create_full_trip: Extract and create an entirely new trip from comprehensive data (like a agency PDF).
- geocode_trip: Automatically find map coordinates for all places in a trip (takes some time).

When the user uploads a file or provides a complex itinerary, you MUST use the \`create_full_trip\` tool to build the trip.

CRITICAL RULES for create_full_trip:
- ALL mentioned attractions/places MUST be included in the 'places' array.
- Each place MUST have a 'dayId' field.
- If you can determine which day a place belongs to, set 'dayId' to the matching day's 'id'.
- If you CANNOT determine which day a place belongs to, ALWAYS set 'dayId' to 'pool' (this moves it to the 待排 unscheduled section).
- Ensure flights and hotels are also captured in their respective arrays.
- The 'days' array must have a 'date' field in YYYY-MM-DD format and a 'sortOrder' number starting from 0.

IMPORTANT: NEVER output raw JSON in your text response. You MUST use the supplied tools.
IMPORTANT 2: Include the tool call in the same response as your text explanation.
IMPORTANT 3: Explain what you're about to do IN THE SAME RESPONSE as the tool call.`;

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
// Internal Global State & Helpers
// ══════════════════════════════════

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second minimum between requests

async function enforceCooldown() {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLast;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
}

// Generic OpenAI-Style Helper
// ══════════════════════════════════

async function sendOpenAIStyle({ 
  messages, 
  tripContext, 
  onChunk, 
  signal, 
  useTools, 
  systemPrompt,
  provider,
  baseUrl,
  apiKey,
  model
}: SendMessageOptions & { provider: AIProvider, baseUrl: string, apiKey: string, model: string }): Promise<SendMessageResult> {
  await enforceCooldown();

  const systemMessage: ChatMessage = { role: 'system', content: systemPrompt || buildSystemPrompt(tripContext) };
  const fullMessages = [systemMessage, ...messages];

  const body: any = {
    model,
    messages: fullMessages,
    temperature: provider === 'cerebras' ? 0.3 : 0.7, // Lower temperature for more stable tool calls on Cerebras
    max_tokens: provider === 'cerebras' ? 4096 : 8192,
  };

  if (useTools) {
    // Current OpenAI standard
    body.tools = TOOL_DEFS.map(t => ({ type: 'function', function: t }));
    body.tool_choice = 'auto';
    
    // Cerebras often performs better WITH streaming disabled for tools 
    // or very specific formatting. We ensure stream is false here.
    body.stream = false;
  } else {
    body.stream = !!onChunk;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let errMsg = `未知錯誤 (${response.status})`;
    try {
      const err = await response.json();
      // Handle various error formats (OpenAI, Cerebras, etc.)
      const rawMsg = err?.error?.message || err?.message || JSON.stringify(err);
      
      // Map specific errors to user-friendly messages
      if (rawMsg.includes('too_many_tokens_error') || rawMsg.includes('limit exceeded')) {
        errMsg = `${provider} 模型目前使用量過高（token 限制），請稍候 10-20 秒後再試。`;
      } else if (rawMsg.includes('rate_limit')) {
        errMsg = `${provider} 請求頻率過高，請稍慢點再試。`;
      } else {
        errMsg = rawMsg;
      }
    } catch { /* use default */ }

    console.error(`${provider} API Error:`, errMsg);
    
    if (response.status === 401) throw new Error(`${provider} API Key 無效，請重新設定。`);
    if (response.status === 429) throw new Error(errMsg); // Use our parsed message
    if (response.status === 404) throw new Error(`模型 ${model} 在 ${provider} 不存在或無法使用。`);
    throw new Error(`${provider} API 錯誤: ${errMsg}`);
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

  const data = await response.json();
  const choice = data.choices?.[0]?.message;

  if (!choice) return { content: '（AI 沒有回應，請再試一次）' };

  return {
    content: choice.content || null,
    toolCalls: choice.tool_calls,
  };
}

// ══════════════════════════════════
// OpenAI API
// ══════════════════════════════════

async function sendOpenAI(options: SendMessageOptions): Promise<SendMessageResult> {
  const apiKey = getApiKey('openai');
  if (!apiKey) throw new Error('請先設定 OpenAI API Key');
  const model = getSelectedModel('openai');

  return sendOpenAIStyle({
    ...options,
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey,
    model
  });
}

// ══════════════════════════════════
// Cerebras API
// ══════════════════════════════════

async function sendCerebras(options: SendMessageOptions): Promise<SendMessageResult> {
  const apiKey = getApiKey('cerebras');
  if (!apiKey) throw new Error('請先設定 Cerebras API Key');
  const model = getSelectedModel('cerebras');

  return sendOpenAIStyle({
    ...options,
    provider: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey,
    model
  });
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

async function sendGemini({ messages, tripContext, signal, useTools = true, systemPrompt }: SendMessageOptions): Promise<SendMessageResult> {
  const apiKey = getApiKey('gemini');
  if (!apiKey) throw new Error('請先設定 Gemini API Key');

  const model = getSelectedModel('gemini');
  const systemInstruction = systemPrompt || buildSystemPrompt(tripContext);
  const contents = convertToGeminiContents(messages);

  const body: any = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
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
// Unified sendMessage with Retry/Backoff
// ══════════════════════════════════

export async function sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
  const maxRetries = 3;
  // Gemini free tier has strict RPM limits. Start with 15s and double.
  // Total wait: 15 + 30 + 60 = 105 seconds, enough to recover.
  let delay = 15000;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const provider = getProvider();
      if (provider === 'gemini') return await sendGemini(options);
      if (provider === 'cerebras') return await sendCerebras(options);
      return await sendOpenAI(options);
    } catch (err: any) {
      const msg = err.message || '';
      const isRetryable = msg.includes('429') || 
                          msg.includes('Too Many Requests') || 
                          msg.includes('rate_limit') ||
                          msg.includes('high traffic') ||       // Cerebras actual error
                          msg.includes('try again soon') ||     // Cerebras alt phrasing
                          msg.includes('請求過多') ||            // Gemini 中文錯誤
                          msg.includes('使用量過高') ||          // Cerebras 中文錯誤
                          msg.includes('頻率過高') ||            // alt Chinese phrasing
                          msg.includes('RESOURCE_EXHAUSTED');
      
      if (isRetryable && i < maxRetries) {
        console.warn(`AI Rate limit hit. Retrying in ${delay / 1000}s... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff: 15s → 30s → 60s
        continue;
      }
      throw err;
    }
  }
  throw new Error('AI 請求失敗，已達最大重試次數。請等待 1-2 分鐘後再試。');
}

// ── File Text Extraction (multi-format) ──

export async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const ext = name.split('.').pop() || '';

  // PDF
  if (ext === 'pdf') {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages: string[] = [];
    const maxPages = Math.min(pdf.numPages, 8);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: any) => item.str).join(' '));
    }
    return pages.join('\n');
  }

  // Plain text / Markdown / CSV
  if (['txt', 'md', 'markdown', 'csv'].includes(ext)) {
    return await file.text();
  }

  // DOCX (Word) — unzip and extract XML text
  if (ext === 'docx') {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const xmlFile = zip.file('word/document.xml');
    if (!xmlFile) throw new Error('無法讀取 Word 文件內容');
    const xml = await xmlFile.async('text');
    return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // PPTX (PowerPoint) — unzip and extract slide XML text
  if (ext === 'pptx') {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const slideTexts: string[] = [];
    const slideFiles = Object.keys(zip.files)
      .filter(f => f.startsWith('ppt/slides/slide') && f.endsWith('.xml'))
      .sort();
    for (const slideFile of slideFiles) {
      const xml = await zip.files[slideFile].async('text');
      const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) slideTexts.push(text);
    }
    return slideTexts.join('\n');
  }

  // XLSX (Excel) — extract shared strings XML for text
  if (ext === 'xlsx') {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const sharedFile = zip.file('xl/sharedStrings.xml');
    if (!sharedFile) {
      return '[Excel 檔案：未包含文字字串，建議另存為 CSV 後再上傳]';
    }
    const xml = await sharedFile.async('text');
    const matches = xml.match(/<t[^>]*>([^<]+)<\/t>/g) || [];
    const strings = matches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    return strings.join(', ');
  }

  // Legacy formats (.doc, .xls, .ppt) — not supported
  if (['doc', 'xls', 'ppt'].includes(ext)) {
    throw new Error(`舊版 Office 格式（.${ext}）不支援直接解析，請另存為 .docx / .xlsx / .pptx 或轉存為 .txt / .csv 後再上傳。`);
  }

  throw new Error(`不支援的檔案格式：.${ext}`);
}

// Keep legacy export for backwards compat
export async function extractPdfText(file: File): Promise<string> {
  return extractFileText(file);
}

// ── Geocoding Helper ──

export async function getCoordinatesFromAI(name: string, address?: string): Promise<{ lat: number, lng: number } | null> {
  const results = await getBatchCoordinatesFromAI([{ id: 'single', name, address }]);
  return results['single'] || null;
}

export async function getBatchCoordinatesFromAI(
  items: { id: string, name: string, address?: string }[]
): Promise<Record<string, { lat: number, lng: number }>> {
  if (items.length === 0 || !hasApiKey()) return {};

  const placesList = items.map(it => `- [${it.id}] Name: ${it.name}, Address: ${it.address || 'N/A'}`).join('\n');
  
  const prompt = `Find precise latitude and longitude for these ${items.length} locations.
Return ONLY a valid JSON object where keys are the IDs provided in brackets and values are { "lat": number, "lng": number }.
If a location is unknown, omit it from the result object.

Locations to geocode:
${placesList}`;

  const customSystemPrompt = "You are a precise geocoding tool. You output ONLY valid JSON. No explanation, no markdown.";

  try {
    const result = await sendMessage({
      messages: [{ role: 'user', content: prompt }],
      useTools: false,
      systemPrompt: customSystemPrompt,
    });

    if (!result.content) return {};
    const cleaned = result.content.replace(/```json|```/g, '').trim();
    
    // Safely extract JSON if AI includes extra text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonToParse = jsonMatch ? jsonMatch[0] : cleaned;

    const parsed = JSON.parse(jsonToParse);
    const finalResults: Record<string, { lat: number, lng: number }> = {};
    
    for (const id in parsed) {
      if (typeof parsed[id]?.lat === 'number' && typeof parsed[id]?.lng === 'number') {
        finalResults[id] = { lat: parsed[id].lat, lng: parsed[id].lng };
      }
    }
    return finalResults;
  } catch (err) {
    console.error(`Batch Geocoding failed:`, err);
    return {};
  }
}

