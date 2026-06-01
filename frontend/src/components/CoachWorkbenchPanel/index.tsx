import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import './coach-workbench.css';

type ChatState = 'idle' | 'connecting' | 'streaming' | 'error';
type MessageStatus = 'pending' | 'streaming' | 'completed' | 'error';
type AgentRunStepStatus = 'running' | 'success' | 'error' | 'skipped';
type AgentRunStepKind = 'route' | 'context' | 'tool' | 'memory' | 'agent_switch' | 'answer';

interface AgentRunStep {
  stepId: string;
  kind: AgentRunStepKind;
  status: AgentRunStepStatus;
  title: string;
  summary?: string;
  agent?: string | null;
  toolName?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

interface RunMetrics {
  steps?: number;
  tools?: number;
  memories?: number;
}

interface Attachment {
  fileId: string;
  name: string;
  type: string;
  size: number;
}

interface PendingUpload extends Attachment {
  uploadState: 'uploading' | 'ready' | 'error';
  progress: number;
  errorDetail?: string;
}

interface CoachSkill {
  name: string;
  label: string;
  description: string;
  agent: string;
  classification: 'readonly' | 'mutation_safe' | 'mutation_gated' | string;
  enabled: boolean;
  requiresEvidence: boolean;
}

interface SelectedCoachSkill {
  name: string;
  source: 'slash_command' | 'quick_prompt';
  label?: string;
  classification?: string;
}

interface CoachMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: MessageStatus;
  attachments?: Attachment[];
  selectedSkill?: SelectedCoachSkill;
  activeAgent?: string | null;
  runTrace?: AgentRunStep[];
  activeStepId?: string | null;
  metrics?: RunMetrics;
  error?: string;
}

interface CoachState {
  state: ChatState;
  messages: CoachMessage[];
  activeAgent: string | null;
  currentSessionId: string | null;
  errorMessage: string | null;
  pendingUploads: PendingUpload[];
  lastUserMessage: string | null;
}

interface CoachSessionSummary {
  sessionId: string;
  title: string;
  updatedAt?: string;
  activeAgent?: string | null;
  preview?: string;
}

interface Props {
  sourcePage: string;
  activeTaskId: string | null;
  knowledgeName: string;
  onStartGeneration?: () => void;
  disabled?: boolean;
}

type CoachEventAction =
  | {
      type: 'ADD_USER_MESSAGE';
      id: string;
      content: string;
      attachments?: Attachment[];
      selectedSkill?: SelectedCoachSkill;
    }
  | { type: 'ADD_ASSISTANT_MESSAGE'; id: string }
  | { type: 'RUN_START'; sessionId: string; assistantMessageId: string; agent: string }
  | { type: 'STEP'; step: AgentRunStep }
  | { type: 'ANSWER_DELTA'; delta: string }
  | { type: 'RUN_DONE'; stopReason: string; sessionId?: string; metrics?: RunMetrics }
  | { type: 'RUN_ERROR'; code: string; message: string; failedStepId?: string | null }
  | { type: 'SYSTEM_MESSAGE'; id: string; kind: 'info' | 'error' | 'abort'; content: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'ADD_UPLOAD'; upload: PendingUpload }
  | { type: 'UPDATE_UPLOAD'; fileId: string; updates: Partial<PendingUpload> }
  | { type: 'REMOVE_UPLOAD'; fileId: string }
  | { type: 'CLEAR_READY_UPLOADS' }
  | { type: 'LOAD_SESSION'; messages: CoachMessage[]; sessionId: string; activeAgent?: string | null }
  | { type: 'NEW_SESSION'; welcomeMessage: CoachMessage };

const QUICK_PROMPTS: Array<{ text: string; skill?: string }> = [
  { text: '解释一下当前多 Agent 是怎么协作的', skill: '/trace' },
  { text: '为什么推荐这套学习资源？给我溯源说明', skill: '/report' },
  { text: '帮我把链表资源生成演示讲清楚', skill: '/learn' },
  { text: '像 Claude Code 一样展示工作台执行轨迹', skill: '/trace' },
  { text: '开始生成学习资源，并展示每个 Agent 的职责', skill: '/generate' },
];

