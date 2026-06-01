import { useState, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { TutorLive2D } from '../TutorLivePanel/TutorLive2D';

interface Message {
  id: string;
  sender: 'tutor' | 'student';
  text: string;
  ts: Date;
}

interface Props {
  onCommand?: (text: string) => Promise<string | null>;
}

const QUICK_QUESTIONS = [
  '单链表插入的指针修改顺序是什么？',
  '二叉树的前中后序遍历有什么区别？',
  '系统画像中的8维和12维是什么？',
  '打开专业探索',
  '打开资源生成'
];

export function TutorFloatingBall({ onCommand }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  
  const dragStart = useRef({ x: 0, y: 0 });
  const ballStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'tutor',
      text: '你好！我是你的 AI 智能助教『小灵』。很高兴为你服务！你可以随时向我提问有关数据结构（链表、二叉树）或者学习画像的问题。',
      ts: new Date()
    }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize position on mount (bottom-right of page, left of AgentTracePanel)
  useEffect(() => {
    setPosition({
      x: window.innerWidth - 360 - 24 - 240, // 360px sidebar + 24px gap + 240px avatar width
      y: window.innerHeight - 320 - 40 // 320px avatar height + 40px gap
    });
  }, []);

  // Handle window resizing to keep model inside screen boundaries
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.max(0, Math.min(prev.x, window.innerWidth - 240)),
        y: Math.max(0, Math.min(prev.y, window.innerHeight - 320))
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-hide the welcome tooltip after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTooltip(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Mouse drag handler
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only allow left-click drags
    setIsDragging(true);
    hasMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    ballStart.current = { x: position.x, y: position.y };
    e.preventDefault();
  };

  // Touch drag handler
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    hasMoved.current = false;
    dragStart.current = { x: touch.clientX, y: touch.clientY };
    ballStart.current = { x: position.x, y: position.y };
  };

  // Move tracking
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;
      const dx = clientX - dragStart.current.x;
      const dy = clientY - dragStart.current.y;
      
      // If movement is larger than 3px, mark as moved (disables standard click action)
      if (Math.sqrt(dx * dx + dy * dy) > 3) {
        hasMoved.current = true;
      }

      let newX = ballStart.current.x + dx;
      let newY = ballStart.current.y + dy;

      // Clamp position within window bounds
      newX = Math.max(0, Math.min(newX, window.innerWidth - 240));
      newY = Math.max(0, Math.min(newY, window.innerHeight - 320));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleUp = () => {
      if (!isDragging) return;
      setIsDragging(false);

      // If it was a quick touch/click without dragging, toggle the chat window
      if (!hasMoved.current) {
        setIsOpen(prev => !prev);
        setShowTooltip(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging]);

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
      const commandReply = await onCommand?.(text);
      if (commandReply) {
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          sender: 'tutor',
          text: commandReply,
          ts: new Date()
        }]);
        return;
      }

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

  // Determine chat panel dynamic position relative to the floating Live2D model
  const chatPanelDynamicStyle: CSSProperties = {
    ...chatPanelStyle,
    position: 'fixed',
    left: position.x - 390 >= 16 ? position.x - 390 : position.x + 250 <= window.innerWidth - 380 ? position.x + 250 : 16,
    top: position.y - 120 >= 16 ? position.y - 120 : 16,
  };

  // Determine tooltip dynamic position
  const tooltipDynamicStyle: CSSProperties = {
    ...tooltipStyle,
    position: 'fixed',
    left: position.x - 60 >= 16 ? position.x - 60 : 16,
    top: position.y - 48 >= 16 ? position.y - 48 : position.y + 330,
    margin: 0,
  };

  return (
    <div style={{ position: 'relative', zIndex: 9999 }}>
      <style>{ANIMATION_STYLES}</style>
      
      {/* 1. Floating welcome bubble */}
      {!isOpen && showTooltip && (
        <div style={tooltipDynamicStyle} onClick={() => { setIsOpen(true); setShowTooltip(false); }}>
          <span>👋 我是 AI 助教，点我开启对话！</span>
          <button 
            style={closeTooltipBtnStyle} 
            onClick={(e) => { e.stopPropagation(); setShowTooltip(false); }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Chat dialog panel */}
      {isOpen && (
        <div style={chatPanelDynamicStyle}>
          {/* Header */}
          <header style={chatHeaderStyle}>
            <div style={headerTextContainerStyle}>
              <div style={headerTitleStyle}>AI 助教小灵</div>
              <div style={headerStatusStyle}>正在为您量身解答中</div>
            </div>
            <button style={closePanelBtnStyle} onClick={() => setIsOpen(false)}>
              ✕
            </button>
          </header>

          {/* Chat messages */}
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

          {/* Quick chips */}
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

          {/* Input field */}
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
        </div>
      )}

      {/* 3. Floating Live2D Character Container */}
      <div 
        style={{
          ...floatingLive2DContainerStyle,
          left: position.x,
          top: position.y,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <TutorLive2D 
          isSpeaking={loading} 
          width={240} 
          height={320} 
          scale={0.065} 
          xOffset={25} 
          yOffset={25} 
        />
        {/* Soft shadow background glow */}
        <div style={backShadowStyle} />
      </div>
    </div>
  );
}

// ──────────────────────── CSS Styles ────────────────────────

const floatingLive2DContainerStyle: CSSProperties = {
  position: 'fixed',
  width: 240,
  height: 320,
  zIndex: 9999,
  touchAction: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const backShadowStyle: CSSProperties = {
  position: 'absolute',
  top: '20%',
  left: '20%',
  width: '60%',
  height: '60%',
  borderRadius: '50%',
  background: 'rgba(22, 119, 255, 0.15)',
  filter: 'blur(20px)',
  zIndex: -1,
  pointerEvents: 'none',
};

const tooltipStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: '18px 18px 0px 18px',
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(22, 119, 255, 0.2)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(22, 119, 255, 0.06)',
  color: '#1f2937',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  animation: 'tutor-float 3s ease-in-out infinite',
  whiteSpace: 'nowrap',
};

const closeTooltipBtnStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  color: '#9ca3af',
  cursor: 'pointer',
  fontSize: 10,
  padding: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const chatPanelStyle: CSSProperties = {
  width: 380,
  height: 540,
  borderRadius: 16,
  backgroundColor: 'rgba(255, 255, 255, 0.92)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.5)',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.04)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'tutor-panel-appear 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
};

const chatHeaderStyle: CSSProperties = {
  padding: '14px 18px',
  background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const headerTextContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const headerTitleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: '0.5px',
};

const headerStatusStyle: CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  marginTop: 2,
};

const closePanelBtnStyle: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.15)',
  border: 'none',
  borderRadius: '50%',
  color: '#fff',
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: 11,
  transition: 'background-color 0.2s',
};

