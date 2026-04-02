import { useState, useRef, useEffect, useCallback } from 'react';
import {
  type ChatMessage,
  type OpenAIModel,
  AVAILABLE_MODELS,
  hasApiKey,
  getApiKey,
  setApiKey,
  clearApiKey,
  getSelectedModel,
  setSelectedModel,
  sendMessage,
} from '../../services/openaiService';
import './ChatWidget.css';

interface ChatWidgetProps {
  tripContext?: {
    name?: string;
    startDate?: string;
    endDate?: string;
  };
}

type View = 'chat' | 'settings' | 'setup';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function ChatWidget({ tripContext }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<View>(() => hasApiKey() ? 'chat' : 'setup');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<OpenAIModel>(getSelectedModel);
  const [keyInput, setKeyInput] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && view === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, view]);

  const handleSaveKey = useCallback(() => {
    if (!keyInput.trim()) return;
    setApiKey(keyInput);
    setKeyInput('');
    setView('chat');
    setError(null);
  }, [keyInput]);

  const handleClearKey = useCallback(() => {
    clearApiKey();
    setMessages([]);
    setView('setup');
    setError(null);
  }, []);

  const handleModelChange = useCallback((m: OpenAIModel) => {
    setModel(m);
    setSelectedModel(m);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    setError(null);

    const userMsg: DisplayMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // Build history for API
    const history: ChatMessage[] = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Create placeholder assistant message
    const assistantId = `asst-${Date.now()}`;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await sendMessage({
        messages: history,
        tripContext,
        signal: controller.signal,
        onChunk: (partialContent) => {
          setMessages(prev => {
            const existing = prev.find(m => m.id === assistantId);
            if (existing) {
              return prev.map(m => m.id === assistantId ? { ...m, content: partialContent } : m);
            }
            return [...prev, {
              id: assistantId,
              role: 'assistant' as const,
              content: partialContent,
              timestamp: Date.now(),
            }];
          });
        },
      });

      // Ensure final message is set
      setMessages(prev => {
        const existing = prev.find(m => m.id === assistantId);
        if (existing) {
          return prev.map(m => m.id === assistantId ? { ...m, content: result } : m);
        }
        return [...prev, {
          id: assistantId,
          role: 'assistant' as const,
          content: result,
          timestamp: Date.now(),
        }];
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || '發送失敗，請稍後再試。');
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [input, isLoading, messages, tripContext]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleSuggestion = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const currentModel = AVAILABLE_MODELS.find(m => m.id === model);

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
                <div className="chat-header-model">{currentModel?.label ?? model}</div>
              </div>
            </div>
            <div className="chat-header-actions">
              {view === 'chat' && hasApiKey() && (
                <button
                  className="chat-header-btn"
                  onClick={() => setView('settings')}
                  title="設定"
                >
                  ⚙️
                </button>
              )}
              {view === 'settings' && (
                <button
                  className="chat-header-btn"
                  onClick={() => setView('chat')}
                  title="返回聊天"
                >
                  💬
                </button>
              )}
              <button
                className="chat-header-btn"
                onClick={() => setIsOpen(false)}
                title="關閉"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Setup View */}
          {view === 'setup' && (
            <div className="chat-setup">
              <div className="chat-setup-icon">🔑</div>
              <h3>設定 OpenAI API Key</h3>
              <p>
                請到 OpenAI Platform 申請 API Key，<br />
                貼在下方即可開始使用 AI 助理。
              </p>
              <input
                className="chat-setup-input"
                type="password"
                placeholder="sk-..."
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                autoFocus
              />
              <button
                className="chat-setup-btn"
                onClick={handleSaveKey}
                disabled={!keyInput.trim() || !keyInput.trim().startsWith('sk-')}
              >
                儲存並開始
              </button>
              <a
                className="chat-setup-link"
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                前往 OpenAI 申請 API Key ↗
              </a>
            </div>
          )}

          {/* Settings View */}
          {view === 'settings' && (
            <div className="chat-settings">
              <div className="chat-settings-section">
                <h4>模型選擇</h4>
                <div className="chat-model-list">
                  {AVAILABLE_MODELS.map(m => (
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

              <div className="chat-settings-section">
                <h4>API Key</h4>
                <div className="chat-key-section">
                  <div className="chat-key-status">
                    <div className={`chat-key-dot ${hasApiKey() ? '' : 'error'}`} />
                    <span>{hasApiKey() ? `已設定 (${getApiKey()?.slice(0, 7)}...${getApiKey()?.slice(-4)})` : '未設定'}</span>
                  </div>
                  {hasApiKey() && (
                    <button className="chat-clear-key-btn" onClick={handleClearKey}>
                      清除 API Key
                    </button>
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
                    <p>問我任何旅行相關的問題吧！</p>
                    <div className="chat-suggestions">
                      {tripContext?.name ? (
                        <>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion(`幫我規劃「${tripContext.name}」的每日行程`)}>
                            📋 幫我規劃每日行程
                          </button>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion('推薦當地必吃的美食和餐廳')}>
                            🍜 推薦必吃美食
                          </button>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion('當地交通方式有哪些？怎麼搭最方便？')}>
                            🚃 交通攻略
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion('推薦日本四月適合旅遊的城市')}>
                            🌸 推薦日本旅遊城市
                          </button>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion('幫我比較京都和大阪的特色')}>
                            ⛩️ 京都 vs 大阪
                          </button>
                          <button className="chat-suggestion-btn" onClick={() => handleSuggestion('第一次去日本要注意什麼？')}>
                            💡 日本旅遊新手指南
                          </button>
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

                {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                  <div className="chat-typing">
                    <div className="chat-typing-dot" />
                    <div className="chat-typing-dot" />
                    <div className="chat-typing-dot" />
                  </div>
                )}

                {error && <div className="chat-error">⚠️ {error}</div>}

                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-area">
                <div className="chat-input-row">
                  <textarea
                    ref={inputRef}
                    className="chat-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="輸入訊息..."
                    rows={1}
                    disabled={isLoading}
                  />
                  <button
                    className="chat-send-btn"
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
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