function createWelcomeMessage(knowledgeName: string): CoachMessage {
  return {
    id: `welcome_${stableId()}`,
    role: 'assistant',
    content:
      `我是 EduResource 的 AI 工作台助手，已保留 feature-agentic 里 Claude Code 式 Coach 的核心体验。\n\n` +
      `你可以用 slash 技能、附件证据和自然语言来操作系统；每次回答都会带可展开的运行轨迹，显示路由、上下文、工具、记忆和输出阶段。当前知识点是「${knowledgeName}」。`,
    status: 'completed',
    activeAgent: 'EduResourceCoach',
  };
}

function createInitialState(knowledgeName: string): CoachState {
  return {
    state: 'idle',
    messages: [createWelcomeMessage(knowledgeName)],
    activeAgent: 'EduResourceCoach',
    currentSessionId: null,
    errorMessage: null,
    pendingUploads: [],
    lastUserMessage: null,
  };
}

function lastAssistantIdx(messages: CoachMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') return i;
  }
  return -1;
}

function updateLastAssistant(
  messages: CoachMessage[],
  updater: (message: CoachMessage) => CoachMessage,
): CoachMessage[] {
  const idx = lastAssistantIdx(messages);
  if (idx < 0) return messages;
  const next = [...messages];
  next[idx] = updater(next[idx]);
  return next;
}

function upsertStep(steps: AgentRunStep[] | undefined, step: AgentRunStep): AgentRunStep[] {
  const current = steps ?? [];
  const idx = current.findIndex((item) => item.stepId === step.stepId);
  if (idx < 0) return [...current, step];
  const next = [...current];
  next[idx] = { ...next[idx], ...step };
  return next;
}

function nextActiveStepId(steps: AgentRunStep[], current?: string | null): string | null {
  const active = current
    ? steps.find((step) => step.stepId === current && step.status === 'running')
    : undefined;
  if (active) return active.stepId;
  return [...steps].reverse().find((step) => step.status === 'running')?.stepId ?? null;
}

function coachEventReducer(state: CoachState, action: CoachEventAction): CoachState {
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        state: 'connecting',
        messages: [
          ...state.messages,
          {
            id: action.id,
            role: 'user',
            content: action.content,
            status: 'completed',
            attachments: action.attachments,
            selectedSkill: action.selectedSkill,
          },
        ],
        lastUserMessage: action.content,
        errorMessage: null,
      };
    case 'ADD_ASSISTANT_MESSAGE':
      return {
        ...state,
        state: 'streaming',
        messages: [
          ...state.messages,
          {
            id: action.id,
            role: 'assistant',
            content: '',
            status: 'pending',
            runTrace: [],
            activeStepId: null,
          },
        ],
      };
    case 'RUN_START': {
      const assistant: CoachMessage = {
        id: action.assistantMessageId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        activeAgent: action.agent,
        runTrace: [],
        activeStepId: null,
      };
      const idx = lastAssistantIdx(state.messages);
      const messages =
        idx >= 0 && state.messages[idx].status === 'pending'
          ? [...state.messages.slice(0, idx), assistant, ...state.messages.slice(idx + 1)]
          : [...state.messages, assistant];
      return {
        ...state,
        state: 'streaming',
        currentSessionId: action.sessionId,
        activeAgent: action.agent,
        messages,
      };
    }
    case 'STEP':
      return {
        ...state,
        activeAgent: action.step.agent || state.activeAgent,
        messages: updateLastAssistant(state.messages, (message) => {
          const runTrace = upsertStep(message.runTrace, action.step);
          return {
            ...message,
            status: message.status === 'pending' ? 'streaming' : message.status,
            activeAgent: action.step.agent || message.activeAgent,
            runTrace,
            activeStepId: nextActiveStepId(runTrace, message.activeStepId),
          };
        }),
      };
    case 'ANSWER_DELTA':
      return {
        ...state,
        messages: updateLastAssistant(state.messages, (message) => ({
          ...message,
          status: 'streaming',
          content: message.content + action.delta,
        })),
      };
    case 'RUN_DONE':
      return {
        ...state,
        state: 'idle',
        currentSessionId: action.sessionId ?? state.currentSessionId,
        messages: updateLastAssistant(state.messages, (message) => ({
          ...message,
          status: 'completed',
          activeStepId: null,
          metrics: action.metrics,
        })),
      };
    case 'RUN_ERROR':
      return {
        ...state,
        state: 'error',
        errorMessage: action.message,
        messages: updateLastAssistant(state.messages, (message) => ({
          ...message,
          status: 'error',
          error: action.message,
          activeStepId: action.failedStepId || message.activeStepId,
        })),
      };
    case 'SYSTEM_MESSAGE': {
      const baseMessages =
        action.kind === 'abort'
          ? updateLastAssistant(state.messages, (message) => ({
              ...message,
              status: 'completed',
              activeStepId: null,
            }))
          : state.messages;
      return {
        ...state,
        state: action.kind === 'abort' ? 'idle' : state.state,
        messages: [
          ...baseMessages,
          {
            id: action.id,
            role: 'system',
            content: action.content,
            status: 'completed',
          },
        ],
      };
    }
    case 'CLEAR_ERROR':
      return { ...state, errorMessage: null, state: 'idle' };
    case 'ADD_UPLOAD':
      return { ...state, pendingUploads: [...state.pendingUploads, action.upload] };
    case 'UPDATE_UPLOAD':
      return {
        ...state,
        pendingUploads: state.pendingUploads.map((upload) =>
          upload.fileId === action.fileId ? { ...upload, ...action.updates } : upload,
        ),
      };
    case 'REMOVE_UPLOAD':
      return {
        ...state,
        pendingUploads: state.pendingUploads.filter((upload) => upload.fileId !== action.fileId),
      };
    case 'CLEAR_READY_UPLOADS':
      return {
        ...state,
        pendingUploads: state.pendingUploads.filter((upload) => upload.uploadState !== 'ready'),
      };
    case 'LOAD_SESSION':
      return {
        ...state,
        state: 'idle',
        messages: action.messages,
        currentSessionId: action.sessionId,
        activeAgent: action.activeAgent || 'EduResourceCoach',
        errorMessage: null,
        pendingUploads: [],
      };
    case 'NEW_SESSION':
      return {
        state: 'idle',
        messages: [action.welcomeMessage],
        activeAgent: 'EduResourceCoach',
        currentSessionId: null,
        errorMessage: null,
        pendingUploads: [],
        lastUserMessage: null,
      };
    default:
      return state;
  }
}