const messagesAreaStyle: CSSProperties = {
  flex: 1,
  padding: '16px 18px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  backgroundColor: 'rgba(248, 250, 252, 0.7)',
};

const tutorMsgRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  alignSelf: 'flex-start',
  maxWidth: '85%',
};

const studentMsgRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  alignSelf: 'flex-end',
  maxWidth: '85%',
};

const msgAvatarStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  backgroundColor: '#1e293b',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 'bold',
  flexShrink: 0,
  boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
};

const tutorMsgBubbleStyle: CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  padding: '10px 14px',
  borderRadius: '0px 14px 14px 14px',
  color: '#0f172a',
  fontSize: 13,
  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
};

const studentMsgBubbleStyle: CSSProperties = {
  backgroundColor: '#1677ff',
  padding: '10px 14px',
  borderRadius: '14px 0px 14px 14px',
  color: '#fff',
  fontSize: 13,
  boxShadow: '0 2px 8px rgba(22, 119, 255, 0.15)',
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
  padding: '10px 16px 12px',
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
  gap: 6,
};

const chipStyle: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  backgroundColor: '#f8fafc',
  padding: '6px 10px',
  color: '#334155',
  fontSize: 12,
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
  padding: 12,
  borderTop: '1px solid #e2e8f0',
  display: 'flex',
  gap: 8,
  backgroundColor: '#fff',
};

const chatInputStyle: CSSProperties = {
  flex: 1,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  transition: 'border-color 0.2s',
};

const sendButtonStyle: CSSProperties = {
  backgroundColor: '#1677ff',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '0 16px',
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
@keyframes tutor-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes tutor-panel-appear {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dot {
  width: 6px;
  height: 6px;
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
}

button:hover:not(:disabled) {
  filter: brightness(1.05);
}
`;
