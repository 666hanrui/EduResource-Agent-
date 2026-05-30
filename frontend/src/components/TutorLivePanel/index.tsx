import { useState, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { TutorLive2D } from './TutorLive2D';

interface Message {
  id: string;
  sender: 'tutor' | 'student';
  text: string;
  ts: Date;
}

const QUICK_QUESTIONS = [
  '单链表插入的指针修改顺序是什么？',
  '二叉树的前中后序遍历有什么区别？',
  '系统画像中的8维和12维是什么？'
];

const DANMAKUS_POOL = [
  '老师讲得太透彻了！',
  'Live2D 说话动起来了！',
  '前排打卡支持桃濑老师！',
  '这推荐精准命中我的盲区！',
  '二叉树递归遍历听懂了！',
  '刷完这道题画像掌握度涨了！',
  'Live2D 跟随鼠标转动绝了',
  '小灵老师的看板娘太萌了'
];

interface DanmakuItem {
  id: string;
  text: string;
  top: number;
  delay: number;
}

export function TutorLivePanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'tutor',
      text: 'Hi domo! 智能助教小灵在此！我已经化身为 Live2D 看板娘了哦！我会根据你的学习画像，为你量身提供辅导解答。有什么想问我的吗？',
      ts: new Date()
    }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [danmakus, setDanmakus] = useState<DanmakuItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Generate scrolling danmaku comments over the livestream screen
  useEffect(() => {
    const items: DanmakuItem[] = Array.from({ length: 8 }).map((_, i) => ({
      id: Math.random().toString(),
      text: DANMAKUS_POOL[i % DANMAKUS_POOL.length],
      top: 15 + (i * 22) % 130, // Stagger top positions to prevent overlaps
      delay: i * 2.5, // Stagger animation start delays
    }));
    setDanmakus(items);

    // Refresh comments periodically
    const timer = setInterval(() => {
      setDanmakus(prev => {
        return prev.map(item => {
          if (Math.random() > 0.6) {
            return {
              ...item,
              id: Math.random().toString(),
              text: DANMAKUS_POOL[Math.floor(Math.random() * DANMAKUS_POOL.length)],
            };
          }
          return item;
        });
      });
    }, 12000);

    return () => clearInterval(timer);
  }, []);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    
    const userMsg: Message = {
      id: Math.random().toString(),
      sender: 'student',
      text: text,
      ts: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInputVal('');
    setLoading(true);

    try {
      const chatHistory = messages
        .concat(userMsg)
        .map(m => ({
          role: m.sender === 'student' ? 'user' : 'assistant',
          content: m.text
        }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory }),
      });
      
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        sender: 'tutor',
        text: data.content,
        ts: new Date()
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        sender: 'tutor',
        text: '抱歉，我的网络连接稍微有些延迟。您可以试着提问关于“链表插入”、“二叉树”或“学习画像”相关的话题，我会为您进行本地规则解答。',
        ts: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickQuestion = (q: string) => {
    handleSend(q);
  };

  return (
    <aside style={containerStyle}>
      <style>{ANIMATION_STYLES}</style>

      {/* 1. Live Stream Screen (VTuber Studio) */}
      <div style={liveScreenContainerStyle}>
        {/* Cozy Bookshelf Room Vector Background */}
        <svg style={bgSvgStyle} viewBox="0 0 100 60" preserveAspectRatio="none">
          {/* Wallpaper background gradient */}
          <rect width="100" height="60" fill="url(#roomWall)" />
          
          {/* Wood floor */}
          <rect y="52" width="100" height="8" fill="#c49a6c" />
          <line x1="0" y1="52" x2="100" y2="52" stroke="#a1754a" strokeWidth="0.5" />

          {/* Bookshelf Left */}
          <rect x="5" y="8" width="22" height="44" fill="#d7b187" stroke="#b68d63" strokeWidth="0.5" />
          <line x1="5" y1="22" x2="27" y2="22" stroke="#b68d63" strokeWidth="0.5" />
          <line x1="5" y1="36" x2="27" y2="36" stroke="#b68d63" strokeWidth="0.5" />
          {/* Books on Shelf */}
          <rect x="7" y="12" width="2.5" height="10" fill="#ef4444" opacity="0.8" />
          <rect x="9.5" y="10" width="3" height="12" fill="#10b981" opacity="0.8" />
          <rect x="12.5" y="14" width="2" height="8" fill="#3b82f6" opacity="0.8" />
          <rect x="18" y="26" width="3" height="10" fill="#f59e0b" opacity="0.8" />
          <rect x="21" y="28" width="2.5" height="8" fill="#8b5cf6" opacity="0.8" />

          {/* Bookshelf Right */}
          <rect x="73" y="8" width="22" height="44" fill="#d7b187" stroke="#b68d63" strokeWidth="0.5" />
          <line x1="73" y1="25" x2="95" y2="25" stroke="#b68d63" strokeWidth="0.5" />
          {/* Photo Frame and Vase */}
          <rect x="78" y="13" width="8" height="8" fill="#b45309" opacity="0.5" rx="0.5" />
          <rect x="80" y="15" width="4" height="5" fill="#fff" opacity="0.9" rx="0.3" />
          <circle cx="82" cy="17.5" r="1.5" fill="#ef4444" opacity="0.6" />

          <defs>
            <linearGradient id="roomWall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fafaf9" />
              <stop offset="100%" stopColor="#f5f5f4" />
            </linearGradient>
          </defs>
        </svg>

        {/* Real Live2D Cubism Model Screen */}
        <div style={avatarWrapperStyle}>
          <TutorLive2D isSpeaking={loading} />
        </div>

        {/* Live Stream Overlays */}
        <div style={liveBadgeStyle}>
          <span style={liveDotStyle} />
          <span>小灵老师的直播间</span>
        </div>

        <div style={heatBadgeStyle}>
          <span>🔥 在线人气: 15,842</span>
        </div>

        {/* Scrolling Danmaku (弹幕) Overlay */}
        <div style={danmakuOverlayContainerStyle}>
          {danmakus.map((item) => (
            <div
              key={item.id}
              className="danmaku-text"
              style={{
                top: item.top,
                animationDelay: `${item.delay}s`,
              }}
            >
              {item.text}
            </div>
          ))}
        </div>
      </div>

      {/* 2. Live Chat Messages History */}
      <div style={messagesAreaStyle}>
        {messages.map((m) => (
          <div 
            key={m.id} 
            style={m.sender === 'student' ? studentMsgRowStyle : tutorMsgRowStyle}
          >
            {m.sender === 'tutor' && (
              <div style={msgAvatarStyle}>助教</div>
            )}
            <div style={m.sender === 'student' ? studentMsgBubbleStyle : tutorMsgBubbleStyle}>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{m.text}</div>
              <div style={m.sender === 'student' ? timeTextRightStyle : timeTextLeftStyle}>
                {m.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        
        {loading && (
          <div style={tutorMsgRowStyle}>
            <div style={msgAvatarStyle}>助教</div>
            <div style={tutorMsgBubbleStyle}>
              <div style={typingIndicatorStyle}>
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Recommended Questions */}
      <div style={quickSuggestionsStyle}>
        <div style={quickSuggestionsTitleStyle}>🔍 点击向小灵提问：</div>
        <div style={chipsContainerStyle}>
          {QUICK_QUESTIONS.map((q) => (
            <button 
              key={q} 
              style={chipStyle} 
              onClick={() => handleQuickQuestion(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Chat Input Form */}
      <form 
        onSubmit={(e) => { e.preventDefault(); handleSend(inputVal); }} 
        style={inputFormStyle}
      >
        <input 
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="向 Live2D 助教提问..."
          style={chatInputStyle}
          disabled={loading}
        />
        <button 
          type="submit" 
          style={sendButtonStyle}
          disabled={!inputVal.trim() || loading}
        >
          发送
        </button>
      </form>
    </aside>
  );
}

// ──────────────────────── CSS Styles ────────────────────────

const containerStyle: CSSProperties = {
  width: 300,
  height: '100%',
  backgroundColor: '#ffffff',
  borderRight: '1px solid #e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  flexShrink: 0,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const liveScreenContainerStyle: CSSProperties = {
  width: '100%',
  height: 240,
  backgroundColor: '#f5efe6',
  position: 'relative',
  overflow: 'hidden',
  borderBottom: '2px solid #cbd5e1',
};

const bgSvgStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
};

const avatarWrapperStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: 5,
  pointerEvents: 'none',
};

const liveBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  backgroundColor: 'rgba(15, 23, 42, 0.75)',
  padding: '3px 8px',
  borderRadius: 4,
  color: '#fff',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  zIndex: 10,
};

const liveDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  backgroundColor: '#ff477e',
  display: 'inline-block',
  animation: 'tutor-live-dot 1s infinite',
};

const heatBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  backgroundColor: 'rgba(15, 23, 42, 0.75)',
  padding: '3px 8px',
  borderRadius: 4,
  color: '#ffd166',
  fontSize: 9,
  fontWeight: 700,
  zIndex: 10,
};

const danmakuOverlayContainerStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  zIndex: 8,
};

const messagesAreaStyle: CSSProperties = {
  flex: 1,
  padding: '12px 14px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  backgroundColor: '#f8fafc',
};

const tutorMsgRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  alignSelf: 'flex-start',
  maxWidth: '90%',
};

const studentMsgRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  alignSelf: 'flex-end',
  maxWidth: '90%',
};

const msgAvatarStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  backgroundColor: '#ff6b8b',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 'bold',
  flexShrink: 0,
  boxShadow: '0 2px 4px rgba(255, 107, 139, 0.15)',
};

const tutorMsgBubbleStyle: CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  padding: '8px 12px',
  borderRadius: '0px 12px 12px 12px',
  color: '#0f172a',
  fontSize: 13,
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
};

const studentMsgBubbleStyle: CSSProperties = {
  backgroundColor: '#1677ff',
  padding: '8px 12px',
  borderRadius: '12px 0px 12px 12px',
  color: '#fff',
  fontSize: 13,
  boxShadow: '0 2px 8px rgba(22, 119, 255, 0.1)',
};

const timeTextLeftStyle: CSSProperties = {
  fontSize: 9,
  color: '#94a3b8',
  marginTop: 4,
  textAlign: 'left',
};

const timeTextRightStyle: CSSProperties = {
  fontSize: 9,
  color: 'rgba(255, 255, 255, 0.7)',
  marginTop: 4,
  textAlign: 'right',
};

const quickSuggestionsStyle: CSSProperties = {
  padding: '10px 14px 12px',
  backgroundColor: '#fff',
  borderTop: '1px solid #e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const quickSuggestionsTitleStyle: CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  fontWeight: 600,
};

const chipsContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
};

const chipStyle: CSSProperties = {
  border: '1px solid #fbcfe8',
  borderRadius: 6,
  backgroundColor: '#fdf2f8',
  padding: '5px 8px',
  color: '#be185d',
  fontSize: 11,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'all 0.2s',
  outline: 'none',
  width: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const inputFormStyle: CSSProperties = {
  padding: 10,
  borderTop: '1px solid #e2e8f0',
  display: 'flex',
  gap: 6,
  backgroundColor: '#fff',
};

const chatInputStyle: CSSProperties = {
  flex: 1,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 13,
  outline: 'none',
  transition: 'border-color 0.2s',
};

const sendButtonStyle: CSSProperties = {
  backgroundColor: '#ff477e',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '0 12px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.2s',
};

const typingIndicatorStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 0',
};

// ──────────────────────── CSS Animations ────────────────────────

const ANIMATION_STYLES = `
@keyframes tutor-live-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes danmaku-move {
  from {
    transform: translateX(300px);
  }
  to {
    transform: translateX(-350px);
  }
}

.danmaku-text {
  position: absolute;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
  color: rgba(15, 23, 42, 0.7);
  background-color: rgba(255, 255, 255, 0.8);
  padding: 2px 8px;
  border-radius: 10px;
  animation: danmaku-move 9s linear infinite;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.dot {
  width: 5px;
  height: 5px;
  background-color: #64748b;
  border-radius: 50%;
  display: inline-block;
  animation: tutor-bounce 1.4s infinite ease-in-out both;
}

.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes tutor-bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1.0); }
}

form button:disabled {
  background-color: #e2e8f0 !important;
  color: #94a3b8 !important;
  cursor: not-allowed !important;
  filter: none !important;
}

button:hover:not(:disabled) {
  filter: brightness(1.03);
}

.chipStyle:hover {
  background-color: #fce7f3;
}
`;
