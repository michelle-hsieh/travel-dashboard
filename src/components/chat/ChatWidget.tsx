import { useState, useRef, useEffect, useCallback } from 'react';
import {
  type AIProvider,
  type ChatMessage,
  type ToolCall,
  type SendMessageResult,
  PROVIDER_INFO,
  getProvider,
  setProvider as saveProvider,
  hasApiKey,
  getApiKey,
  setApiKey,
  clearApiKey,
  getAvailableModels,
  getSelectedModel,
  setSelectedModel,
  sendMessage,
  extractPdfText,
} from '../../services/aiService';
import './ChatWidget.css';

// ── Types ──

type Page = 'home' | 'planner' | 'logistics' | 'resources' | 'admin';

export interface ChatWidgetProps {
  tripContext?: {
    name?: string;
    startDate?: string;
    endDate?: string;
  };
  activeTripId: string | null;
  onNavigate?: (page: Page) => void;
  onAddFlight?: (data: any) => Promise<void>;
  onAddHotel?: (data: any) => Promise<void>;
  onAddChecklistItem?: (data: any) => Promise<void>;
}

type View = 'chat' | 'settings' | 'setup';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface PendingAction {
  toolCall: ToolCall;
  label: string;
  description: string;
  icon: string;
  data: any;
}

// ── Component ──