export function CoachWorkbenchPanel({
  sourcePage,
  activeTaskId,
  knowledgeName,
  onStartGeneration,
  disabled,
}: Props) {
  const [state, dispatch] = useReducer(
    coachEventReducer,
    knowledgeName,
    createInitialState,
  );
  const [input, setInput] = useState(`围绕「${knowledgeName}」生成一段演示说明`);
  const [manualTaskId, setManualTaskId] = useState(activeTaskId ?? '');
  const [skills, setSkills] = useState<CoachSkill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SelectedCoachSkill | null>(null);
  const [sessions, setSessions] = useState<CoachSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const effectiveTaskId = activeTaskId || manualTaskId.trim() || null;
  const isStreaming = state.state === 'connecting' || state.state === 'streaming';
  const readyUploads = state.pendingUploads.filter((upload) => upload.uploadState === 'ready');

  const contextLabel = useMemo(() => {
    const parts = [`页面 ${sourcePage}`];
    if (effectiveTaskId) parts.push(`任务 ${effectiveTaskId}`);
    parts.push(`知识点 ${knowledgeName}`);
    return parts.join(' / ');
  }, [effectiveTaskId, knowledgeName, sourcePage]);

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch('/api/coach/workbench/sessions');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { sessions?: CoachSessionSummary[] };
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch('/api/coach/workbench/skills')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { skills?: CoachSkill[] }) => setSkills(data.skills ?? []))
      .catch(() => setSkills(defaultSkills));
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('coach_session_id');
    if (sessionId) {
      void loadSession(sessionId);
    }
    // Only read URL once when the workbench mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [state.messages]);

  const updateSessionUrl = useCallback((sessionId: string | null) => {
    const url = new URL(window.location.href);
    if (sessionId) {
      url.searchParams.set('coach_session_id', sessionId);
    } else {
      url.searchParams.delete('coach_session_id');
    }
    window.history.replaceState(null, '', url.toString());
  }, []);

  const findSkill = useCallback(
    (name?: string) => skills.find((skill) => skill.name === name),
    [skills],
  );

  const pickSkill = useCallback((skill: CoachSkill, source: SelectedCoachSkill['source'] = 'slash_command') => {
    setSelectedSkill({
      name: skill.name,
      label: skill.label,
      classification: skill.classification,
      source,
    });
    setInput((current) => {
      const trimmed = current.replace(/^\/[^\s]*\s*/, '').trimStart();
      return trimmed || `${skill.label}：`;
    });
  }, []);

  const loadSession = useCallback(
    async (sessionId: string) => {
      const res = await fetch(`/api/coach/workbench/sessions/${encodeURIComponent(sessionId)}`);
      if (!res.ok) {
        dispatch({
          type: 'SYSTEM_MESSAGE',
          id: `sys_${stableId()}`,
          kind: 'error',
          content: '这个工作台会话已经不存在，已保持当前对话。',
        });
        return;
      }
      const data = (await res.json()) as {
        sessionId: string;
        activeAgent?: string | null;
        messages?: CoachMessage[];
      };
      const messages = normalizeMessages(data.messages ?? [], knowledgeName);
      dispatch({
        type: 'LOAD_SESSION',
        sessionId: data.sessionId,
        activeAgent: data.activeAgent,
        messages,
      });
      updateSessionUrl(data.sessionId);
    },
    [knowledgeName, updateSessionUrl],
  );

  const createNewSession = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'NEW_SESSION', welcomeMessage: createWelcomeMessage(knowledgeName) });
    setInput(`围绕「${knowledgeName}」生成一段演示说明`);
    setSelectedSkill(null);
    updateSessionUrl(null);
  }, [knowledgeName, updateSessionUrl]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await fetch(`/api/coach/workbench/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      if (state.currentSessionId === sessionId) createNewSession();
      await refreshSessions();
    },
    [createNewSession, refreshSessions, state.currentSessionId],
  );

  const send = useCallback(
    async (override?: string, quickSkillName?: string) => {
      const skillFromQuick = findSkill(quickSkillName);
      const skill = skillFromQuick
        ? ({
            name: skillFromQuick.name,
            label: skillFromQuick.label,
            classification: skillFromQuick.classification,
            source: 'quick_prompt',
          } satisfies SelectedCoachSkill)
        : selectedSkill;
      const text = (override ?? input).trim();
      if ((!text && !skill) || isStreaming || disabled) return;

      if (text.includes('开始生成') || text.includes('启动生成') || text.includes('生成学习资源')) {
        onStartGeneration?.();
      }

      const userId = `user_${stableId()}`;
      const pendingAssistantId = `assistant_pending_${stableId()}`;
      const attachments = readyUploads.map(toAttachment);
      const userContent = text || `${skill?.label ?? skill?.name ?? '工作台'}：继续`;
      const requestMessages = [
        ...state.messages
          .filter((message) => message.role !== 'system')
          .map((message) => ({
            role: message.role,
            content: message.content,
            attachments: message.attachments,
            selectedSkill: message.selectedSkill,
          })),
        {
          role: 'user' as const,
          content: userContent,
          attachments,
          selectedSkill: skill ?? undefined,
        },
      ];

      dispatch({
        type: 'ADD_USER_MESSAGE',
        id: userId,
        content: userContent,
        attachments,
        selectedSkill: skill ?? undefined,
      });
      dispatch({ type: 'ADD_ASSISTANT_MESSAGE', id: pendingAssistantId });
      dispatch({ type: 'CLEAR_READY_UPLOADS' });
      setInput('');
      setSelectedSkill(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/coach/workbench/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: requestMessages,
            source_page: sourcePage,
            active_task_id: effectiveTaskId,
            session_id: state.currentSessionId,
            client_message_id: userId,
            pipeline_stage: 'coach-workbench',
            selected_skill: skill ?? undefined,
            attachments,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }

        await readCoachStream(res.body, (eventName, payload) => {
          applyStreamEvent(eventName, payload, dispatch, updateSessionUrl);
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          dispatch({
            type: 'SYSTEM_MESSAGE',
            id: `sys_${stableId()}`,
            kind: 'abort',
            content: '已停止本次工作台运行。',
          });
        } else {
          dispatch({
            type: 'RUN_ERROR',
            code: 'stream_error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        abortRef.current = null;
        await refreshSessions();
      }
    },
    [
      disabled,
      effectiveTaskId,
      findSkill,
      input,
      isStreaming,
      onStartGeneration,
      readyUploads,
      refreshSessions,
      selectedSkill,
      sourcePage,
      state.currentSessionId,
      state.messages,
      updateSessionUrl,
    ],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    if (state.lastUserMessage) {
      void send(state.lastUserMessage);
    }
  }, [send, state.lastUserMessage]);

  const handleUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    for (const file of files) {
      const tempId = `upl_${stableId()}`;
      dispatch({
        type: 'ADD_UPLOAD',
        upload: {
          fileId: tempId,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          uploadState: 'uploading',
          progress: 12,
        },
      });
      try {
        const res = await fetch(
          `/api/coach/workbench/upload?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(
            file.type || 'application/octet-stream',
          )}`,
          { method: 'POST', body: file },
        );
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { attachment?: Attachment };
        if (!data.attachment) throw new Error('upload response missing attachment');
        dispatch({
          type: 'UPDATE_UPLOAD',
          fileId: tempId,
          updates: {
            ...data.attachment,
            uploadState: 'ready',
            progress: 100,
          },
        });
      } catch (err) {
        dispatch({
          type: 'UPDATE_UPLOAD',
          fileId: tempId,
          updates: {
            uploadState: 'error',
            progress: 100,
            errorDetail: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }, []);

  const slashQuery = parseSlashQuery(input);
  const filteredSkills = useMemo(() => {
    if (!slashQuery.active) return [];
    const source = skills.length > 0 ? skills : defaultSkills;
    return source.filter((skill) =>
      `${skill.name} ${skill.label} ${skill.description}`
        .toLowerCase()
        .includes(slashQuery.query.toLowerCase()),
    );
  }, [skills, slashQuery.active, slashQuery.query]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <section className="coach-workbench" aria-label="AI 工作台">
      <aside className="coach-sidebar" aria-label="工作台会话">
        <div className="coach-sidebar-header">
          <span className="coach-eyebrow">Agentic Console</span>
          <button className="coach-icon-button" onClick={createNewSession} title="新建会话" type="button">
            +
          </button>
        </div>
        <div className="coach-active-agent">
          <span>当前 Agent</span>
          <strong>{state.activeAgent ?? 'EduResourceCoach'}</strong>
        </div>
        <div className="coach-session-list">
          <div className="coach-list-title">{sessionsLoading ? '同步会话中' : '历史会话'}</div>
          {sessions.length === 0 ? (
            <div className="coach-empty">还没有保存的工作台会话。</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.sessionId}
                className={
                  session.sessionId === state.currentSessionId
                    ? 'coach-session-row coach-session-row-active'
                    : 'coach-session-row'
                }
              >
                <button type="button" onClick={() => void loadSession(session.sessionId)}>
                  <strong>{session.title}</strong>
                  <span>{session.preview || formatTime(session.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  className="coach-session-delete"
                  onClick={() => void deleteSession(session.sessionId)}
                  title="删除会话"
                >
                  x
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="coach-main">
        <header className="coach-header">
          <div>
            <span className="coach-eyebrow">Claude Code Style Coach</span>
            <h2>可直接操作多 Agent 系统的对话工作台</h2>
          </div>
          <div className="coach-context-card">
            <strong>上下文</strong>
            <span>{contextLabel}</span>
            <label>
              绑定任务 ID
              <input
                value={manualTaskId}
                onChange={(event) => setManualTaskId(event.target.value)}
                placeholder="例如 gen_xxxxx"
                disabled={Boolean(activeTaskId)}
              />
            </label>
          </div>
        </header>

        <section className="coach-skills" aria-label="工作台技能">
          {(skills.length > 0 ? skills : defaultSkills).map((skill) => (
            <button
              key={skill.name}
              type="button"
              className={selectedSkill?.name === skill.name ? 'coach-skill coach-skill-active' : 'coach-skill'}
              onClick={() => pickSkill(skill)}
              disabled={!skill.enabled || isStreaming}
              title={skill.description}
            >
              <span>{skill.name}</span>
              <strong>{skill.label}</strong>
            </button>
          ))}
        </section>

        <div className="coach-chat-shell">
          <div className="coach-message-list">
            {state.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="coach-quick-row">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt.text}
                type="button"
                onClick={() => void send(prompt.text, prompt.skill)}
                disabled={isStreaming || disabled}
              >
                {prompt.text}
              </button>
            ))}
          </div>

          <PendingUploads uploads={state.pendingUploads} onRemove={(fileId) => dispatch({ type: 'REMOVE_UPLOAD', fileId })} />

          {state.errorMessage && (
            <div className="coach-error">
              <span>AI 工作台出错：{state.errorMessage}</span>
              <button type="button" onClick={() => dispatch({ type: 'CLEAR_ERROR' })}>
                关闭
              </button>
            </div>
          )}

          <div className="coach-input-shell">
            {selectedSkill && (
              <button type="button" className="coach-selected-skill" onClick={() => setSelectedSkill(null)}>
                {selectedSkill.name} {selectedSkill.label}
              </button>
            )}
            {slashQuery.active && filteredSkills.length > 0 && (
              <div className="coach-command-palette">
                {filteredSkills.slice(0, 6).map((skill) => (
                  <button key={skill.name} type="button" onClick={() => pickSkill(skill)}>
                    <span>{skill.name}</span>
                    <strong>{skill.label}</strong>
                    <em>{skill.agent}</em>
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
              disabled={isStreaming}
              placeholder="输入 / 选择技能，或直接说：为什么推荐这套资源？"
            />
            <div className="coach-input-actions">
              <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => void handleUpload(event)} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isStreaming}>
                上传
              </button>
              {state.lastUserMessage && !isStreaming && (
                <button type="button" onClick={retry}>
                  重试
                </button>
              )}
              {isStreaming ? (
                <button type="button" className="coach-danger-button" onClick={stop}>
                  停止
                </button>
              ) : (
                <button type="button" className="coach-primary-button" onClick={() => void send()} disabled={disabled}>
                  发送
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MessageBubble({ message }: { message: CoachMessage }) {
  const isAssistant = message.role === 'assistant';
  const title =
    message.role === 'assistant'
      ? message.activeAgent || 'EduResource Coach'
      : message.role === 'system'
        ? 'System'
        : '你';
  return (
    <article className={`coach-message coach-message-${message.role}`}>
      <header>
        <strong>{title}</strong>
        <StatusPill status={message.status} />
      </header>
      {message.selectedSkill && (
        <div className="coach-message-skill">
          {message.selectedSkill.name} {message.selectedSkill.label}
        </div>
      )}
      {message.attachments && message.attachments.length > 0 && (
        <div className="coach-attachment-row">
          {message.attachments.map((attachment) => (
            <span key={attachment.fileId}>
              {attachment.name} · {formatBytes(attachment.size)}
            </span>
          ))}
        </div>
      )}
      {isAssistant && (
        <AgentRunTimeline steps={message.runTrace} status={message.status} metrics={message.metrics} />
      )}
      <p>{message.content || (message.status === 'streaming' || message.status === 'pending' ? '生成中...' : '')}</p>
      {message.error && <div className="coach-message-error">{message.error}</div>}
    </article>
  );
}

function AgentRunTimeline({
  steps = [],
  status,
  metrics,
}: {
  steps?: AgentRunStep[];
  status: MessageStatus;
  metrics?: RunMetrics;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (status === 'streaming' || status === 'pending') {
      setExpanded(true);
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'completed' || !expanded) return undefined;
    const timer = window.setTimeout(() => setExpanded(false), 1800);
    return () => window.clearTimeout(timer);
  }, [expanded, status]);

  const summary = useMemo(() => {
    const failed = steps.find((step) => step.status === 'error');
    const running = steps.find((step) => step.status === 'running');
    const stepCount = metrics?.steps ?? steps.length;
    const toolCount = metrics?.tools ?? steps.filter((step) => step.kind === 'tool').length;
    const memoryCount = metrics?.memories ?? steps.filter((step) => step.kind === 'memory').length;
    const totalMs = steps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0);
    return {
      runStatus: failed ? 'failed' : running ? 'running' : 'completed',
      current: running?.title,
      stepCount,
      toolCount,
      memoryCount,
      duration: totalMs > 0 ? formatDuration(totalMs) : '',
    };
  }, [metrics, steps]);

  if (steps.length === 0) return null;

  return (
    <section className="coach-run-timeline" aria-label="智能体运行轨迹">
      {expanded ? (
        <>
          <div className="coach-log">
            {steps.map((step, index) => (
              <div key={step.stepId} className={`coach-log-row coach-log-${step.status}`}>
                <span className="coach-log-prefix">{index === steps.length - 1 ? '`-' : '|-'}</span>
                <span className="coach-log-status">{statusLabel(step.status)}</span>
                <div>
                  <strong>[{kindLabel(step.kind)}] {step.title}</strong>
                  <p>{step.summary || step.toolName || step.agent || '工作台步骤'}</p>
                </div>
                <em>{step.durationMs ? formatDuration(step.durationMs) : step.status === 'running' ? 'running' : ''}</em>
              </div>
            ))}
          </div>
          <button className="coach-status-bar" type="button" onClick={() => setExpanded(false)}>
            <span className={summary.runStatus === 'running' ? 'coach-live-dot' : 'coach-done-dot'} />
            {summary.current || (summary.runStatus === 'running' ? 'Agent is working' : 'Agent completed')}
            {summary.duration && <em>{summary.duration}</em>}
          </button>
        </>
      ) : (
        <button className="coach-collapsed-run" type="button" onClick={() => setExpanded(true)}>
          <strong>{summary.runStatus === 'failed' ? 'Agent failed' : 'Agent completed'}</strong>
          <span>{summary.stepCount} steps · {summary.toolCount} tools · {summary.memoryCount} memories</span>
          {summary.duration && <em>{summary.duration}</em>}
        </button>
      )}
    </section>
  );
}

