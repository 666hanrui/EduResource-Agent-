import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from 'react';
import type { StudentLearningSystem, StudentPage, TrainingStageKey } from '../student-workspace/model';

export interface StudentPetActionDraft {
  studentId?: string;
  knowledgeId?: string;
  knowledgeName?: string;
  stage?: TrainingStageKey | null;
}

interface Message {
  id: string;
  sender: 'pet' | 'student';
  text: string;
  ts: Date;
}

interface Props {
  activePage: StudentPage;
  studentId: string;
  knowledgeId: string;
  knowledgeName: string;
  learningSystem: StudentLearningSystem;
  busy?: boolean;
  classroomUrl?: string | null;
  completionSignal?: number;
  completionMessage?: string;
  onNavigate: (page: StudentPage, stage?: TrainingStageKey | null) => void;
  onPrepareFocus: (draft?: StudentPetActionDraft) => StudentPetActionDraft;
  onRefreshDashboard: () => Promise<void>;
  onStartClassroom: (draft?: StudentPetActionDraft) => Promise<void>;
  onLightweightGenerate: (draft?: StudentPetActionDraft) => Promise<void>;
  onBuildExplorationPlan: () => Promise<void> | void;
  onOpenClassroomUrl: () => boolean;
}

type PetMood = 'idle' | 'thinking' | 'guide' | 'running' | 'celebrate';

const XILIAN_SPRITESHEET_SRC = '/assets/pets/xilian-spritesheet.webp';
const PET_COLUMNS = 8;
const PET_ROWS = 9;
const PET_WIDTH = 118;
const PET_HEIGHT = 129;
const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 560;

const PET_SEQUENCES: Record<PetMood, number[]> = {
  idle: [0, 1, 2, 3, 4, 5],
  thinking: [32, 33, 34, 35, 34, 33],
  guide: [40, 41, 42, 43, 44, 45],
  running: [8, 9, 10, 11, 12, 13, 14, 15],
  celebrate: [48, 49, 50, 51, 52, 53],
};

