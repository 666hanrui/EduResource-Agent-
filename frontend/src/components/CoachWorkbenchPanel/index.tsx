import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface StepEvent {
  kind: string;
  label: string;
  detail?: string;
}

interface Props {
  sourcePage: string;
  activeTaskId: string | null;
  knowledgeName: string;
  onStartGeneration?: () => void;
  disabled?: boolean;
}

const QUICK_PROMPTS = [
  '解释一下当前多 Agent 是怎么协作的',
  '为什么推荐这套学习资源？给我溯源说明',
  '帮我把链表资源生成演示讲清楚',
  '如果要保留 career-planning-agent 的优点，下一步怎么接？',
];

export function CoachWorkbenchPanel({
  sourcePage,
  activeTaskId,
  knowledgeName,
  onStartGeneration,
  disabled,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        '我是 EduResource 的 AI 工作台助手。你可以让我解释 Agent 运行过程、检查个性化推荐依据，或者把自然语言指令转成资源生成动作。',
    },
  ]);
  const [input, setInput] = useState(`围绕「${knowledgeName}」生成一段演示说明`);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const contextLabel = useMemo(() => {
    const parts = [`页面：${sourcePage}`];
    if (activeTaskId) parts.push(`任务：${activeTaskId}`);
    parts.push(`知识点：${knowledgeName}`);
    return parts.join(' · ');
  }, [activeTaskId, knowledgeName, sourcePage]);

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || streaming) return;

    if (text.includes('开始生成') || text.includes('启动生成') || text.includes('生成学习资源')) {
      onStartGeneration?.();
    }

    const nextMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setSteps([]);
    setError(null);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/coach/workbench/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          source_page: sourcePage,
          active_task_id: activeTaskId,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk
            .split('\n')
            .find((item) => item.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as {
            event: string;
            payload: Record<string, unknown>;
          };
          applyStreamEvent(event.event, event.payload);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const applyStreamEvent = (event: string, payload: Record<string, unknown>) => {
    if (event === 'step') {
      setSteps((prev) => [
        ...prev,
        {
          kind: String(payload.kind ?? 'step'),
          label: String(payload.label ?? '执行步骤'),
          detail: payload.detail ? String(payload.detail) : undefined,
        },
      ]);
      return;
    }
    if (event === 'answer_delta') {
      const text = String(payload.text ?? '');
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') {
          copy[copy.length - 1] = { ...last, content: last.content + text };
        }
        return copy;
      });
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return (
    <section style={shellStyle}>
      <div style={headerStyle}>
        <div>
          <span style={eyebrowStyle}>AI Workbench / Claude Code-like</span>
          <h2 style={{ margin: '8px 0 0', fontSize: 28 }}>把系统操作变成可解释的对话工作台</h2>
          <p style={{ margin: '8px 0 0', lineHeight: 1.7, fontWeight: 700 }}>
            保留 career-planning-agent 的 AI Coach 思路：不是普通聊天，而是带上下文、步骤轨迹和工具入口的智能体操作台。
          </p>
        </div>
        <div style={contextCardStyle}>
          <strong>当前上下文</strong>
          <span>{contextLabel}</span>
        </div>
      </div>

      <div style={gridStyle}>
        <div style={chatStyle}>
          <div style={messagesStyle}>
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                style={message.role === 'assistant' ? assistantBubbleStyle : userBubbleStyle}
              >
                <strong>{message.role === 'assistant' ? 'EduResource Coach' : '你'}</strong>
                <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0', lineHeight: 1.7 }}>{message.content || '生成中…'}</p>
              </article>
            ))}
          </div>

          <div style={quickStyle}>
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} disabled={streaming} onClick={() => void send(prompt)} style={quickButtonStyle}>
                {prompt}
              </button>
            ))}
          </div>

          <div style={inputBandStyle}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={streaming}
              placeholder="例如：为什么推荐这套链表资源？请展示画像依据和资源参数。"
              style={textareaStyle}
            />
            <div style={{ display: 'grid', gap: 8 }}>
              <button disabled={streaming || disabled} onClick={() => void send()} className="freddie-primary-button" style={actionButtonStyle}>
                {streaming ? '输出中…' : '发送'}
              </button>
              {streaming && (
                <button onClick={stop} style={actionButtonStyle}>
                  停止
                </button>
              )}
            </div>
          </div>
          {error && <div style={errorStyle}>AI 工作台出错：{error}</div>}
        </div>

        <aside style={traceStyle}>
          <h3 style={{ margin: 0 }}>运行轨迹</h3>
          <p style={{ margin: '6px 0 14px', color: '#6f675f', fontWeight: 700 }}>
            这块用来证明它不是黑盒聊天，而是有路由、上下文、工具和记忆的 Agent 工作台。
          </p>
          {steps.length === 0 ? (
            <div style={emptyTraceStyle}>发送一句话后，这里会显示工作台步骤。</div>
          ) : (
            steps.map((step, index) => (
              <div key={`${step.kind}-${index}`} style={stepStyle}>
                <span style={stepIndexStyle}>{index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <p style={{ margin: '4px 0 0', color: '#6f675f', fontSize: 13 }}>{step.detail ?? step.kind}</p>
                </div>
              </div>
            ))
          )}
        </aside>
      </div>
    </section>
  );
}