function PendingUploads({
  uploads,
  onRemove,
}: {
  uploads: PendingUpload[];
  onRemove: (fileId: string) => void;
}) {
  if (uploads.length === 0) return null;
  return (
    <div className="coach-upload-row">
      {uploads.map((upload) => (
        <button
          key={upload.fileId}
          type="button"
          className={`coach-upload-chip coach-upload-${upload.uploadState}`}
          onClick={() => onRemove(upload.fileId)}
          title={upload.errorDetail || '点击移除'}
        >
          <strong>{upload.name}</strong>
          <span>{upload.uploadState === 'uploading' ? '上传中' : upload.uploadState === 'ready' ? '已就绪' : '失败'}</span>
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: MessageStatus }) {
  return <span className={`coach-status-pill coach-status-${status}`}>{statusText(status)}</span>;
}

function applyStreamEvent(
  eventName: string,
  payload: Record<string, unknown>,
  dispatch: (action: CoachEventAction) => void,
  updateSessionUrl: (sessionId: string | null) => void,
) {
  if (eventName === 'run_start') {
    const sessionId = stringValue(payload.sessionId) || `coach_session_${stableId()}`;
    dispatch({
      type: 'RUN_START',
      sessionId,
      assistantMessageId: stringValue(payload.assistantMessageId) || `assistant_${stableId()}`,
      agent: stringValue(payload.activeAgent) || stringValue(payload.active_agent) || 'EduResourceCoach',
    });
    updateSessionUrl(sessionId);
    return;
  }
  if (eventName === 'step') {
    dispatch({ type: 'STEP', step: normalizeStep(payload) });
    return;
  }
  if (eventName === 'answer_delta') {
    dispatch({ type: 'ANSWER_DELTA', delta: stringValue(payload.delta) || stringValue(payload.text) });
    return;
  }
  if (eventName === 'run_done') {
    const sessionId = stringValue(payload.sessionId);
    dispatch({
      type: 'RUN_DONE',
      stopReason: stringValue(payload.stopReason) || stringValue(payload.stop_reason) || 'complete',
      sessionId,
      metrics: isRecord(payload.metrics) ? (payload.metrics as RunMetrics) : undefined,
    });
    if (sessionId) updateSessionUrl(sessionId);
    return;
  }
  if (eventName === 'run_error') {
    dispatch({
      type: 'RUN_ERROR',
      code: stringValue(payload.code) || 'run_error',
      message: stringValue(payload.message) || '工作台运行失败',
      failedStepId: stringValue(payload.failedStepId),
    });
  }
}

async function readCoachStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (eventName: string, payload: Record<string, unknown>) => void,
) {
  const reader = body.getReader();
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
        .map((item) => item.trim())
        .find((item) => item.startsWith('data:'));
      if (!line) continue;
      const parsed = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      const payload = isRecord(parsed.payload)
        ? (parsed.payload as Record<string, unknown>)
        : parsed;
      const eventName = stringValue(parsed.event) || stringValue(payload.event);
      if (eventName) onEvent(eventName, payload);
    }
  }
}