export function TutorFloatingBall({
  activePage,
  studentId,
  knowledgeId,
  knowledgeName,
  learningSystem,
  busy = false,
  classroomUrl = null,
  completionSignal = 0,
  completionMessage = '',
  onNavigate,
  onPrepareFocus,
  onRefreshDashboard,
  onStartClassroom,
  onLightweightGenerate,
  onBuildExplorationPlan,
  onOpenClassroomUrl,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [position, setPosition] = useState(() => initialPetPosition());
  const [isDragging, setIsDragging] = useState(false);
  const [mood, setMood] = useState<PetMood>('idle');
  const [frame, setFrame] = useState(0);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 'welcome',
      sender: 'pet',
      text: '我是昔涟。说任务，我来操作。',
      ts: new Date(),
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const dragStart = useRef({ x: 0, y: 0 });
  const petStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const hasUserPositioned = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const moodTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastCompletionSignalRef = useRef(completionSignal);

  const activeMood = loading || busy ? 'thinking' : mood;
  const currentStage = learningSystem.currentStage;
  const quickActions = useMemo(
    () => [
      { label: '我在哪一步', prompt: '我现在在哪一步' },
      { label: '继续下一步', prompt: '继续下一步' },
      { label: '开始验证', prompt: '开始课堂验证' },
      { label: '轻量资源', prompt: '生成轻量资源' },
      { label: '打开课堂', prompt: '打开课堂' },
      { label: '看回写', prompt: '查看回写证据' },
    ],
    [],
  );

  useEffect(() => {
    const sequence = PET_SEQUENCES[activeMood];
    let cursor = 0;
    setFrame(sequence[0]);
    const timer = window.setInterval(() => {
      cursor = (cursor + 1) % sequence.length;
      setFrame(sequence[cursor]);
    }, activeMood === 'idle' ? 210 : 92);
    return () => window.clearInterval(timer);
  }, [activeMood]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => (hasUserPositioned.current ? clampPosition(prev.x, prev.y) : initialPetPosition()));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!hasUserPositioned.current) setPosition(initialPetPosition());
  }, [activePage, currentStage.key]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowTooltip(false), 9000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isOpen]);

  const petFrameStyle = useMemo<CSSProperties>(() => buildFrameStyle(frame), [frame]);
  const chatPanelDynamicStyle = useMemo<CSSProperties>(() => {
    const fitsLeft = position.x - PANEL_WIDTH - 16 >= 12;
    const fitsRight = position.x + PET_WIDTH + PANEL_WIDTH + 16 <= window.innerWidth - 12;
    return {
      left: fitsLeft ? position.x - PANEL_WIDTH - 16 : fitsRight ? position.x + PET_WIDTH + 16 : 12,
      top: Math.max(12, Math.min(position.y - 160, window.innerHeight - PANEL_HEIGHT - 12)),
    };
  }, [position.x, position.y]);
  const tooltipDynamicStyle = useMemo<CSSProperties>(() => ({
    left: Math.max(12, Math.min(position.x - 172, window.innerWidth - 260)),
    top: Math.max(12, position.y - 52),
  }), [position.x, position.y]);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setIsDragging(true);
    hasMoved.current = false;
    dragStart.current = { x: event.clientX, y: event.clientY };
    petStart.current = { x: position.x, y: position.y };
    event.preventDefault();
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    setIsDragging(true);
    hasMoved.current = false;
    dragStart.current = { x: touch.clientX, y: touch.clientY };
    petStart.current = { x: position.x, y: position.y };
  };

  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;
      const dx = clientX - dragStart.current.x;
      const dy = clientY - dragStart.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 3) hasMoved.current = true;
      setPosition(clampPosition(petStart.current.x + dx, petStart.current.y + dy));
    };
    const handleMouseMove = (event: MouseEvent) => handleMove(event.clientX, event.clientY);
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        event.preventDefault();
        handleMove(event.touches[0].clientX, event.touches[0].clientY);
      }
    };
    const handleUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      if (hasMoved.current) hasUserPositioned.current = true;
      if (!hasMoved.current) {
        setIsOpen((prev) => !prev);
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

  const pushPetMessage = (text: string) => {
    setMessages((prev) => [...prev, { id: cryptoId(), sender: 'pet', text, ts: new Date() }]);
  };

  const pulseMood = (nextMood: PetMood, durationMs = 1800) => {
    if (moodTimerRef.current !== null) window.clearTimeout(moodTimerRef.current);
    setMood(nextMood);
    moodTimerRef.current = window.setTimeout(() => {
      setMood('idle');
      moodTimerRef.current = null;
    }, durationMs);
  };

  const showToast = (text: string) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(text);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 5200);
  };

  useEffect(() => () => {
    if (moodTimerRef.current !== null) window.clearTimeout(moodTimerRef.current);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    if (completionSignal === lastCompletionSignalRef.current) return;
    lastCompletionSignalRef.current = completionSignal;
    if (!pendingAction) return;

    const text = completionMessage || `${pendingAction}已完成。`;
    pushPetMessage(text);
    showToast(text);
    pulseMood('celebrate', 2400);
    setPendingAction(null);
  }, [completionMessage, completionSignal, pendingAction]);

  const handleSend = async (text: string) => {
    const value = text.trim();
    if (!value || loading || busy) return;

    setMessages((prev) => [...prev, { id: cryptoId(), sender: 'student', text: value, ts: new Date() }]);
    setInputVal('');
    setLoading(true);
    setShowTooltip(false);

    try {
      const reply = await resolvePetCommand(value);
      pushPetMessage(reply);
    } catch (err) {
      pushPetMessage(err instanceof Error ? `我没能完成这一步：${err.message}` : '我没能完成这一步，我们先回到当前阶段再试一次。');
    } finally {
      setLoading(false);
    }
  };

  const resolvePetCommand = async (rawText: string): Promise<string> => {
    const text = normalizeCommand(rawText);
    const draft = buildDraftFromPrompt(rawText, {
      studentId,
      knowledgeId,
      knowledgeName,
      stage: learningSystem.currentStage.routeStage ?? null,
    });
    const targetName = draft.knowledgeName ?? learningSystem.focus.knowledgeName;
    const stage = draft.stage ?? learningSystem.primaryAction.routeStage ?? null;

    if (hasAny(text, ['打开课堂', '进入课堂', '去课堂间', '课堂链接'])) {
      if (onOpenClassroomUrl()) {
        pulseMood('celebrate');
        return '已打开课堂。';
      }
      onNavigate('classroom');
      pulseMood('guide');
      return classroomUrl ? '课堂链接准备中。' : '还没有课堂，先说“开始验证”。';
    }

    if (hasAny(text, ['我在哪', '在哪一步', '当前进度', '学习进度', '现在状态', '进度怎么样'])) {
      pulseMood('guide');
      return buildProgressReply(learningSystem, activePage);
    }

    if (hasAny(text, ['下一步', '继续', '推进', '往下', '下一阶段'])) {
      onNavigate(learningSystem.primaryAction.route, learningSystem.primaryAction.routeStage);
      pulseMood('running');
      return `已打开${learningSystem.primaryAction.label}。`;
    }

    if (hasAny(text, ['更新计划', '刷新计划', '更新学习计划', '刷新画像', '同步进度'])) {
      await onRefreshDashboard();
      onNavigate('training-plan', learningSystem.primaryAction.routeStage ?? 'foundation');
      pulseMood('celebrate');
      showToast('学习计划已同步。');
      return '已同步并打开培养方案。';
    }

    if (hasAny(text, ['生成探索', '生成画像', '生成专业探索', '探索计划', '重新探索'])) {
      onNavigate('exploration');
      await onBuildExplorationPlan();
      pulseMood('running');
      setPendingAction('探索计划');
      return '探索计划开始生成。';
    }

    if (hasAny(text, ['专业探索', '画像', '广度', '探索页'])) {
      onNavigate('exploration');
      pulseMood('guide');
      return '已打开画像与广度。';
    }

    if (hasAny(text, ['培养方案', '学习计划', '计划页'])) {
      const prepared = onPrepareFocus(draft);
      onNavigate('training-plan', prepared.stage ?? stage ?? 'foundation');
      pulseMood('guide');
      return '已打开培养方案。';
    }

    if (hasAny(text, ['基础阶段', '基础定标'])) {
      onPrepareFocus({ ...draft, stage: 'foundation' });
      onNavigate('training-plan', 'foundation');
      pulseMood('guide');
      return '已切到基础定标。';
    }

    if (hasAny(text, ['实践阶段', '课堂练习', '练习阶段'])) {
      onPrepareFocus({ ...draft, stage: 'practice' });
      onNavigate('training-plan', 'practice');
      pulseMood('guide');
      return '已切到课堂练习。';
    }

    if (hasAny(text, ['进阶阶段', '进阶迁移', '迁移阶段'])) {
      onPrepareFocus({ ...draft, stage: 'advancement' });
      onNavigate('training-plan', 'advancement');
      pulseMood('guide');
      return '已切到进阶迁移。';
    }

    if (wantsClassroomStart(text)) {
      onNavigate('classroom');
      setPendingAction('课堂验证');
      await onStartClassroom(draft);
      pulseMood('running', 2600);
      return `${targetName}课堂开始生成。`;
    }

    if (wantsLightweightResource(text)) {
      onNavigate('classroom');
      setPendingAction('轻量资源');
      await onLightweightGenerate(draft);
      pulseMood('running', 2400);
      return `${targetName}资源开始生成。`;
    }

    if (hasAny(text, ['回写', '证据', '最近结果', '学习结果', '看结果'])) {
      onNavigate('progress');
      pulseMood('guide');
      return '已打开回写证据。';
    }

    if (hasAny(text, ['推荐', '建议', '该学什么', '学什么'])) {
      pulseMood('guide');
      return compactSuggestionReply(learningSystem);
    }

    if (hasAny(text, ['分数', '体系', '层级', '资源关系'])) {
      pulseMood('guide');
      return compactSystemScoreReply(learningSystem);
    }

    if (draft.knowledgeName || draft.studentId || draft.stage) {
      const prepared = onPrepareFocus(draft);
      onNavigate('classroom');
      pulseMood('guide');
      return `已填好${prepared.knowledgeName ?? targetName}。`;
    }

    pulseMood('guide');
    return '可说：开始验证、生成资源、打开培养方案、看回写。';
  };

  return (
    <div className="xilian-pet-root" aria-live="polite">
      <style>{PET_STYLES}</style>

      {toast && (
        <aside className="xilian-pet-toast">
          <strong>昔涟</strong>
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)}>知道了</button>
        </aside>
      )}

      {!isOpen && showTooltip && (
        <button
          type="button"
          className="xilian-pet-tooltip"
          style={tooltipDynamicStyle}
          onClick={() => {
            setIsOpen(true);
            setShowTooltip(false);
          }}
        >
          让我推进你的学习计划
        </button>
      )}

      {isOpen && (
        <section className="xilian-pet-panel" style={chatPanelDynamicStyle}>
          <header className="xilian-pet-panel__header">
            <div>
              <span>Student Learning Partner</span>
              <strong>昔涟</strong>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="收起昔涟面板">收起</button>
          </header>

          <div className="xilian-pet-status-grid">
            <article>
              <small>学生</small>
              <strong>{studentId}</strong>
            </article>
            <article>
              <small>阶段</small>
              <strong>{currentStage.label}</strong>
            </article>
            <article>
              <small>焦点</small>
              <strong>{learningSystem.focus.knowledgeName}</strong>
            </article>
          </div>

          <div className="xilian-pet-messages">
            {messages.map((message) => (
              <div key={message.id} className={message.sender === 'student' ? 'xilian-pet-message xilian-pet-message--student' : 'xilian-pet-message'}>
                {message.sender === 'pet' && <span className="xilian-pet-message__avatar">昔涟</span>}
                <div>
                  <p>{message.text}</p>
                  <time>{message.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
              </div>
            ))}
            {loading && (
              <div className="xilian-pet-message">
                <span className="xilian-pet-message__avatar">昔涟</span>
                <div className="xilian-pet-thinking"><i /><i /><i /></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="xilian-pet-actions">
            {quickActions.map((action) => (
              <button key={action.label} type="button" onClick={() => void handleSend(action.prompt)} disabled={loading || busy}>
                {action.label}
              </button>
            ))}
          </div>

          <form
            className="xilian-pet-input"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend(inputVal);
            }}
          >
            <input
              value={inputVal}
              onChange={(event) => setInputVal(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void handleSend(inputVal);
              }}
              placeholder="如：给 stu_026 生成动态规划课堂"
              disabled={loading || busy}
            />
            <button type="submit" disabled={!inputVal.trim() || loading || busy}>发送</button>
          </form>
        </section>
      )}

      <div
        className={`xilian-pet-sprite xilian-pet-sprite--${activeMood}`}
        style={{ left: position.x, top: position.y, cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onKeyDown={handlePetKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label="昔涟学习伙伴"
        data-testid="xilian-pet-sprite"
      >
        <div className="xilian-pet-sprite__frame" style={petFrameStyle} />
        <div className="xilian-pet-nameplate">
          <strong>昔涟</strong>
          <span>{loading || busy ? '思考中' : currentStage.label}</span>
        </div>
        <div
          className="xilian-pet-orbit"
          style={{ '--score': `${learningSystem.focus.score}%` } as CSSProperties}
        >
          {learningSystem.focus.score}
        </div>
      </div>
    </div>
  );

  function handlePetKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setIsOpen((prev) => !prev);
    setShowTooltip(false);
  }
}

function initialPetPosition() {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return clampPosition(window.innerWidth - PET_WIDTH - 24, window.innerHeight - PET_HEIGHT - 42);
}

function clampPosition(x: number, y: number) {
  if (typeof window === 'undefined') return { x, y };
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - PET_WIDTH - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - PET_HEIGHT - 8)),
  };
}

