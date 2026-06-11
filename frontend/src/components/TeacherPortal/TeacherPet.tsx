import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from 'react';
import type { TeacherArtifactType } from './artifacts';
import type { ClassProfile, RunState, Student, TabKey } from './model';

export interface TeacherPetGenerateDraft {
  studentId?: string;
  knowledgeId?: string;
  knowledgeName?: string;
  goal?: string;
}

interface Message {
  id: string;
  sender: 'pet' | 'teacher';
  text: string;
  ts: Date;
}

interface PendingTask {
  type: TeacherArtifactType;
  title: string;
}

interface Props {
  activeTab: TabKey;
  runState: RunState;
  autoCloseKey: string;
  activeClassName: string;
  classes: ClassProfile[];
  students: Student[];
  activeStudent: Student;
  knowledgeId: string;
  knowledgeName: string;
  goal: string;
  selectedType: TeacherArtifactType;
  canExportPptx: boolean;
  pptExportState: 'idle' | 'exporting' | 'done' | 'error';
  onNavigate: (tab: TabKey, type?: TeacherArtifactType) => void;
  onClassId: (classId: string) => void;
  onChooseStudent: (student: Student) => void;
  onPrepareGeneration: (draft: TeacherPetGenerateDraft) => void;
  onGenerate: (draft?: TeacherPetGenerateDraft & { targetType?: TeacherArtifactType }) => Promise<void> | void;
  onExportPptx: () => Promise<void> | void;
}

type PetMood = 'idle' | 'thinking' | 'guide' | 'running' | 'celebrate';

const FEIBI_SPRITESHEET_SRC = '/assets/pets/feibi-spritesheet.webp';
const PET_COLUMNS = 8;
const PET_ROWS = 9;
const PET_WIDTH = 112;
const PET_HEIGHT = 123;
const PANEL_WIDTH = 390;
const PANEL_HEIGHT = 520;

const PET_SEQUENCES: Record<PetMood, number[]> = {
  idle: [0, 1, 2, 3, 4, 5],
  thinking: [32, 33, 34, 35, 34, 33],
  guide: [40, 41, 42, 43, 44, 45],
  running: [8, 9, 10, 11, 12, 13, 14, 15],
  celebrate: [48, 49, 50, 51, 52, 53],
};

const MODULE_LABELS: Partial<Record<TeacherArtifactType, string>> = {
  TalentPlan: '人培方案',
  Syllabus: '大纲',
  LessonPlan: '教案',
  SlideDeck: 'PPT',
  KeyFocus: '重难点',
  Document: '讲义',
  Exercise: '练习',
  Visual: '动画',
  Code: '代码',
  Video: '视频',
  Reading: '阅读',
};

const TAB_LABELS: Record<TabKey, string> = {
  overview: '总览',
  generator: '生成',
  review: '人培体系',
  intervention: '干预',
};