function normalizeStep(payload: Record<string, unknown>): AgentRunStep {
  const kind = stringValue(payload.kind) as AgentRunStepKind;
  const status = stringValue(payload.status) as AgentRunStepStatus;
  return {
    stepId: stringValue(payload.stepId) || stringValue(payload.step_id) || `${kind || 'step'}_${stableId()}`,
    kind: isKnownKind(kind) ? kind : 'tool',
    status: isKnownStatus(status) ? status : 'success',
    title: stringValue(payload.title) || stringValue(payload.label) || '执行步骤',
    summary: stringValue(payload.summary) || stringValue(payload.detail),
    agent: stringValue(payload.agent) || null,
    toolName: stringValue(payload.toolName) || stringValue(payload.tool_name),
    startedAt: stringValue(payload.startedAt),
    completedAt: stringValue(payload.completedAt),
    durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : undefined,
  };
}

function normalizeMessages(messages: CoachMessage[], knowledgeName: string): CoachMessage[] {
  if (messages.length === 0) return [createWelcomeMessage(knowledgeName)];
  return messages.map((message) => ({
    ...message,
    id: message.id || `msg_${stableId()}`,
    status: message.status || 'completed',
    runTrace: message.runTrace?.map((step) => normalizeStep(step as unknown as Record<string, unknown>)),
  }));
}