function buildFrameStyle(frame: number): CSSProperties {
  const col = frame % PET_COLUMNS;
  const row = Math.floor(frame / PET_COLUMNS);
  return {
    backgroundImage: `url(${XILIAN_SPRITESHEET_SRC})`,
    backgroundSize: `${PET_COLUMNS * 100}% ${PET_ROWS * 100}%`,
    backgroundPosition: `${(col / (PET_COLUMNS - 1)) * 100}% ${(row / (PET_ROWS - 1)) * 100}%`,
  };
}

function buildProgressReply(learningSystem: StudentLearningSystem, activePage: StudentPage): string {
  return [
    `你现在在「${learningSystem.currentStage.label}」，页面是「${pageLabel(activePage)}」。`,
    `当前焦点：${learningSystem.focus.knowledgeName}（准备度 ${learningSystem.focus.score}）。`,
    `阶段验证题：${learningSystem.validationQuestion.prompt}`,
    `我建议下一步：${learningSystem.primaryAction.label}。${learningSystem.primaryAction.detail}`,
  ].join('\n');
}

function compactSuggestionReply(learningSystem: StudentLearningSystem): string {
  return learningSystem.suggestions[0]
    ? `建议：${compactText(learningSystem.suggestions[0], 34)}`
    : `下一步：${learningSystem.primaryAction.label}`;
}