export function TeacherPet({
  activeTab,
  runState,
  autoCloseKey,
  activeClassName,
  classes,
  students,
  activeStudent,
  knowledgeId,
  knowledgeName,
  goal,
  selectedType,
  canExportPptx,
  pptExportState,
  onNavigate,
  onClassId,
  onChooseStudent,
  onPrepareGeneration,
  onGenerate,
  onExportPptx,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState(() => initialPetPosition());
  const [isDragging, setIsDragging] = useState(false);
  const [mood, setMood] = useState<PetMood>('idle');
  const [frame, setFrame] = useState(0);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 'welcome',
      sender: 'pet',
      text: '我是菲比。说任务，我来操作。',
      ts: new Date(),
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);

  const dragStart = useRef({ x: 0, y: 0 });
  const petStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const moodTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastRunStateRef = useRef<RunState>(runState);

  const busy = loading || runState === 'submitting' || runState === 'running' || pptExportState === 'exporting';
  const activeMood: PetMood = busy ? 'thinking' : mood;
  const selectedLabel = MODULE_LABELS[selectedType] ?? selectedType;
  const quickActions = useMemo(
    () => [
      { label: 'PPT', prompt: '打开PPT' },
      { label: '人培', prompt: '打开人培方案体系' },
      { label: '大纲', prompt: '打开大纲' },
      { label: '教案', prompt: '打开教案' },
      { label: '重难点', prompt: '打开重难点' },
      { label: '生成', prompt: `做一个PPT，内容是${knowledgeName}，重点是${activeStudent.focus}` },
      { label: '导出', prompt: '导出PPT' },
      { label: '干预', prompt: '看干预队列' },
    ],
    [activeStudent.focus, knowledgeName],
  );

  useEffect(() => {
    const sequence = PET_SEQUENCES[activeMood];
    let cursor = 0;
    setFrame(sequence[0]);
    const timer = window.setInterval(() => {
      cursor = (cursor + 1) % sequence.length;
      setFrame(sequence[cursor]);
    }, activeMood === 'idle' ? 170 : 110);
    return () => window.clearInterval(timer);
  }, [activeMood]);

  useEffect(() => {
    const handleResize = () => setPosition((prev) => clampPosition(prev.x, prev.y));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setPosition(initialPetPosition());
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    setIsOpen(false);
    setShowTooltip(false);
    setPosition(initialPetPosition());
  }, [autoCloseKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowTooltip(false), 9000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isOpen]);

  useEffect(() => {
    const previous = lastRunStateRef.current;
    lastRunStateRef.current = runState;
    if (!pendingTask) return;

    if ((previous === 'running' || previous === 'submitting') && runState === 'done') {
      const label = MODULE_LABELS[pendingTask.type] ?? '内容';
      const text = `${label}已生成，已打开。`;
      pushPetMessage(text);
      showDoneToast(text);
      pulseMood('celebrate', 2400);
      setPendingTask(null);
    }

    if ((previous === 'running' || previous === 'submitting') && runState === 'error') {
      pushPetMessage('生成失败，先看页面提示。');
      setPendingTask(null);
    }
  }, [pendingTask, runState]);

  useEffect(() => () => {
    if (moodTimerRef.current !== null) window.clearTimeout(moodTimerRef.current);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  const petFrameStyle = useMemo<CSSProperties>(() => buildFrameStyle(frame), [frame]);
  const chatPanelDynamicStyle = useMemo<CSSProperties>(() => {
    const fitsLeft = position.x - PANEL_WIDTH - 16 >= 12;
    const fitsRight = position.x + PET_WIDTH + PANEL_WIDTH + 16 <= window.innerWidth - 12;
    return {
      left: fitsLeft ? position.x - PANEL_WIDTH - 16 : fitsRight ? position.x + PET_WIDTH + 16 : 12,
      top: Math.max(12, Math.min(position.y - 180, window.innerHeight - PANEL_HEIGHT - 12)),
    };
  }, [position.x, position.y]);
  const tooltipDynamicStyle = useMemo<CSSProperties>(() => ({
    left: Math.max(12, Math.min(position.x - 128, window.innerWidth - 220)),
    top: Math.max(12, position.y - 48),
  }), [position.x, position.y]);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setIsDragging(true);
    hasMoved.current = false;
    dragStart.current = { x: event.clientX, y: event.clientY };
    petStart.current = { x: position.x, y: position.y };
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

  const pulseMood = (nextMood: PetMood, durationMs = 1600) => {
    if (moodTimerRef.current !== null) window.clearTimeout(moodTimerRef.current);
    setMood(nextMood);
    moodTimerRef.current = window.setTimeout(() => {
      setMood('idle');
      moodTimerRef.current = null;
    }, durationMs);
  };

  const showDoneToast = (text: string) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(text);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 5200);
  };

  const finishNavigation = (text: string) => {
    showDoneToast(text);
    window.setTimeout(() => setIsOpen(false), 140);
    return text;
  };

  const handlePetClick = () => {
    if (hasMoved.current) return;
    setIsOpen((prev) => !prev);
    setShowTooltip(false);
  };

  const handleSend = async (text: string) => {
    const value = text.trim();
    if (!value || busy) return;

    setMessages((prev) => [...prev, { id: cryptoId(), sender: 'teacher', text: value, ts: new Date() }]);
    setInputVal('');
    setLoading(true);
    setShowTooltip(false);

    try {
      const reply = await resolvePetCommand(value);
      pushPetMessage(reply);
    } catch (err) {
      pushPetMessage(err instanceof Error ? `没跑成：${err.message}` : '没跑成，先看当前页。');
    } finally {
      setLoading(false);
    }
  };

  const resolvePetCommand = async (rawText: string): Promise<string> => {
    const text = normalizeCommand(rawText);
    const targetType = inferTargetType(text);
    const requestedStudent = findStudentFromPrompt(rawText, students);
    const requestedClass = findClassFromPrompt(rawText, classes);
    const wantsGeneration = isGenerationPrompt(text, targetType);

    if (requestedClass && !wantsGeneration && hasAny(text, ['班级', '班', '课堂'])) {
      onClassId(requestedClass.class_id);
      onNavigate('overview');
      pulseMood('guide');
      return finishNavigation(`已切到${requestedClass.name}。`);
    }

    if (requestedStudent && !wantsGeneration) {
      onChooseStudent(requestedStudent);
      pulseMood('guide');
      return finishNavigation(`已选${requestedStudent.id}。`);
    }

    if (hasAny(text, ['导出', '下载']) && hasAny(text, ['ppt', '课件', '幻灯'])) {
      onNavigate('review', 'SlideDeck');
      if (!canExportPptx) {
        pulseMood('guide');
        return '还没有PPT，先说“做PPT”。';
      }
      await onExportPptx();
      pulseMood('celebrate');
      return '已触发PPTX导出。';
    }

    if (wantsGeneration) {
      const generationType = targetType ?? 'TalentPlan';
      const generationStudent = requestedStudent ?? activeStudent;
      const draft = buildDraftFromPrompt(rawText, {
        activeStudent: generationStudent,
        knowledgeId: generationStudent.knowledgeId || knowledgeId,
        knowledgeName: generationStudent.knowledgeName || knowledgeName,
        goal,
        targetType: generationType,
      });
      if (requestedClass) onClassId(requestedClass.class_id);
      onPrepareGeneration(draft);
      onNavigate('generator', generationType);
      setPendingTask({ type: generationType, title: draft.knowledgeName ?? knowledgeName });
      pulseMood('running', 2600);
      await delay(160);
      await onGenerate({ ...draft, targetType: generationType });
      return `${MODULE_LABELS[generationType] ?? '内容'}开始生成。`;
    }

    if (hasAny(text, ['ppt', '课件', '幻灯'])) {
      onNavigate('review', 'SlideDeck');
      pulseMood('guide');
      return finishNavigation(canExportPptx ? '已打开PPT，可导出。' : '已打开PPT页。');
    }

    if (hasAny(text, ['人培', '培养方案', '体系'])) {
      onNavigate('review', 'TalentPlan');
      pulseMood('guide');
      return finishNavigation('已打开人培体系。');
    }

    if (hasAny(text, ['大纲', '提纲'])) {
      onNavigate('review', 'Syllabus');
      pulseMood('guide');
      return finishNavigation('已打开大纲。');
    }

    if (hasAny(text, ['教案'])) {
      onNavigate('review', 'LessonPlan');
      pulseMood('guide');
      return finishNavigation('已打开教案。');
    }

    if (hasAny(text, ['重难点', '重点', '难点'])) {
      onNavigate('review', 'KeyFocus');
      pulseMood('guide');
      return finishNavigation('已打开重难点。');
    }

    if (hasAny(text, ['生成页', '填表', '参数'])) {
      onNavigate('generator');
      pulseMood('guide');
      return finishNavigation('已打开生成页。');
    }

    if (hasAny(text, ['干预', '队列', '学生'])) {
      onNavigate('intervention');
      pulseMood('guide');
      return finishNavigation('已打开干预队列。');
    }

    if (hasAny(text, ['总览', '首页', '概览'])) {
      onNavigate('overview');
      pulseMood('guide');
      return finishNavigation('已回到总览。');
    }

    pulseMood('guide');
    return '可说：做PPT、打开人培、切学生、导出。';
  };

  return (
    <div className="feibi-teacher-root" aria-live="polite">
      <style>{FEIBI_STYLES}</style>

      {toast && (
        <aside className="feibi-teacher-toast">
          <strong>菲比</strong>
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)}>知道了</button>
        </aside>
      )}

      {!isOpen && showTooltip && (
        <button
          type="button"
          className="feibi-teacher-tooltip"
          style={tooltipDynamicStyle}
          onClick={() => {
            setIsOpen(true);
            setShowTooltip(false);
          }}
        >
          菲比可操作
        </button>
      )}

      {isOpen && (
        <section className="feibi-teacher-panel" style={chatPanelDynamicStyle}>
          <header className="feibi-teacher-panel__header">
            <div>
              <span>Teacher Operator</span>
              <strong>菲比</strong>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="收起菲比面板">收起</button>
          </header>

          <div className="feibi-teacher-status-grid">
            <article>
              <small>页面</small>
              <strong>{tabLabel(activeTab)}</strong>
            </article>
            <article>
              <small>模块</small>
              <strong>{selectedLabel}</strong>
            </article>
            <article>
              <small>状态</small>
              <strong>{busy ? '运行中' : '待命'}</strong>
            </article>
          </div>

          <div className="feibi-teacher-context">
            <span>{compactText(activeClassName, 14)}</span>
            <span>{activeStudent.id}</span>
            <span>{compactText(knowledgeName, 12)}</span>
          </div>

          <div className="feibi-teacher-messages">
            {messages.map((message) => (
              <div key={message.id} className={message.sender === 'teacher' ? 'feibi-teacher-message feibi-teacher-message--teacher' : 'feibi-teacher-message'}>
                {message.sender === 'pet' && <span className="feibi-teacher-message__avatar">菲比</span>}
                <div>
                  <p>{message.text}</p>
                  <time>{message.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
              </div>
            ))}
            {loading && (
              <div className="feibi-teacher-message">
                <span className="feibi-teacher-message__avatar">菲比</span>
                <div className="feibi-teacher-thinking"><i /><i /><i /></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="feibi-teacher-actions">
            {quickActions.map((action) => (
              <button key={action.label} type="button" onClick={() => void handleSend(action.prompt)} disabled={busy}>
                {action.label}
              </button>
            ))}
          </div>

          <form
            className="feibi-teacher-input"
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
              placeholder="做一个PPT，内容是递归栈，重点是遍历顺序"
              disabled={busy}
            />
            <button type="submit" disabled={!inputVal.trim() || busy}>发送</button>
          </form>
        </section>
      )}

      <div
        className={`feibi-teacher-sprite feibi-teacher-sprite--${activeMood}`}
        style={{ left: position.x, top: position.y, cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handlePetClick}
        onKeyDown={handlePetKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label="菲比老师端助理"
        data-testid="feibi-teacher-sprite"
      >
        <div className="feibi-teacher-sprite__frame" style={petFrameStyle} />
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

function buildDraftFromPrompt(
  rawText: string,
  context: {
    activeStudent: Student;
    knowledgeId: string;
    knowledgeName: string;
    goal: string;
    targetType: TeacherArtifactType;
  },
): TeacherPetGenerateDraft {
  const topic = extractTopic(rawText, context.knowledgeName);
  const focus = extractSegment(rawText, ['重点是', '重点', '难点是', '难点', '强调']);
  const points = extractSegment(rawText, ['要讲', '讲哪些', '包含', '包括', '覆盖']);
  const style = extractModuleStyle(rawText);
  const studentId = extractStudentId(rawText) ?? context.activeStudent.id;
  const goalParts = [MODULE_LABELS[context.targetType] ?? '内容', topic];

  if (points) goalParts.push(`讲${points}`);
  if (focus) goalParts.push(`重点${focus}`);
  if (style) goalParts.push(style);

  return {
    studentId,
    knowledgeId: buildKnowledgeId(topic, context.knowledgeId),
    knowledgeName: topic,
    goal: goalParts.filter(Boolean).join(' · ') || context.goal,
  };
}

function inferTargetType(text: string): TeacherArtifactType | null {
  if (hasAny(text, ['ppt', 'powerpoint', '课件', '幻灯'])) return 'SlideDeck';
  if (hasAny(text, ['大纲', '提纲', '纲要'])) return 'Syllabus';
  if (hasAny(text, ['教案', '教学设计'])) return 'LessonPlan';
  if (hasAny(text, ['重难点', '重点难点', '难点', '重点'])) return 'KeyFocus';
  if (hasAny(text, ['人培', '培养方案', '培养体系', '方案体系'])) return 'TalentPlan';
  return null;
}

function isGenerationPrompt(text: string, targetType: TeacherArtifactType | null): boolean {
  if (!hasAny(text, ['做', '生成', '制作', '帮我', '创建', '出一版', '来一版', '准备', '产出'])) return false;
  return Boolean(targetType || hasAny(text, ['资源包', '材料', '任务']));
}

function findStudentFromPrompt(rawText: string, students: Student[]): Student | null {
  const normalized = normalizeCommand(rawText);
  const idMatch = extractStudentId(rawText);
  if (idMatch) {
    const compactId = normalizeCommand(idMatch);
    const matched = students.find((student) => normalizeCommand(student.id) === compactId);
    if (matched) return matched;
  }

  return students.find((student) => {
    const id = normalizeCommand(student.id);
    return normalized.includes(id) || normalized.includes(normalizeCommand(student.knowledgeName));
  }) ?? null;
}

function findClassFromPrompt(rawText: string, classes: ClassProfile[]): ClassProfile | null {
  const normalized = normalizeCommand(rawText);
  return classes.find((item) => normalized.includes(normalizeCommand(item.class_id)) || normalized.includes(normalizeCommand(item.name))) ?? null;
}

function extractTopic(rawText: string, fallback: string): string {
  const marked = extractSegment(rawText, ['主要内容是', '内容是', '主题是', '知识点是', '关于', '围绕']);
  if (marked) return marked;

  const clean = rawText
    .replace(/stu[_-]?\d+/gi, '')
    .replace(/(帮我|请|做一个|做一份|生成|制作|创建|出一版|来一版|ppt|PPT|powerpoint|课件|幻灯|大纲|教案|重难点|人培方案|人培|体系)/g, '')
    .replace(/(主要内容|内容|主题|知识点|重点|难点|要讲|讲哪些|包含|包括|覆盖|是|为|：|:)/g, ' ')
    .split(/[，,。；;！!？?\n]/)[0]
    .trim();

  if (clean.length >= 2) return compactText(clean, 24);
  return fallback;
}

function extractSegment(rawText: string, markers: string[]): string | null {
  for (const marker of markers) {
    const index = rawText.indexOf(marker);
    if (index === -1) continue;
    const value = rawText
      .slice(index + marker.length)
      .replace(/^[是为:：\s]+/, '')
      .split(/重点是|难点是|要讲|讲哪些|包含|包括|覆盖|风格是|类型是|形式是|[，,。；;！!？?\n]/)[0]
      .trim();
    if (value) return compactText(value, 28);
  }
  return null;
}

function extractModuleStyle(rawText: string): string | null {
  const style = extractSegment(rawText, ['类型是', '风格是', '形式是']);
  return style ? compactText(style, 18) : null;
}

function extractStudentId(rawText: string): string | null {
  const match = rawText.match(/stu[_-]?\d+/i);
  return match ? match[0].replace('-', '_').toLowerCase() : null;
}

function buildKnowledgeId(topic: string, fallback: string): string {
  if (!topic.trim()) return fallback;
  const asciiSlug = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (asciiSlug) return asciiSlug;
  const encoded = Array.from(topic)
    .slice(0, 8)
    .map((char) => char.charCodeAt(0).toString(36))
    .join('-');
  return encoded ? `topic-${encoded}` : fallback;
}

function initialPetPosition() {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  const viewport = getViewportSize();
  const reservedRightRail = viewport.width >= 1180 ? 332 : 22;
  return clampPosition(viewport.width - reservedRightRail - PET_WIDTH, viewport.height - PET_HEIGHT - 34);
}

function clampPosition(x: number, y: number) {
  if (typeof window === 'undefined') return { x, y };
  const viewport = getViewportSize();
  return {
    x: Math.max(8, Math.min(x, viewport.width - PET_WIDTH - 8)),
    y: Math.max(8, Math.min(y, viewport.height - PET_HEIGHT - 8)),
  };
}

function getViewportSize() {
  if (typeof window === 'undefined') return { width: 1280, height: 720 };
  const width = window.innerWidth || document.documentElement.clientWidth || 1280;
  const height = window.innerHeight || document.documentElement.clientHeight || 720;
  return { width, height };
}

function buildFrameStyle(frame: number): CSSProperties {
  const col = frame % PET_COLUMNS;
  const row = Math.floor(frame / PET_COLUMNS);
  return {
    backgroundImage: `url(${FEIBI_SPRITESHEET_SRC})`,
    backgroundSize: `${PET_COLUMNS * 100}% ${PET_ROWS * 100}%`,
    backgroundPosition: `${(col / (PET_COLUMNS - 1)) * 100}% ${(row / (PET_ROWS - 1)) * 100}%`,
  };
}

function tabLabel(tab: TabKey): string {
  return TAB_LABELS[tab] ?? tab;
}

function normalizeCommand(value: string): string {
  return value.trim().toLowerCase().replace(/[\s,，。.!！?？、:：；;]/g, '');
}

function hasAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword.toLowerCase().replace(/[\s,，。.!！?？、:：；;]/g, '')));
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

const FEIBI_STYLES = `
.feibi-teacher-root {
  position: relative;
  z-index: 10020;
}

.feibi-teacher-tooltip {
  position: fixed;
  z-index: 10022;
  border: 1px solid rgba(236, 201, 128, 0.38);
  border-radius: 999px;
  background: rgba(23, 20, 18, 0.82);
  color: #ffe8ad;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.05em;
  cursor: pointer;
  backdrop-filter: blur(16px);
  animation: feibi-float 3.2s ease-in-out infinite;
}

.feibi-teacher-toast {
  position: fixed;
  right: 26px;
  bottom: 224px;
  z-index: 10024;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(420px, calc(100vw - 32px));
  border: 1px solid rgba(236, 201, 128, 0.34);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(20, 18, 16, 0.94), rgba(57, 38, 25, 0.92));
  color: #fff4d4;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
  padding: 10px 12px 10px 16px;
  backdrop-filter: blur(18px);
  animation: feibi-toast-in 220ms ease-out;
}

.feibi-teacher-toast strong {
  color: #f5c66b;
  font-size: 13px;
}

.feibi-teacher-toast span {
  font-size: 13px;
  font-weight: 800;
}

.feibi-teacher-toast button,
.feibi-teacher-panel__header button,
.feibi-teacher-actions button,
.feibi-teacher-input button {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 900;
}

.feibi-teacher-toast button {
  background: rgba(255, 255, 255, 0.13);
  color: #fff1c9;
  padding: 8px 10px;
}

.feibi-teacher-panel {
  position: fixed;
  z-index: 10021;
  width: min(${PANEL_WIDTH}px, calc(100vw - 24px));
  height: min(${PANEL_HEIGHT}px, calc(100vh - 24px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(236, 201, 128, 0.28);
  border-radius: 30px;
  background:
    radial-gradient(circle at 78% 0%, rgba(236, 201, 128, 0.24), transparent 34%),
    linear-gradient(180deg, rgba(27, 24, 22, 0.94), rgba(8, 9, 11, 0.9));
  box-shadow: 0 30px 92px rgba(0, 0, 0, 0.42);
  color: #fff2d3;
  backdrop-filter: blur(22px);
  animation: feibi-panel-in 220ms ease-out;
}

.feibi-teacher-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(236, 201, 128, 0.16);
  background: linear-gradient(135deg, rgba(23, 19, 16, 0.96), rgba(76, 48, 28, 0.82));
}

.feibi-teacher-panel__header span,
.feibi-teacher-status-grid small {
  display: block;
  color: rgba(255, 231, 181, 0.64);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.feibi-teacher-panel__header strong {
  display: block;
  margin-top: 3px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 28px;
  line-height: 1;
}

.feibi-teacher-panel__header button {
  min-height: 34px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff2d3;
}

.feibi-teacher-status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(236, 201, 128, 0.12);
}

.feibi-teacher-status-grid article {
  min-width: 0;
  border: 1px solid rgba(236, 201, 128, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.07);
  padding: 10px 12px;
}

.feibi-teacher-status-grid small {
  color: rgba(255, 231, 181, 0.54);
  font-size: 9px;
}

.feibi-teacher-status-grid strong {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: #fff9ec;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feibi-teacher-context {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0 14px 12px;
}

.feibi-teacher-context span {
  border: 1px solid rgba(236, 201, 128, 0.14);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.18);
  color: rgba(255, 241, 205, 0.76);
  padding: 6px 9px;
  font-size: 11px;
  font-weight: 800;
}

.feibi-teacher-messages {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
}

.feibi-teacher-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.feibi-teacher-message--teacher {
  justify-content: flex-end;
}

.feibi-teacher-message__avatar {
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(245, 198, 107, 0.18);
  color: #f5c66b;
  padding: 6px 8px;
  font-size: 10px;
  font-weight: 900;
}

.feibi-teacher-message > div {
  max-width: 78%;
  border: 1px solid rgba(236, 201, 128, 0.14);
  border-radius: 18px 18px 18px 6px;
  background: rgba(255, 255, 255, 0.08);
  padding: 9px 11px;
}

.feibi-teacher-message--teacher > div {
  border-color: rgba(255, 239, 194, 0.2);
  border-radius: 18px 18px 6px 18px;
  background: rgba(245, 198, 107, 0.16);
}

.feibi-teacher-message p {
  margin: 0;
  color: #fff7e8;
  font-size: 13px;
  font-weight: 760;
  line-height: 1.45;
  white-space: pre-wrap;
}

.feibi-teacher-message time {
  display: block;
  margin-top: 4px;
  color: rgba(255, 231, 181, 0.42);
  font-size: 10px;
  font-weight: 800;
}

.feibi-teacher-thinking {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 48px;
}

.feibi-teacher-thinking i {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #f5c66b;
  animation: feibi-dot 880ms ease-in-out infinite;
}

.feibi-teacher-thinking i:nth-child(2) { animation-delay: 120ms; }
.feibi-teacher-thinking i:nth-child(3) { animation-delay: 240ms; }

.feibi-teacher-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid rgba(236, 201, 128, 0.12);
}

.feibi-teacher-actions button {
  background: rgba(255, 255, 255, 0.1);
  color: #fff0c7;
  padding: 9px 11px;
  font-size: 12px;
}

.feibi-teacher-actions button:first-child {
  background: linear-gradient(135deg, #f6c66c, #b87335);
  color: #21120a;
}

.feibi-teacher-actions button:disabled,
.feibi-teacher-input button:disabled,
.feibi-teacher-input input:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.feibi-teacher-input {
  display: flex;
  gap: 8px;
  padding: 0 14px 14px;
}

.feibi-teacher-input input {
  min-width: 0;
  flex: 1;
  border: 1px solid rgba(236, 201, 128, 0.18);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.22);
  color: #fff7e8;
  outline: 0;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 760;
}

.feibi-teacher-input input::placeholder {
  color: rgba(255, 230, 183, 0.45);
}

.feibi-teacher-input button {
  background: #f5c66b;
  color: #1b1208;
  padding: 0 15px;
}

.feibi-teacher-sprite {
  position: fixed;
  z-index: 10023;
  width: ${PET_WIDTH}px;
  height: ${PET_HEIGHT}px;
  user-select: none;
  touch-action: none;
  filter: drop-shadow(0 24px 28px rgba(0, 0, 0, 0.34));
  transition: filter 160ms ease, transform 160ms ease;
}

.feibi-teacher-sprite:hover,
.feibi-teacher-sprite:focus-visible {
  filter: drop-shadow(0 28px 34px rgba(0, 0, 0, 0.44));
  outline: none;
  transform: translateY(-3px);
}

.feibi-teacher-sprite__aura {
  position: absolute;
  inset: 28px 18px 8px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(245, 198, 107, 0.28), rgba(245, 198, 107, 0));
  animation: feibi-aura 2.8s ease-in-out infinite;
}

.feibi-teacher-sprite__frame {
  position: absolute;
  inset: 0;
  width: ${PET_WIDTH}px;
  height: ${PET_HEIGHT}px;
  background-repeat: no-repeat;
  image-rendering: auto;
}

.feibi-teacher-nameplate {
  position: absolute;
  left: 50%;
  bottom: -18px;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 160px;
  transform: translateX(-50%);
  border: 1px solid rgba(236, 201, 128, 0.32);
  border-radius: 999px;
  background: rgba(18, 15, 13, 0.86);
  color: #ffe8ad;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
  padding: 7px 10px;
  backdrop-filter: blur(12px);
}

.feibi-teacher-nameplate strong {
  color: #f5c66b;
  font-size: 12px;
  font-weight: 950;
}

.feibi-teacher-nameplate span {
  overflow: hidden;
  max-width: 84px;
  color: rgba(255, 241, 205, 0.8);
  font-size: 11px;
  font-weight: 820;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feibi-teacher-sprite--thinking .feibi-teacher-sprite__frame,
.feibi-teacher-sprite--running .feibi-teacher-sprite__frame {
  animation: feibi-bob 720ms ease-in-out infinite;
}

.feibi-teacher-sprite--celebrate .feibi-teacher-sprite__frame {
  animation: feibi-pop 640ms ease-in-out infinite;
}

@keyframes feibi-panel-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes feibi-toast-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes feibi-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@keyframes feibi-aura {
  0%, 100% { opacity: 0.72; transform: scale(0.96); }
  50% { opacity: 1; transform: scale(1.08); }
}

@keyframes feibi-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes feibi-pop {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  35% { transform: translateY(-7px) rotate(-3deg); }
  70% { transform: translateY(-2px) rotate(3deg); }
}

@keyframes feibi-dot {
  0%, 100% { opacity: 0.35; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-3px); }
}

@media (max-width: 720px) {
  .feibi-teacher-panel {
    left: 12px !important;
    top: 12px !important;
    width: calc(100vw - 24px);
    height: min(560px, calc(100vh - 24px));
  }

  .feibi-teacher-toast {
    right: 12px;
    bottom: 204px;
  }

  .feibi-teacher-status-grid {
    grid-template-columns: 1fr;
  }

  .feibi-teacher-message > div {
    max-width: 86%;
  }
}
`;