function parseSlashQuery(input: string): { active: boolean; query: string } {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('/')) return { active: false, query: '' };
  const token = trimmed.split(/\s+/)[0] ?? '';
  return { active: true, query: token };
}

function toAttachment(upload: PendingUpload): Attachment {
  return {
    fileId: upload.fileId,
    name: upload.name,
    type: upload.type,
    size: upload.size,
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isKnownKind(kind: string): kind is AgentRunStepKind {
  return ['route', 'context', 'tool', 'memory', 'agent_switch', 'answer'].includes(kind);
}

function isKnownStatus(status: string): status is AgentRunStepStatus {
  return ['running', 'success', 'error', 'skipped'].includes(status);
}

function stableId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function statusText(status: MessageStatus): string {
  if (status === 'pending') return 'pending';
  if (status === 'streaming') return 'streaming';
  if (status === 'error') return 'error';
  return 'done';
}

function statusLabel(status: AgentRunStepStatus): string {
  if (status === 'running') return 'run';
  if (status === 'error') return 'err';
  if (status === 'skipped') return 'skip';
  return 'ok';
}

function kindLabel(kind: AgentRunStepKind): string {
  const labels: Record<AgentRunStepKind, string> = {
    route: 'route',
    context: 'context',
    tool: 'tool',
    memory: 'memory',
    agent_switch: 'agent',
    answer: 'answer',
  };
  return labels[kind];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function formatTime(value?: string): string {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' });
}

const defaultSkills: CoachSkill[] = [
  {
    name: '/resume',
    label: '画像诊断',
    description: '从专业、年级、兴趣和学习证据生成 12 维学习画像。',
    agent: 'ProfileAgent',
    classification: 'readonly',
    enabled: true,
    requiresEvidence: true,
  },
  {
    name: '/match',
    label: '方向匹配',
    description: '匹配兴趣方向、职业入口和能力缺口。',
    agent: 'PlannerAgent',
    classification: 'readonly',
    enabled: true,
    requiresEvidence: false,
  },
  {
    name: '/learn',
    label: '学习路径',
    description: '生成基础知识图谱、项目练习和阶段目标。',
    agent: 'DocumentAgent',
    classification: 'mutation_safe',
    enabled: true,
    requiresEvidence: false,
  },
  {
    name: '/generate',
    label: '资源生成',
    description: '转入 EduResource 全 DAG 资源生成。',
    agent: 'GenerateFlow',
    classification: 'mutation_gated',
    enabled: true,
    requiresEvidence: false,
  },
  {
    name: '/trace',
    label: '运行追踪',
    description: '解释 7 个 Agent 的协作过程。',
    agent: 'Orchestrator',
    classification: 'readonly',
    enabled: true,
    requiresEvidence: false,
  },
  {
    name: '/report',
    label: '报告整理',
    description: '输出成长报告、推荐溯源和闭环评估话术。',
    agent: 'EvaluationAgent',
    classification: 'readonly',
    enabled: true,
    requiresEvidence: false,
  },
];