function compactSystemScoreReply(learningSystem: StudentLearningSystem): string {
  const metric = learningSystem.metrics[0];
  return metric ? `${metric.label} ${metric.value}` : `准备度 ${learningSystem.focus.score}`;
}

function buildDraftFromPrompt(
  rawText: string,
  fallback: {
    studentId: string;
    knowledgeId: string;
    knowledgeName: string;
    stage?: TrainingStageKey | null;
  },
): StudentPetActionDraft {
  const topic = extractTopic(rawText);
  const stage = inferStage(rawText) ?? fallback.stage ?? null;
  const studentId = extractStudentId(rawText) ?? undefined;

  return {
    studentId,
    knowledgeName: topic ?? undefined,
    knowledgeId: topic ? buildKnowledgeId(topic) : undefined,
    stage,
  };
}

function inferStage(rawText: string): TrainingStageKey | null {
  const text = normalizeCommand(rawText);
  if (hasAny(text, ['基础', '定标', '入门'])) return 'foundation';
  if (hasAny(text, ['进阶', '迁移', '项目', '作品'])) return 'advancement';
  if (hasAny(text, ['实践', '练习', '课堂', '验证', '做题'])) return 'practice';
  return null;
}

function extractTopic(rawText: string): string | null {
  const marked = extractSegment(rawText, ['主要内容是', '内容是', '主题是', '知识点是', '关于', '围绕', '生成', '学习']);
  if (marked) return cleanTopic(marked);

  const clean = rawText
    .replace(/stu[_-]?\d+/gi, '')
    .replace(/(帮我|请|开始|生成|创建|做一个|做一份|课堂验证|课堂|验证|测验|做题|轻量资源|资源包|练习资源|培养方案|学习计划|基础阶段|实践阶段|进阶阶段|打开|进入|查看|看)/g, '')
    .replace(/(主要内容|内容|主题|知识点|是|为|：|:)/g, ' ')
    .split(/[，,。；;！!？?\n]/)[0]
    .trim();

  const topic = cleanTopic(clean);
  if (topic && topic.length >= 2) return compactText(topic, 24);
  return null;
}

