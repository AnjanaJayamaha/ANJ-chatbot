import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Trash2, Settings, X, Camera, Plus, Mic, AlertCircle, CheckCircle2, Bot, Brain, Heart, PersonStanding, StarIcon, Pencil, Palette } from 'lucide-react';
import './App.css';
import KaleidoscopeDraw from './KaleidoscopeDraw';
import './KaleidoscopeDraw.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
  isError?: boolean;
}

// ─── Groq Config ──────────────────────────────────────────────────────────────
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ─── Chatbot Identity & Purpose ─────────────────────────────────────────────────
const CHATBOT_PURPOSE = "to be a comforting, aesthetic companion that provides emotional support and helps track daily goals";

const getSystemPrompt = (userName: string, mood: string) => `
You are ANJ Chatbot, an AI assistant built by ANJ Studio.

Your purpose is: ${CHATBOT_PURPOSE}.

The user's name is ${userName || 'User'} and their current mood is: ${mood}.

Communicate in a natural, human-like way. Be thoughtful, emotionally aware, and direct.

Rules:
- No emojis unless the user requests them.
- Keep answers short to medium length.
- Be deep when needed, but never overly wordy.
- Be short and sweet.
- Use clear, clean language.
- Avoid sounding like customer support or a motivational speaker.
- Listen carefully and respond to the core meaning of the user's message.
- Show understanding without exaggeration.
- Prefer meaningful conversation over generic advice.
- When appropriate, ask one relevant follow-up question rather than multiple questions.

- If asked who you are, introduce yourself as ANJ Chatbot.
- Mention that ANJ Chatbot is a creation of ANJ Creations, developed by Anjana Jayamaha, an Information Technology & Management undergraduate at the University of Moratuwa.
- Keep the introduction brief, natural, and professional.
`;

// ─── Groq Streaming Call via Vercel Edge API ──────────────────────────────────
async function streamGroq(
  history: { role: string; content: string }[],
  systemPrompt: string,
  onChunk: (t: string) => void,
  onDone: () => void,
  onError: (e: string) => void
) {
  try {
    // vercel edge api
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: history,
        systemPrompt: systemPrompt
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      onError(errText || `API Error ${res.status}`);
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') { onDone(); return; }
        try {
          const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
          if (delta) onChunk(delta);
        } catch { /* skip */ }
      }
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Network error');
  }
}

// ─── Markdown Parser ──────────────────────────────────────────────────────────
function parseMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code class="code-block">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul class="md-list">$&</ul>')
    .replace(/\n\n/g, '</p><p class="md-p">')
    .replace(/\n/g, '<br/>');
}

const LANDING_MOOD_GOALS: Record<string, { id: number, text: string }[]> = {
  'happy': [
    { id: 1, text: 'Take a deep breath' },
    { id: 2, text: 'Think of one thing you are grateful for' },
    { id: 3, text: 'Stretch your arms' }
  ],
  'calm': [
    { id: 1, text: 'Relax your shoulders' },
    { id: 2, text: 'Drink a sip of water' },
    { id: 3, text: 'Take 3 deep breaths' }
  ],
  'sad': [
    { id: 1, text: 'Acknowledge your feelings' },
    { id: 2, text: 'Be gentle with yourself' },
    { id: 3, text: 'Get comfortable' }
  ],
  'anxious': [
    { id: 1, text: 'Ground yourself (5-4-3-2-1 technique)' },
    { id: 2, text: 'Remind yourself you are safe' },
    { id: 3, text: 'Take a slow, deep exhale' }
  ],
  'angry': [
    { id: 1, text: 'Count to 10 slowly' },
    { id: 2, text: 'Unclench your jaw' },
    { id: 3, text: 'Take a step back' }
  ]
};