const shellStyle: CSSProperties = {
  display: 'grid',
  gap: 18,
};

const headerStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 280px',
  gap: 18,
  alignItems: 'stretch',
};

const eyebrowStyle: CSSProperties = {
  display: 'inline-flex',
  padding: '7px 12px',
  border: '2px solid #241C15',
  borderRadius: 999,
  background: '#FFE01B',
  boxShadow: '3px 3px 0 #241C15',
  fontSize: 12,
  fontWeight: 900,
};

const contextCardStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 16,
  border: '3px solid #241C15',
  borderRadius: 20,
  background: '#FBEFE3',
  boxShadow: '5px 5px 0 #241C15',
  fontSize: 13,
  lineHeight: 1.6,
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 340px',
  gap: 18,
  minHeight: 520,
};

const chatStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: '1fr auto auto',
  gap: 14,
  minHeight: 0,
};

const messagesStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  alignContent: 'start',
  minHeight: 320,
  maxHeight: 460,
  overflow: 'auto',
  padding: 14,
  border: '3px solid #241C15',
  borderRadius: 24,
  background: '#FFFDF6',
};

const assistantBubbleStyle: CSSProperties = {
  maxWidth: '86%',
  padding: 14,
  border: '2px solid #241C15',
  borderRadius: 18,
  background: '#FBEFE3',
};

const userBubbleStyle: CSSProperties = {
  ...assistantBubbleStyle,
  justifySelf: 'end',
  background: '#FFE01B',
};

const quickStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
};

const quickButtonStyle: CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
};

const inputBandStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 104px',
  gap: 12,
};

const textareaStyle: CSSProperties = {
  minHeight: 84,
  padding: 12,
  resize: 'vertical',
  fontSize: 14,
  lineHeight: 1.6,
};

const actionButtonStyle: CSSProperties = {
  minHeight: 42,
};

const traceStyle: CSSProperties = {
  padding: 16,
  border: '3px solid #241C15',
  borderRadius: 24,
  background: '#FBEFE3',
  boxShadow: '6px 6px 0 #241C15',
  overflow: 'auto',
};

const stepStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '30px 1fr',
  gap: 10,
  alignItems: 'start',
  padding: '10px 0',
  borderTop: '2px dashed rgba(36, 28, 21, 0.25)',
};

const stepIndexStyle: CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  width: 24,
  height: 24,
  border: '2px solid #241C15',
  borderRadius: 999,
  background: '#FFE01B',
  fontSize: 12,
  fontWeight: 900,
};

const emptyTraceStyle: CSSProperties = {
  padding: 16,
  border: '2px dashed rgba(36, 28, 21, 0.35)',
  borderRadius: 16,
  color: '#6f675f',
  fontWeight: 700,
};

const errorStyle: CSSProperties = {
  padding: 10,
  border: '2px solid #241C15',
  borderRadius: 14,
  background: '#ffd8df',
  fontWeight: 800,
};