function extractSegment(rawText: string, markers: string[]): string | null {
  for (const marker of markers) {
    const index = rawText.indexOf(marker);
    if (index === -1) continue;
    const value = rawText
      .slice(index + marker.length)
      .replace(/^[是为:：\s]+/, '')
      .split(/重点是|难点是|要讲|讲哪些|包含|包括|覆盖|[，,。；;！!？?\n]/)[0]
      .trim();
    if (value) return compactText(value, 28);
  }
  return null;
}

function extractStudentId(rawText: string): string | null {
  const match = rawText.match(/stu[_-]?\d+/i);
  return match ? match[0].replace('-', '_').toLowerCase() : null;
}

function wantsClassroomStart(text: string): boolean {
  return (
    hasAny(text, ['开始课堂', '课堂验证', '开始验证', '生成课堂', '做题', '测验'])
    || (hasAny(text, ['生成', '创建', '开始', '做']) && hasAny(text, ['课堂', '验证', '测验']))
  );
}

function wantsLightweightResource(text: string): boolean {
  return (
    hasAny(text, ['轻量资源', '生成资源', '资源包', '练习资源'])
    || (hasAny(text, ['生成', '创建', '做']) && hasAny(text, ['资源', '练习包']))
  );
}

function cleanTopic(value: string): string | null {
  const topic = value
    .replace(/(课堂验证|课堂|验证|测验|做题|轻量资源|资源包|练习资源|培养方案|学习计划)$/g, '')
    .replace(/^(一个|一份|一套|关于|围绕)/g, '')
    .trim();
  return topic || null;
}

function buildKnowledgeId(value: string): string {
  const asciiSlug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (asciiSlug) return asciiSlug;
  const encoded = Array.from(value.trim())
    .slice(0, 8)
    .map((char) => char.charCodeAt(0).toString(36))
    .join('-');
  return encoded ? `topic-${encoded}` : 'manual-topic';
}