// ─── App Component ─────────────────────────────────────────────────────────────
function App() {
  const [hasEnteredChat, setHasEnteredChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showZenDraw, setShowZenDraw] = useState(false);
  const [appTheme, setAppTheme] = useState<'boy' | 'girl'>('boy');

  const [userName, setUserName] = useState(() => localStorage.getItem('chat_user_name') || 'User');
  const [userRole, setUserRole] = useState(() => localStorage.getItem('chat_user_role') || 'Explorer');
  const [userAvatar, setUserAvatar] = useState(() => localStorage.getItem('chat_user_avatar') || '');

  const [currentMood, setCurrentMood] = useState('happy');
  const [completedGoals, setCompletedGoals] = useState<number[]>([]);

  const handleMoodChange = (mood: string) => {
    setCurrentMood(mood);
    setCompletedGoals([]);
  };

  const toggleLandingGoal = (id: number) => {
    setCompletedGoals(prev => {
      const alreadyDone = prev.includes(id);
      const next = alreadyDone ? prev.filter(gId => gId !== id) : [...prev, id];
      const total = LANDING_MOOD_GOALS[currentMood]?.length || 0;
      if (!alreadyDone && next.length === total) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 2200);
      }
      return next;
    });
  };

  const [showCelebration, setShowCelebration] = useState(false);
  const currentLandingGoals = LANDING_MOOD_GOALS[currentMood] || [];
  const allLandingGoalsCompleted = currentLandingGoals.length > 0 && completedGoals.length === currentLandingGoals.length;

  const [messages, setMessages] = useState<Message[]>([]);
  const [groqHistory, setGroqHistory] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const suggestions = [
    { text: "Who are you?" },
    { text: "What can you do for me?" },
    { text: "Help me process my feelings" },
  ];

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result as string;
      setUserAvatar(b64);
      localStorage.setItem('chat_user_avatar', b64);
    };
    reader.readAsDataURL(file);
  };

  const saveProfileData = () => {
    localStorage.setItem('chat_user_name', userName);
    localStorage.setItem('chat_user_role', userRole);
    setShowProfile(false);
  };

  const handleSend = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;
    setApiError(null);

    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: trimmed, timestamp: new Date() };
    const newHistory = [...groqHistory, { role: 'user', content: trimmed }];
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const botMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: botMsgId, sender: 'bot', text: '', timestamp: new Date() }]);

    let fullResponse = '';
    await streamGroq(
      newHistory,
      getSystemPrompt(userName, currentMood),
      (chunk) => {
        fullResponse += chunk;
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: fullResponse } : m));
      },
      () => {
        setGroqHistory([...newHistory, { role: 'assistant', content: fullResponse }]);
        setIsLoading(false);
      },
      (err) => {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: `Error: ${err}`, isError: true } : m));
        setApiError(err);
        setIsLoading(false);
      }
    );
  };

  const clearChat = () => {
    if (window.confirm('Clear all messages?')) {
      setMessages([]);
      setGroqHistory([]);
    }
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ─── ZEN DRAW FULL VIEW ────────────────────────────────────────────────────
  if (showZenDraw) {
    return (
      <div className={`chatbot-app ${appTheme}-theme`}>
        <KaleidoscopeDraw theme={appTheme} onClose={() => setShowZenDraw(false)} />
      </div>
    );
  }

  // ─── WELCOME SCREEN ──────────────────────────────────────────────────────
  if (!hasEnteredChat) {
    const MOOD_EMOJIS = [
      { label: 'Happy', emoji: '😊', key: 'happy' },
      { label: 'Calm', emoji: '😌', key: 'calm' },
      { label: 'Sad', emoji: '😔', key: 'sad' },
      { label: 'Anxious', emoji: '😰', key: 'anxious' },
      { label: 'Angry', emoji: '😡', key: 'angry' }
    ];

    return (
      <div className={`chatbot-app ${appTheme}-theme`}>
        {showCelebration && (
          <div className="celebration-overlay">
            <div className="celebration-modal-card">
              <div className="success-checkmark-wrapper">
                <svg className="checkmark-svg" viewBox="0 0 52 52">
                  <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                  <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                </svg>
              </div>
              <div className="celebration-text">
                {appTheme === 'boy' ? 'You are ready.' : 'All done! ✨'}
              </div>
              <div className="celebration-subtext">
                Let's start our conversation.
              </div>
            </div>
            <div className="confetti-container">
              {Array.from({ length: 50 }).map((_, i) => {
                const shape = ['circle', 'square', 'triangle', 'sparkle'][i % 4];
                const delay = (Math.random() * 0.4).toFixed(2);
                const duration = (1.4 + Math.random() * 1.2).toFixed(2);
                const angle = (Math.random() * 360).toFixed(0);
                const velocityX = (Math.random() * 400 - 200).toFixed(0);
                const velocityY = (Math.random() * -300 - 150).toFixed(0);
                const scale = (0.5 + Math.random() * 0.7).toFixed(2);
                const colorHue = i % 2 === 0
                  ? (appTheme === 'boy' ? 195 + Math.random() * 20 : 330 + Math.random() * 20)
                  : Math.random() * 360;

                return (
                  <span
                    key={i}
                    className={`confetti-particle shape-${shape} ${appTheme === 'girl' ? 'girl-confetti' : ''}`}
                    style={{
                      '--delay': `${delay}s`,
                      '--duration': `${duration}s`,
                      '--angle': `${angle}deg`,
                      '--vx': `${velocityX}px`,
                      '--vy': `${velocityY}px`,
                      '--scale': scale,
                      '--color': `hsl(${colorHue}, 95%, 65%)`,
                    } as React.CSSProperties}
                  />
                );
              })}
            </div>
          </div>
        )}
        <div className="landing-page-container animate-fade-in">

          <header className="landing-header">
            <div className="header-logo logo-unified">
              <img src="/logo.png" alt="A" className="logo-img-as-a" />
              <span className="brand-suffix">NJ</span>
              <span className="brand-sub">Chatbot</span>
            </div>
            <div className="theme-toggle-group">
              <button
                className={`theme-toggle-btn ${appTheme === 'girl' ? 'active girl' : ''}`}
                onClick={() => setAppTheme('girl')}
              >
                For Her
              </button>
              <button
                className={`theme-toggle-btn ${appTheme === 'boy' ? 'active boy' : ''}`}
                onClick={() => setAppTheme('boy')}
              >
                For Him
              </button>
            </div>
            <div className="header-links">
              <button
                className="header-icon-btn zen-art-nav-btn"
                onClick={() => setShowZenDraw(true)}
                title="Cosmic Zen — Paint Your Peace"
              >
                <Palette size={20} className="palette-icon-animated" />

              </button>
              <button
                className="header-btn"
                onClick={() => setHasEnteredChat(true)}
                disabled={!allLandingGoalsCompleted}
                style={{
                  opacity: allLandingGoalsCompleted ? 1 : 0.45,
                  cursor: allLandingGoalsCompleted ? 'pointer' : 'not-allowed'
                }}
              >Start Chatting</button>
            </div>
          </header>

          <div className="landing-hero">
            <div className="hero-left">
              <div className="hero-badge">
                ● AI-Powered - Mood-Aware - {appTheme === 'boy' ? 'For Him' : 'For Her'}
              </div>

              <h1 className="hero-title">
                {appTheme === 'boy' ? (
                  <>Your headspace. <span className="accent-text">Understood.</span><br />Chat with ANJ.</>
                ) : (
                  <>Your feelings <span className="accent-text">matter.</span><br />Talk to ANJ, anytime.</>
                )}
              </h1>

              <p className="hero-subtitle">
                {appTheme === 'boy'
                  ? <>ANJ picks up on your mood and responds with the energy you need, <br /> straight talk, real support, no fluff. No login required.</>
                  : <>ANJ adapts to your mood with gentleness and warmth , <br />no sign-up, no login, just a caring conversation ready when you are.</>}
              </p>

              <div className="mood-action-card">
                <div className="mood-action-header">
                  {appTheme === 'boy' ? ' What is your mood right now?' : '🌸 How are you feeling today?'}
                </div>

                <div className="mood-emojis">
                  {MOOD_EMOJIS.map(m => (
                    <button
                      key={m.label}
                      className={`mood-emoji-btn ${currentMood === m.key ? 'active' : ''}`}
                      onClick={() => handleMoodChange(m.key)}
                    >
                      <span className="emoji">{m.emoji}</span>
                      <span className="label">{m.label}</span>
                    </button>
                  ))}
                </div>

                <div className="landing-goals-container">
                  <div className="goals-header">
                    {appTheme === 'boy' ? 'Complete these 3 goals to start:' : 'Check off these 3 goals before we begin:'}
                  </div>
                  {currentLandingGoals.map(g => (
                    <div
                      key={g.id}
                      className={`landing-goal-item ${completedGoals.includes(g.id) ? 'done' : ''}`}
                      onClick={() => toggleLandingGoal(g.id)}
                    >
                      <div className="goal-checkbox">
                        {completedGoals.includes(g.id) && <CheckCircle2 size={16} />}
                      </div>
                      <span>{g.text}</span>
                    </div>
                  ))}
                </div>

                <button
                  className="launch-btn"
                  onClick={() => setHasEnteredChat(true)}
                  disabled={!allLandingGoalsCompleted}
                  style={{
                    opacity: allLandingGoalsCompleted ? 1 : 0.5,
                    cursor: allLandingGoalsCompleted ? 'pointer' : 'not-allowed'
                  }}
                >
                  {appTheme === 'boy' ? <Bot size={20} /> : <Bot size={20} />}
                  {appTheme === 'boy' ? 'Begin My Chat' : 'Begin My Chat'}
                </button>
                <div className="launch-subtext">
                  {allLandingGoalsCompleted ? 'Great job! You are ready to chat.' : 'Complete all 3 goals above to unlock chat.'}
                </div>
              </div>
            </div>

            <div className="hero-right-collage">
              <div className="collage-img-1" style={{ backgroundImage: `url('/images/${appTheme === 'boy' ? 'b1.jpg' : 'g1.jpg'}')` }}></div>
              <div className="collage-img-2" style={{ backgroundImage: `url('/images/${appTheme === 'boy' ? 'boy2.jpg' : 'g2.jpg'}')` }}></div>
              <div className="collage-img-3" style={{ backgroundImage: `url('/images/${appTheme === 'boy' ? 'boy3.jpg' : 'g3.jpg'}')` }}></div>
            </div>
          </div>

          <div className="features-section">
            <h2 className="features-title">
              {appTheme === 'boy' ? 'Built around your state of mind' : 'Made for how you feel'}
            </h2>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">{appTheme === 'boy' ? <Mic size={24} /> : <Heart size={24} />}</div>
                <h3>{appTheme === 'boy' ? 'Mood-Driven Replies' : 'Mood-Aware Chat'}</h3>
                <p>{appTheme === 'boy'
                  ? 'ANJ reads your vibe and responds sharp, clear, and right to the point.'
                  : 'Responds with warmth, empathy, and care matched to your feelings.'}</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">{appTheme === 'boy' ? <Settings size={24} /> : <StarIcon size={24} />}</div>
                <h3>{appTheme === 'boy' ? 'Zero Login Required' : 'Always Personalized'}</h3>
                <p>{appTheme === 'boy'
                  ? 'No sign-up, no account — just open the chat and go.'
                  : 'Every chat is tailored to your mood, soft when you need comfort, bright when you feel joy.'}</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">{appTheme === 'boy' ? <Brain size={24} /> : <PersonStanding size={24} />}</div>
                <h3>{appTheme === 'boy' ? 'Intelligent & Adaptive' : 'No Sign-Up Needed'}</h3>
                <p>{appTheme === 'boy'
                  ? 'Each session evolves with how you feel, powering conversations that actually help.'
                  : 'Just open and chat. No account, no passwords, just you and ANJ.'}</p>
              </div>
            </div>
          </div>

          <footer className="landing-footer">
            <div> ANJ Creations </div>
            <div>© 2026 ANJ Chatbot - Your mood, your power</div>
            <div>   </div>
          </footer>

        </div>
      </div>
    );
  }

  // ─── MAIN CHAT VIEW ──────────────────────────────────────────────────────
  return (
    <div className={`chatbot-app ${appTheme}-theme`}>
      <div className="chat-window">

        <header className="chat-header chat-header-modern">
          <div className="chat-header-left">
            <button className="chat-back-btn" onClick={() => setHasEnteredChat(false)} title="Back">
              <X size={18} />
            </button>
            <div className="header-logo logo-unified">
              <img src="/logo.png" alt="A" className="logo-img-as-a-chat" />
              <span className="brand-suffix">NJ</span>
              <span className="brand-sub">Chatbot</span>
            </div>
            <span className="bot-author">{appTheme === 'boy' ? 'For Him' : 'For Her'}</span>
          </div>

          <div className="chat-header-center">
            <span className="status-dot"></span>
            <span className="chat-status-text">{isLoading ? 'Thinking...' : 'Online'}</span>
          </div>

          <div className="chat-header-right">
            <button onClick={() => setShowProfile(true)} className="action-icon-btn" title="Profile"><Settings size={19} /></button>
            <button onClick={clearChat} className="action-icon-btn delete-btn" title="Clear Chat"><Trash2 size={19} /></button>
          </div>
        </header>

        {apiError && (
          <div className="api-error-banner">
            <AlertCircle size={16} />
            <span>{apiError}</span>
            <button onClick={() => setApiError(null)} className="error-close-btn"><X size={14} /></button>
          </div>
        )}

        <div className={`chat-messages chat-bg-pattern cartoon-girl-bg ${messages.length === 0 ? 'initial-empty-state' : 'has-messages'}`}>
          {messages.length === 0 && !isLoading && (
            <div className="centered-chat-hero animate-fade-in">
              <div className="hero-branding-wrapper">
                <div className="hero-gemini-icon">⚡</div>
                <h2 className="hero-prompt-text">How can I help you?</h2>
                <p className="hero-subtitle-anj">I am the ANJ Chatbot, here for: {CHATBOT_PURPOSE}</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.sender}`}>
              <div className="message-bubble-group">
                <div className="message-avatar">
                  {msg.sender === 'user'
                    ? (userAvatar ? <img src={userAvatar} alt="User" className="custom-user-avatar-img" /> : <User size={16} />)
                    : <img src="/logo.png" alt="AI Avatar" className="bot-avatar-img" />}
                </div>
                <div>
                  <div className={`message-bubble ${msg.isError ? 'error-bubble' : ''}`}>
                    {msg.sender === 'bot' ? (
                      msg.text === '' && isLoading ? (
                        <div className="typing-dots">
                          <span className="typing-dot"></span>
                          <span className="typing-dot"></span>
                          <span className="typing-dot"></span>
                        </div>
                      ) : (
                        <div className="md-content" dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.text) }} />
                      )
                    ) : <p>{msg.text}</p>}
                  </div>
                  <span className="message-time">{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <footer className="chat-footer centered-footer-layout">
          <div className="footer-content-wrapper">

            <div className="input-group structural-pill-input">
              <button className="inner-input-icon-btn attach-btn"><Plus size={20} /></button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend(input)}
                placeholder="Ask ANJ Chatbot anything..."
                className="chat-input structural-blank-input"
                disabled={isLoading}
              />
              <div className="inner-right-controls">
                <button onClick={() => handleSend(input)} disabled={!input.trim() || isLoading} className="send-button pill-send-style">
                  <Send size={16} />
                </button>
              </div>
            </div>

            <div className="suggestions-container centered-chips-row">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => !isLoading && handleSend(s.text)} className="suggestion-chip pill-chip-style" disabled={isLoading}>
                  {s.text}
                </button>
              ))}
            </div>

            <p className="anj-system-copyright">ANJ Chatbot 2026 - Your mood, your power</p>
          </div>
        </footer>
      </div>

      {showProfile && (
        <div className="profile-overlay-backdrop">
          <div className="profile-drawer-card animate-slide-in">
            <div className="profile-drawer-header">
              <h3>User Profile Settings</h3>
              <button className="close-drawer-btn" onClick={() => setShowProfile(false)}><X size={20} /></button>
            </div>
            <div className="profile-drawer-body">
              <div className="avatar-upload-section">
                <div className="avatar-preview-ring">
                  {userAvatar ? <img src={userAvatar} alt="Avatar" className="uploaded-avatar-preview" /> : <User size={48} style={{ color: '#A0AEC0' }} />}
                  <button className="avatar-edit-badge" onClick={() => fileInputRef.current?.click()}><Camera size={14} /></button>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" style={{ display: 'none' }} />

              </div>
              <div className="profile-form-group">
                <label className="profile-field-label"> Name</label>
                <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} className="profile-input-control" />
              </div>
              <div className="profile-form-group">
                <label className="profile-field-label">Role / Title</label>
                <input type="Student/Employee/...etc" value={userRole} onChange={(e) => setUserRole(e.target.value)} className="profile-input-control" />
              </div>
            </div>
            <div className="profile-drawer-footer">
              <button className="btn-cancel" onClick={() => setShowProfile(false)}>Cancel</button>
              <button className="btn-save" onClick={saveProfileData}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;