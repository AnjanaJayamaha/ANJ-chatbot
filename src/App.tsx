import React, { useState, useEffect, useRef } from 'react';
import { Send, User, HelpCircle, Trash2, Settings, X, Camera, Plus, Mic, AlertCircle, Sparkles, CheckCircle2, Circle, Bot, Brain, Heart, MessageCircle, PersonStanding, StarIcon, BotMessageSquare } from 'lucide-react';
import './App.css';

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

const getSystemPrompt = (userName: string, mood: string) => `You are an intelligent, empathetic, and aesthetic AI assistant built by ANJ Studio.
Your specific purpose is: ${CHATBOT_PURPOSE}.
The user's name is ${userName || 'User'} and they are currently feeling: ${mood}.
Tailor your tone to their mood. Be extremely supportive, sweet, and use cute emojis (🎀, ✨, 🌸, 🤍).
Always introduce yourself politely as the ANJ Chatbot if someone asks who you are.
Keep responses focused, comforting, and format with proper markdown when needed.`;

// ─── Groq Streaming Call ──────────────────────────────────────────────────────
async function streamGroq(
  history: { role: string; content: string }[],
  systemPrompt: string,
  onChunk: (t: string) => void,
  onDone: () => void,
  onError: (e: string) => void
) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'your_groq_api_key_here') {
    onError('Add your Groq API key to .env (VITE_GROQ_API_KEY). Get free key at console.groq.com');
    return;
  }
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        stream: true,
        max_tokens: 2048,
        temperature: 0.8,
      }),
    });
    if (!res.ok) {
      const e = await res.json();
      onError(e?.error?.message || `API Error ${res.status}`); return;
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

// ─── Constants for Chat Internal ────────────────────────────────────────────────────────
const MOOD_DATA: Record<string, { quote: string; goals: { id: number; text: string; done: boolean }[] }> = {
  'Happy ✨': {
    quote: "Keep shining! The world needs your light.",
    goals: [{ id: 1, text: 'Share your joy with someone', done: false }, { id: 2, text: 'Do something creative', done: false }]
  },
  'Stressed 🌪️': {
    quote: "Breathe. It's just a bad day, not a bad life.",
    goals: [{ id: 1, text: 'Take 10 deep breaths', done: false }, { id: 2, text: 'Drink a glass of water', done: false }, { id: 3, text: 'Stretch for 2 mins', done: false }]
  },
  'Sad 🌧️': {
    quote: "It's okay to not be okay. Be gentle with yourself.",
    goals: [{ id: 1, text: 'Listen to your favorite song', done: false }, { id: 2, text: 'Hug a pillow or pet', done: false }]
  },
  'Tired 💤': {
    quote: "Rest is not a reward, it's a necessity.",
    goals: [{ id: 1, text: 'Close eyes for 5 mins', done: false }, { id: 2, text: 'Drink some water', done: false }]
  },
  'Motivated 🔥': {
    quote: "You are capable of amazing things. Let's go!",
    goals: [{ id: 1, text: 'Write down top 3 priorities', done: false }, { id: 2, text: 'Start the hardest task first', done: false }]
  }
};

// ─── App Component ─────────────────────────────────────────────────────────────
function App() {
  const [hasEnteredChat, setHasEnteredChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [appTheme, setAppTheme] = useState<'boy' | 'girl'>('boy');

  const [userName, setUserName] = useState(() => localStorage.getItem('chat_user_name') || 'User');
  const [userRole, setUserRole] = useState(() => localStorage.getItem('chat_user_role') || 'Explorer');
  const [userAvatar, setUserAvatar] = useState(() => localStorage.getItem('chat_user_avatar') || '');

  const [currentMood, setCurrentMood] = useState('happy');
  const [completedGoals, setCompletedGoals] = useState<number[]>([]);
  const [goals, setGoals] = useState(MOOD_DATA['Happy ✨'].goals);
  const [dailyQuote, setDailyQuote] = useState(MOOD_DATA['Happy ✨'].quote);

  const handleMoodChange = (mood: string) => {
    setCurrentMood(mood);
    setCompletedGoals([]);

    // Attempt to map to internal chat mood if they enter chat
    let internalMood = 'Happy ✨';
    if (mood === 'calm') internalMood = 'Tired 💤';
    if (mood === 'sad') internalMood = 'Sad 🌧️';
    if (mood === 'anxious' || mood === 'angry') internalMood = 'Stressed 🌪️';

    setGoals(MOOD_DATA[internalMood].goals);
    setDailyQuote(MOOD_DATA[internalMood].quote);
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
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} className={`particle particle-${i + 1} ${appTheme === 'girl' ? 'girl-particle' : ''}`}></span>
            ))}
            <div className="celebration-text">
              {appTheme === 'boy' ? 'You are ready.' : 'All done!'}
            </div>
          </div>
        )}
        <div className="landing-page-container animate-fade-in">

          <header className="landing-header">
            <div className="header-logo">
              <div className="logo-badge">ANJ</div> Chatbot
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
            <div> ANJ Chatbot</div>
            <div>© 2026 ANJ Chatbot - Your mood, your power</div>
            <div className="footer-links"><span style={{ cursor: 'pointer' }}>Privacy</span><span style={{ cursor: 'pointer' }}>Terms</span></div>
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
            <div className="header-logo">
              <div className="logo-badge">ANJ</div> Chatbot
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
                    : (appTheme === 'boy' ? <Bot size={16} /> : <Sparkles size={16} />)}
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
                <button className="inner-input-icon-btn voice-btn"><Mic size={18} /></button>
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
                <p className="upload-hint-text">Click camera icon to change photo</p>
              </div>
              <div className="profile-form-group">
                <label className="profile-field-label"> Name</label>
                <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} className="profile-input-control" />
              </div>
              <div className="profile-form-group">
                <label className="profile-field-label">Role / Title</label>
                <input type="text" value={userRole} onChange={(e) => setUserRole(e.target.value)} className="profile-input-control" />
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