function pageLabel(page: StudentPage): string {
  switch (page) {
    case 'training-plan':
      return '培养方案';
    case 'classroom':
      return '课堂验证';
    case 'progress':
      return '回写证据';
    case 'exploration':
      return '画像与广度';
  }
}

function normalizeCommand(value: string): string {
  return value.trim().toLowerCase().replace(/[\s,，。.!！?？、]/g, '');
}

function hasAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword.toLowerCase().replace(/[\s,，。.!！?？、]/g, '')));
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

const PET_STYLES = `
.xilian-pet-root {
  --xilian-ink: var(--freddie-ink, #241c15);
  --xilian-yellow: var(--freddie-yellow, #ffe01b);
  --xilian-cream: var(--freddie-cream, #fbefe3);
  --xilian-paper: var(--freddie-paper, #fffdf6);
  --xilian-muted: #6f675f;
  --xilian-coral: var(--freddie-coral, #ff4d74);
  --xilian-blue: #7fd7ee;
  --xilian-lime: #b9f27d;
  --xilian-shadow: 8px 8px 0 var(--xilian-ink);
  --xilian-soft-shadow: 4px 4px 0 var(--xilian-ink);
  position: relative;
  z-index: 9999;
}

.xilian-pet-tooltip {
  position: fixed;
  z-index: 10001;
  max-width: 250px;
  border: 2px solid var(--xilian-ink);
  border-radius: 999px;
  background: var(--xilian-yellow);
  color: var(--xilian-ink);
  box-shadow: var(--xilian-soft-shadow);
  padding: 10px 15px;
  font-size: 13px;
  font-weight: 950;
  cursor: pointer;
  animation: xilian-float 3.2s ease-in-out infinite;
}

.xilian-pet-tooltip::after {
  content: "";
  position: absolute;
  right: 26px;
  bottom: -8px;
  width: 14px;
  height: 14px;
  border-right: 2px solid var(--xilian-ink);
  border-bottom: 2px solid var(--xilian-ink);
  background: var(--xilian-yellow);
  transform: rotate(45deg);
}

.xilian-pet-toast {
  position: fixed;
  right: 26px;
  bottom: 224px;
  z-index: 10003;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(420px, calc(100vw - 32px));
  border: 2px solid var(--xilian-ink);
  border-radius: 999px;
  background: var(--xilian-yellow);
  color: var(--xilian-ink);
  box-shadow: var(--xilian-soft-shadow);
  padding: 10px 12px 10px 16px;
  animation: xilian-panel-in 220ms ease-out;
}

.xilian-pet-toast strong,
.xilian-pet-toast span,
.xilian-pet-toast button {
  font-size: 12px;
  font-weight: 950;
}

.xilian-pet-toast button {
  border: 2px solid var(--xilian-ink);
  border-radius: 999px;
  background: var(--xilian-paper);
  color: var(--xilian-ink);
  cursor: pointer;
  padding: 7px 10px;
}

.xilian-pet-panel {
  position: fixed;
  z-index: 10000;
  width: min(${PANEL_WIDTH}px, calc(100vw - 24px));
  height: min(${PANEL_HEIGHT}px, calc(100vh - 24px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 3px solid var(--xilian-ink);
  border-radius: 28px;
  background:
    radial-gradient(circle at 90% 10%, rgba(255, 77, 116, 0.16) 0 16%, transparent 17%),
    radial-gradient(circle, rgba(36, 28, 21, 0.12) 0 1px, transparent 2px) 0 0 / 24px 24px,
    var(--xilian-paper);
  color: var(--xilian-ink);
  box-shadow: var(--xilian-shadow);
  animation: xilian-panel-in 220ms ease-out;
}

.xilian-pet-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 3px solid var(--xilian-ink);
  background:
    linear-gradient(90deg, var(--xilian-yellow) 0 64%, var(--xilian-cream) 64% 100%);
  color: var(--xilian-ink);
}

.xilian-pet-panel__header span,
.xilian-pet-status-grid small {
  display: block;
  color: var(--xilian-muted);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.xilian-pet-panel__header strong {
  display: block;
  margin-top: 3px;
  color: var(--xilian-ink);
  font-family: "Cooper Black", Georgia, "Times New Roman", serif;
  font-size: 30px;
  line-height: 0.94;
  letter-spacing: -0.055em;
}

.xilian-pet-panel__header button,
.xilian-pet-actions button,
.xilian-pet-input button {
  border: 2px solid var(--xilian-ink);
  border-radius: 999px;
  background: var(--xilian-paper);
  color: var(--xilian-ink);
  box-shadow: 3px 3px 0 var(--xilian-ink);
  cursor: pointer;
  font-weight: 950;
  transition: transform 170ms cubic-bezier(.34,1.56,.64,1), box-shadow 170ms ease, background 170ms ease;
}

.xilian-pet-panel__header button {
  min-height: 34px;
  padding: 0 12px;
  background: var(--xilian-paper);
}

.xilian-pet-status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 2px dashed rgba(36, 28, 21, 0.34);
  background: var(--xilian-cream);
}

.xilian-pet-status-grid article {
  min-width: 0;
  padding: 10px;
  border: 2px solid var(--xilian-ink);
  border-radius: 16px;
  background: var(--xilian-paper);
  box-shadow: 3px 3px 0 var(--xilian-ink);
}

.xilian-pet-status-grid strong {
  display: block;
  overflow: hidden;
  color: var(--xilian-ink);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xilian-pet-messages {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 16px;
}

.xilian-pet-messages::-webkit-scrollbar {
  width: 10px;
}

.xilian-pet-messages::-webkit-scrollbar-thumb {
  border: 2px solid var(--xilian-paper);
  border-radius: 999px;
  background: var(--xilian-ink);
}

.xilian-pet-message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 88%;
}

.xilian-pet-message--student {
  align-self: flex-end;
  justify-content: flex-end;
}

.xilian-pet-message__avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 2px solid var(--xilian-ink);
  border-radius: 999px;
  background: var(--xilian-yellow);
  color: var(--xilian-ink);
  box-shadow: 2px 2px 0 var(--xilian-ink);
  font-size: 11px;
  font-weight: 950;
}

.xilian-pet-message > div:not(.xilian-pet-thinking) {
  display: grid;
  gap: 5px;
  padding: 11px 13px;
  border: 2px solid var(--xilian-ink);
  border-radius: 4px 18px 18px 18px;
  background: var(--xilian-paper);
  color: var(--xilian-ink);
  box-shadow: 3px 3px 0 var(--xilian-ink);
}

.xilian-pet-message--student > div {
  border-radius: 18px 4px 18px 18px !important;
  background: var(--xilian-ink) !important;
  color: var(--xilian-paper) !important;
}

.xilian-pet-message p {
  margin: 0;
  white-space: pre-wrap;
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
}

.xilian-pet-message time {
  color: var(--xilian-muted);
  font-size: 10px;
  font-weight: 800;
}

.xilian-pet-message--student time {
  color: rgba(255, 253, 246, 0.68);
}

.xilian-pet-thinking {
  display: flex;
  gap: 4px;
  padding: 12px;
  border: 2px solid var(--xilian-ink);
  border-radius: 18px;
  background: var(--xilian-paper);
  box-shadow: 3px 3px 0 var(--xilian-ink);
}

.xilian-pet-thinking i {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--xilian-ink);
  animation: xilian-dot 1.2s infinite ease-in-out both;
}

.xilian-pet-thinking i:nth-child(2) { animation-delay: 120ms; }
.xilian-pet-thinking i:nth-child(3) { animation-delay: 240ms; }

.xilian-pet-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 14px;
  border-top: 2px dashed rgba(36, 28, 21, 0.34);
  background: var(--xilian-cream);
}

.xilian-pet-actions button {
  min-height: 34px;
  padding: 0 10px;
  background: var(--xilian-paper);
  color: var(--xilian-ink);
  font-size: 12px;
}

.xilian-pet-actions button:hover:not(:disabled),
.xilian-pet-input button:hover:not(:disabled),
.xilian-pet-panel__header button:hover:not(:disabled),
.xilian-pet-tooltip:hover {
  transform: translate(-2px, -2px) rotate(-0.6deg);
  box-shadow: 6px 6px 0 var(--xilian-ink);
  background: var(--xilian-yellow);
}

.xilian-pet-actions button:disabled,
.xilian-pet-input button:disabled {
  cursor: wait;
  opacity: 0.52;
}

.xilian-pet-sprite:focus-visible,
.xilian-pet-tooltip:focus-visible,
.xilian-pet-actions button:focus-visible,
.xilian-pet-input button:focus-visible,
.xilian-pet-panel__header button:focus-visible {
  outline: 3px solid var(--xilian-blue);
  outline-offset: 3px;
}

.xilian-pet-input {
  display: flex;
  gap: 8px;
  padding: 12px 14px 14px;
  border-top: 3px solid var(--xilian-ink);
  background: var(--xilian-paper);
}

.xilian-pet-input input {
  flex: 1;
  min-width: 0;
  min-height: 42px;
  border: 2px solid var(--xilian-ink);
  border-radius: 999px;
  background: #fffaf0;
  padding: 0 14px;
  color: var(--xilian-ink);
  font-weight: 750;
  outline: none;
}

.xilian-pet-input input:focus {
  background: #fff;
  box-shadow: 0 0 0 4px rgba(255, 224, 27, 0.42);
}

.xilian-pet-input button {
  min-width: 72px;
  background: var(--xilian-yellow);
  color: var(--xilian-ink);
}

.xilian-pet-sprite {
  position: fixed;
  z-index: 10002;
  width: ${PET_WIDTH}px;
  height: ${PET_HEIGHT + 34}px;
  touch-action: none;
  user-select: none;
}

.xilian-pet-sprite__frame {
  position: relative;
  z-index: 2;
  width: ${PET_WIDTH}px;
  height: ${PET_HEIGHT}px;
  background-repeat: no-repeat;
  image-rendering: auto;
  filter: drop-shadow(4px 6px 0 rgba(36, 28, 21, 0.78)) drop-shadow(0 12px 14px rgba(36, 28, 21, 0.13));
  animation: xilian-float 3.4s ease-in-out infinite;
}

.xilian-pet-sprite--thinking .xilian-pet-sprite__frame,
.xilian-pet-sprite--running .xilian-pet-sprite__frame {
  animation: xilian-active 800ms ease-in-out infinite;
}

.xilian-pet-nameplate {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 10px;
  border: 2px solid var(--xilian-ink);
  border-radius: 999px;
  background: var(--xilian-paper);
  color: var(--xilian-ink);
  box-shadow: 3px 3px 0 var(--xilian-ink);
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px);
  transition: opacity 160ms ease, transform 160ms ease;
}

.xilian-pet-sprite:hover .xilian-pet-nameplate,
.xilian-pet-sprite:focus-visible .xilian-pet-nameplate,
.xilian-pet-sprite[aria-expanded="true"] .xilian-pet-nameplate {
  opacity: 1;
  transform: translateY(0);
}

.xilian-pet-nameplate strong {
  color: var(--xilian-ink);
  font-size: 13px;
  font-weight: 950;
}

.xilian-pet-nameplate span {
  overflow: hidden;
  color: var(--xilian-muted);
  font-size: 11px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xilian-pet-orbit {
  position: absolute;
  right: 0;
  top: 10px;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 2px solid var(--xilian-ink);
  border-radius: 999px;
  background:
    radial-gradient(circle at center, var(--xilian-paper) 0 52%, transparent 53%),
    conic-gradient(var(--xilian-yellow) 0 var(--score), var(--xilian-cream) var(--score) 100%);
  color: var(--xilian-ink);
  font-size: 10px;
  font-weight: 950;
  box-shadow: 3px 3px 0 var(--xilian-ink);
}

@keyframes xilian-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@keyframes xilian-active {
  0%, 100% { transform: translateY(0) rotate(-1deg); }
  50% { transform: translateY(-8px) rotate(1deg); }
}

@keyframes xilian-panel-in {
  from { opacity: 0; transform: translateY(16px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes xilian-dot {
  0%, 80%, 100% { transform: scale(0.4); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

@media (max-width: 720px) {
  .xilian-pet-panel {
    left: 12px !important;
    top: 12px !important;
    width: calc(100vw - 24px);
    height: min(620px, calc(100vh - 24px));
  }

  .xilian-pet-toast {
    right: 12px;
    bottom: 204px;
  }

  .xilian-pet-status-grid,
  .xilian-pet-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .xilian-pet-sprite {
    transform: scale(0.86);
    transform-origin: bottom right;
  }
}
`;