export default function ChatWidget({
  tripContext,
  activeTripId,
  onNavigate,
  onAddFlight,
  onAddHotel,
  onAddChecklistItem,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProviderState] = useState<AIProvider>(getProvider);
  const [view, setView] = useState<View>(() => hasApiKey() ? 'chat' : 'setup');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>(() => getSelectedModel());
  const [keyInput, setKeyInput] = useState('');
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const providerInfo = PROVIDER_INFO[provider];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, pendingActions]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && view === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, view]);

  // ── Provider switching ──
  const handleSwitchProvider = useCallback((p: AIProvider) => {
    setProviderState(p);
    saveProvider(p);
    setModel(getSelectedModel(p));
    // Clear conversation when switching (message formats may be incompatible)
    setMessages([]);
    setApiMessages([]);
    setError(null);
    // Check if API key is set for the new provider
    if (!hasApiKey(p)) {
      setView('setup');
    } else {
      setView('chat');
    }
  }, []);

  const handleSaveKey = useCallback(() => {
    if (!keyInput.trim()) return;
    setApiKey(keyInput, provider);
    setKeyInput('');
    setView('chat');
    setError(null);
  }, [keyInput, provider]);

  const handleClearKey = useCallback(() => {
    clearApiKey(provider);
    setMessages([]);
    setApiMessages([]);
    setView('setup');
    setError(null);
  }, [provider]);

  const handleModelChange = useCallback((m: string) => {
    setModel(m);
    setSelectedModel(m, provider);
  }, [provider]);

  // ── Parse tool calls into PendingActions ──
  const parseToolCalls = useCallback((toolCalls: ToolCall[]): PendingAction[] => {
    return toolCalls.map(tc => {
      const args = JSON.parse(tc.function.arguments);
      switch (tc.function.name) {
        case 'navigate_to_page': {
          const pageLabels: Record<string, string> = {
            home: '旅程', planner: '行程', logistics: '準備',
            resources: '連結', admin: '授權',
          };
          return {
            toolCall: tc, label: '切換頁面', icon: '🧭',
            description: `前往「${pageLabels[args.page] || args.page}」頁面`,
            data: args,
          };
        }
        case 'add_flight':
          return {
            toolCall: tc, label: '新增航班', icon: '✈️',
            description: `${args.airline || ''} ${args.flightNo || ''} — ${args.departureAirport || '?'} → ${args.arrivalAirport || '?'}${args.departureTime ? ` (${args.departureTime})` : ''}`,
            data: args,
          };
        case 'add_hotel':
          return {
            toolCall: tc, label: '新增住宿', icon: '🏨',
            description: `${args.name || ''}${args.checkIn ? ` ${args.checkIn}` : ''}${args.checkOut ? ` ~ ${args.checkOut}` : ''}`,
            data: args,
          };
        case 'add_checklist_item':
          return {
            toolCall: tc, label: '新增清單項目', icon: '✅',
            description: `[${args.category || '待辦'}] ${args.text || ''}`,
            data: args,
          };
        default:
          return {
            toolCall: tc, label: tc.function.name, icon: '🔧',
            description: JSON.stringify(args), data: args,
          };
      }
    });
  }, []);

  // ── Execute a tool call ──
  const executeTool = useCallback(async (tc: ToolCall): Promise<string> => {
    const args = JSON.parse(tc.function.arguments);
    switch (tc.function.name) {
      case 'navigate_to_page':
        onNavigate?.(args.page as Page);
        return `已切換到「${args.page}」頁面。`;
      case 'add_flight':
        if (!activeTripId) return '錯誤：目前沒有選取任何行程。';
        await onAddFlight?.(args);
        return `已成功新增航班 ${args.airline} ${args.flightNo}。`;
      case 'add_hotel':
        if (!activeTripId) return '錯誤：目前沒有選取任何行程。';
        await onAddHotel?.(args);
        return `已成功新增住宿「${args.name}」。`;
      case 'add_checklist_item':
        if (!activeTripId) return '錯誤：目前沒有選取任何行程。';
        await onAddChecklistItem?.(args);
        return `已成功新增清單項目「${args.text}」。`;
      default:
        return `未知的工具: ${tc.function.name}`;
    }
  }, [activeTripId, onNavigate, onAddFlight, onAddHotel, onAddChecklistItem]);

  // ── Handle confirming or rejecting a pending action ──
  const handleConfirmAction = useCallback(async (action: PendingAction, approved: boolean) => {
    setPendingActions(prev => prev.filter(a => a.toolCall.id !== action.toolCall.id));

    let toolResult: string;
    if (approved) {
      try { toolResult = await executeTool(action.toolCall); }
      catch (err: any) { toolResult = `執行失敗: ${err.message}`; }
    } else {
      toolResult = '使用者取消了此操作。';
    }

    const toolResultMsg: ChatMessage = {
      role: 'tool',
      content: toolResult,
      tool_call_id: action.toolCall.id,
      name: action.toolCall.function.name,
    };

    const updatedApiMsgs = [...apiMessages, toolResultMsg];
    setApiMessages(updatedApiMsgs);
    setIsLoading(true);

    try {
      const result = await sendMessage({ messages: updatedApiMsgs, tripContext, useTools: false });
      const assistantMsg: DisplayMessage = {
        id: `asst-${Date.now()}`, role: 'assistant',
        content: result.content || toolResult, timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setApiMessages(prev => [...prev, { role: 'assistant', content: result.content || toolResult }]);
    } catch {
      const assistantMsg: DisplayMessage = {
        id: `asst-${Date.now()}`, role: 'assistant',
        content: approved ? `✅ ${toolResult}` : `❌ ${toolResult}`, timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [apiMessages, tripContext, executeTool]);

  // ── Handle tool results from AI ──
  const handleToolResult = useCallback(async (result: SendMessageResult, currentApiMsgs: ChatMessage[]) => {
    if (!result.toolCalls || result.toolCalls.length === 0) return;

    const assistantApiMsg: ChatMessage = {
      role: 'assistant', content: result.content, tool_calls: result.toolCalls,
    };
    const updatedApiMsgs = [...currentApiMsgs, assistantApiMsg];

    if (result.content) {
      setMessages(prev => [...prev, {
        id: `asst-text-${Date.now()}`, role: 'assistant',
        content: result.content!, timestamp: Date.now(),
      }]);
    }

    // Separate navigation (auto) from data ops (need confirmation)
    const navCalls = result.toolCalls.filter(tc => tc.function.name === 'navigate_to_page');
    const dataCalls = result.toolCalls.filter(tc => tc.function.name !== 'navigate_to_page');

    let finalApiMsgs = updatedApiMsgs;

    for (const tc of navCalls) {
      const toolResult = await executeTool(tc);
      finalApiMsgs = [...finalApiMsgs, {
        role: 'tool' as const, content: toolResult,
        tool_call_id: tc.id, name: tc.function.name,
      }];
    }
    setApiMessages(finalApiMsgs);

    if (dataCalls.length > 0) {
      setPendingActions(prev => [...prev, ...parseToolCalls(dataCalls)]);
      setIsLoading(false);
      return;
    }

    if (navCalls.length > 0) {
      try {
        const followUp = await sendMessage({ messages: finalApiMsgs, tripContext, useTools: false });
        if (followUp.content) {
          setMessages(prev => [...prev, {
            id: `asst-nav-${Date.now()}`, role: 'assistant',
            content: followUp.content!, timestamp: Date.now(),
          }]);
          setApiMessages(prev => [...prev, { role: 'assistant', content: followUp.content! }]);
        }
      } catch { /* navigation already done */ }
    }
    setIsLoading(false);
  }, [executeTool, parseToolCalls, tripContext]);

  // ── Send message ──
  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    if (!overrideText) setInput('');
    setError(null);

    const userMsg: DisplayMessage = {
      id: `usr-${Date.now()}`, role: 'user', content: text, timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    const userApiMsg: ChatMessage = { role: 'user', content: text };
    const updatedApiMsgs = [...apiMessages, userApiMsg];
    setApiMessages(updatedApiMsgs);
    setIsLoading(true);

    try {
      const result = await sendMessage({ messages: updatedApiMsgs, tripContext, useTools: true });

      if (result.toolCalls && result.toolCalls.length > 0) {
        await handleToolResult(result, updatedApiMsgs);
      } else {
        setMessages(prev => [...prev, {
          id: `asst-${Date.now()}`, role: 'assistant',
          content: result.content || '', timestamp: Date.now(),
        }]);
        setApiMessages(prev => [...prev, { role: 'assistant', content: result.content || '' }]);
        setIsLoading(false);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || '發送失敗，請稍後再試。');
      setIsLoading(false);
    }
  }, [input, isLoading, apiMessages, tripContext, handleToolResult]);

  // ── PDF Upload ──
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('目前僅支援 PDF 檔案上傳。');
      return;
    }

    setUploadingPdf(true);
    setError(null);

    try {
      const pdfText = await extractPdfText(file);
      if (!pdfText.trim()) {
        setError('無法從 PDF 中提取文字。');
        setUploadingPdf(false);
        return;
      }

      const userMsg: DisplayMessage = {
        id: `usr-pdf-${Date.now()}`, role: 'user',
        content: `📄 已上傳 PDF 檔案：${file.name}\n（請幫我分析內容並填入行程）`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);

      const userApiMsg: ChatMessage = {
        role: 'user',
        content: `The user uploaded a PDF file named "${file.name}". Below is the extracted text content from the PDF. Please analyze it and extract any travel-related information (flights, hotels, etc.), then use the appropriate tools to add them to the trip.\n\n--- PDF Content ---\n${pdfText.substring(0, 4000)}\n--- End of PDF Content ---`,
      };

      const updatedApiMsgs = [...apiMessages, userApiMsg];
      setApiMessages(updatedApiMsgs);
      setIsLoading(true);
      setUploadingPdf(false);

      const result = await sendMessage({ messages: updatedApiMsgs, tripContext, useTools: true });

      if (result.toolCalls && result.toolCalls.length > 0) {
        await handleToolResult(result, updatedApiMsgs);
      } else {
        setMessages(prev => [...prev, {
          id: `asst-pdf-${Date.now()}`, role: 'assistant',
          content: result.content || '無法從 PDF 中辨識出相關旅行資訊。',
          timestamp: Date.now(),
        }]);
        setApiMessages(prev => [...prev, { role: 'assistant', content: result.content || '' }]);
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(`PDF 處理失敗: ${err.message}`);
      setUploadingPdf(false);
      setIsLoading(false);
    }
  }, [apiMessages, tripContext, handleToolResult]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleSuggestion = useCallback((text: string) => {
    handleSend(text);
  }, [handleSend]);

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const currentModels = getAvailableModels(provider);
  const currentModelInfo = currentModels.find(m => m.id === model);

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          className={`chat-fab ${isOpen ? 'open' : ''}`}
          onClick={() => setIsOpen(true)}
          title="AI 旅行助理"
          id="chat-fab"
        >
          🤖
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="chat-panel" id="chat-panel">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-left">
              <span className="chat-header-icon">🤖</span>
              <div className="chat-header-info">
                <h3>AI 旅行助理</h3>
                <div className="chat-header-model">
                  {providerInfo.icon} {currentModelInfo?.label ?? model}
                </div>
              </div>
            </div>
            <div className="chat-header-actions">
              {view === 'chat' && hasApiKey(provider) && (
                <button className="chat-header-btn" onClick={() => setView('settings')} title="設定">⚙️</button>
              )}
              {view === 'settings' && (
                <button className="chat-header-btn" onClick={() => setView('chat')} title="返回聊天">💬</button>
              )}
              <button className="chat-header-btn" onClick={() => setIsOpen(false)} title="關閉">✕</button>
            </div>
          </div>

          {/* Setup View */}
          {view === 'setup' && (
            <div className="chat-setup">
              {/* Provider Toggle in Setup */}
              <div className="chat-provider-tabs">
                {(['openai', 'gemini'] as AIProvider[]).map(p => (
                  <button
                    key={p}
                    className={`chat-provider-tab ${provider === p ? 'active' : ''}`}
                    onClick={() => handleSwitchProvider(p)}
                  >
                    {PROVIDER_INFO[p].icon} {PROVIDER_INFO[p].label}
                  </button>
                ))}
              </div>
              <div className="chat-setup-icon">🔑</div>
              <h3>設定 {providerInfo.label} API Key</h3>
              <p>
                {provider === 'gemini'
                  ? <>Google AI Studio 提供免費額度，<br />非常適合一般使用！</>
                  : <>請到 OpenAI Platform 申請 API Key，<br />需要先儲值 $5 美金以上。</>
                }
              </p>
              <input
                className="chat-setup-input"
                type="password"
                placeholder={providerInfo.keyPlaceholder}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                autoFocus
              />
              <button
                className="chat-setup-btn"
                onClick={handleSaveKey}
                disabled={!keyInput.trim() || keyInput.trim().length < 8}
              >
                儲存並開始
              </button>
              <a className="chat-setup-link" href={providerInfo.keyUrl} target="_blank" rel="noopener noreferrer">
                {providerInfo.keyUrlLabel}
              </a>
            </div>
          )}

          {/* Settings View */}
          {view === 'settings' && (
            <div className="chat-settings">
              {/* Provider Switch */}
              <div className="chat-settings-section">
                <h4>AI 供應商</h4>
                <div className="chat-provider-tabs">
                  {(['openai', 'gemini'] as AIProvider[]).map(p => (
                    <button
                      key={p}
                      className={`chat-provider-tab ${provider === p ? 'active' : ''}`}
                      onClick={() => handleSwitchProvider(p)}
                    >
                      {PROVIDER_INFO[p].icon} {PROVIDER_INFO[p].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Selection */}
              <div className="chat-settings-section">
                <h4>模型選擇</h4>
                <div className="chat-model-list">
                  {currentModels.map(m => (
                    <div
                      key={m.id}
                      className={`chat-model-option ${model === m.id ? 'active' : ''}`}
                      onClick={() => handleModelChange(m.id)}
                    >
                      <div className="chat-model-radio" />
                      <div className="chat-model-info">
                        <div className="chat-model-name">{m.label}</div>
                        <div className="chat-model-desc">{m.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div className="chat-settings-section">
                <h4>{providerInfo.label} API Key</h4>
                <div className="chat-key-section">
                  <div className="chat-key-status">
                    <div className={`chat-key-dot ${hasApiKey(provider) ? '' : 'error'}`} />
                    <span>
                      {hasApiKey(provider)
                        ? `已設定 (${getApiKey(provider)?.slice(0, 7)}...${getApiKey(provider)?.slice(-4)})`
                        : '未設定'}
                    </span>
                  </div>
                  {hasApiKey(provider) && (
                    <button className="chat-clear-key-btn" onClick={handleClearKey}>清除 API Key</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Chat View */}
          {view === 'chat' && (
            <>
              <div className="chat-messages">
                {messages.length === 0 && !isLoading && (
                  <div className="chat-welcome">
                    <div className="chat-welcome-icon">✨</div>
                    <h4>嗨！我是你的 AI 旅行助理</h4>
                    <p>問我旅行問題、或上傳 PDF 讓我自動填入資料！</p>
                    <div className="chat-suggestions">
                      {tripContext?.name ? (
                        <>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion(`幫我規劃「${tripContext.name}」的每日行程`)}>📋 幫我規劃每日行程</button>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion('推薦當地必吃的美食和餐廳')}>🍜 推薦必吃美食</button>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion('帶我去看機票和住宿資訊')}>✈️ 查看機票住宿</button>
                        </>
                      ) : (
                        <>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion('推薦日本四月適合旅遊的城市')}>🌸 推薦日本旅遊城市</button>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion('幫我比較京都和大阪的特色')}>⛩️ 京都 vs 大阪</button>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion('第一次去日本要注意什麼？')}>💡 日本旅遊新手指南</button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {messages.map(msg => (
                  <div key={msg.id} className={`chat-msg ${msg.role}`}>
                    <div className="chat-bubble">{msg.content}</div>
                    <span className="chat-msg-time">{formatTime(msg.timestamp)}</span>
                  </div>
                ))}

                {/* Pending Action Confirmation Cards */}
                {pendingActions.map(action => (
                  <div key={action.toolCall.id} className="chat-action-card">
                    <div className="chat-action-header">
                      <span className="chat-action-icon">{action.icon}</span>
                      <span className="chat-action-label">{action.label}</span>
                    </div>
                    <div className="chat-action-desc">{action.description}</div>
                    <div className="chat-action-buttons">
                      <button className="chat-action-btn confirm" onClick={() => handleConfirmAction(action, true)}>
                        ✓ 確認新增
                      </button>
                      <button className="chat-action-btn cancel" onClick={() => handleConfirmAction(action, false)}>
                        ✕ 取消
                      </button>
                    </div>
                  </div>
                ))}

                {isLoading && pendingActions.length === 0 && (
                  <div className="chat-typing">
                    <div className="chat-typing-dot" />
                    <div className="chat-typing-dot" />
                    <div className="chat-typing-dot" />
                  </div>
                )}

                {error && <div className="chat-error">⚠️ {error}</div>}
                <div ref={messagesEndRef} />
              </div>

              {/* Hidden file input */}
              <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileUpload} />

              <div className="chat-input-area">
                <div className="chat-input-row">
                  <button
                    className="chat-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || uploadingPdf}
                    title="上傳 PDF"
                  >
                    {uploadingPdf ? '⏳' : '📎'}
                  </button>
                  <textarea
                    ref={inputRef}
                    className="chat-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={uploadingPdf ? '解析 PDF 中...' : '輸入訊息...'}
                    rows={1}
                    disabled={isLoading || uploadingPdf}
                  />
                  <button
                    className="chat-send-btn"
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isLoading || uploadingPdf}
                    title="送出"
                  >
                    ➤
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
