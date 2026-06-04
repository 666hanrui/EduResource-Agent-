/**
 * Freddie Workshop App shell.
 *
 * 这版不再把 Freddie 当作单纯皮肤，而是把整个演示页重组为：
 * - warm yellow hero / hand-drawn brand moment
 * - rounded black-outline controls
 * - content workshop canvas
 * - right-side Agent theatre
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AgentFlowViz } from './components/AgentFlowViz';
import { CoachWorkbenchPanel } from './components/CoachWorkbenchPanel';
import { MajorExplorationPanel } from './components/MajorExplorationPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { TutorFloatingBall } from './components/TutorFloatingBall';
import type { RecommendedKnowledge } from './types/exploration';
import type { GenerateResults } from './types/resources';

interface GenerateResponse {
  task_id: string;
}

interface DigitalHumanAction {
  action_id: string;
  title: string;
  domain: string;
  success_feedback: string;
}

interface KnowledgeShortcut {
  knowledge_id: string;
  knowledge_name: string;
  keywords: string[];
  description: string;
}

interface GenerateSelectionContext {
  source: 'manual' | 'exploration' | 'coach' | 'digital_human';
  reason: string;
  suggested_difficulty?: number;
}

/** 后端 /api/digital-human/knowledge-shortcuts 加载失败时的本地兜底 */
const FALLBACK_KNOWLEDGE_SHORTCUTS: KnowledgeShortcut[] = [
  { knowledge_id: 'linked-list-basics', knowledge_name: '链表', keywords: ['链表', 'linked list', 'linkedlist'], description: '' },
  { knowledge_id: 'binary-tree-traversal', knowledge_name: '二叉树遍历', keywords: ['二叉树', 'binary tree', 'binarytree', '树遍历'], description: '' },
  { knowledge_id: 'sorting-algorithms', knowledge_name: '排序算法', keywords: ['排序', 'sort', 'bubble sort', 'quick sort'], description: '' },
  { knowledge_id: 'dynamic-programming', knowledge_name: '动态规划', keywords: ['动态规划', 'dp', 'dynamic programming'], description: '' },
  { knowledge_id: 'graph-algorithms', knowledge_name: '图算法', keywords: ['图', 'graph', 'bfs', 'dfs'], description: '' },
  { knowledge_id: 'stack-queue', knowledge_name: '栈与队列', keywords: ['栈', '队列', 'stack', 'queue'], description: '' },
  { knowledge_id: 'hash-table', knowledge_name: '哈希表', keywords: ['哈希', 'hash', '哈希表', 'map'], description: '' },
  { knowledge_id: 'binary-search', knowledge_name: '二分查找', keywords: ['二分', 'binary search', '二分查找'], description: '' },
];

const FREDDIE = {
  yellow: '#FFE01B',
  ink: '#241C15',
  cream: '#FBEFE3',
  paper: '#FFFDF6',
  muted: '#88837C',
  coral: '#FF4D74',
  shadow: '8px 8px 0 #241C15',
};

type ActiveModule = 'exploration' | 'generator' | 'coach';

export function App() {
  const [activeModule, setActiveModule] = useState<ActiveModule>('exploration');
  const [knowledgeName, setKnowledgeName] = useState('链表');
  const [knowledgeId, setKnowledgeId] = useState('linked-list-basics');
  const [studentId, setStudentId] = useState('stu_001');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [results, setResults] = useState<GenerateResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [knowledgeShortcuts, setKnowledgeShortcuts] = useState<KnowledgeShortcut[]>([]);
  const [digitalHumanActions, setDigitalHumanActions] = useState<DigitalHumanAction[]>([]);
  const [selectionContext, setSelectionContext] = useState<GenerateSelectionContext | null>(null);

  const pollHandle = useRef<number | null>(null);

  // 清理轮询
  useEffect(() => () => {
    if (pollHandle.current !== null) window.clearInterval(pollHandle.current);
  }, []);

  // 启动时从后端拉取知识点快捷入口列表（单一真相来源）
  useEffect(() => {
    fetch('/api/digital-human/actions')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: DigitalHumanAction[]) => setDigitalHumanActions(data))
      .catch(() => setDigitalHumanActions([]));

    fetch('/api/digital-human/knowledge-shortcuts')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: KnowledgeShortcut[]) => setKnowledgeShortcuts(data))
      .catch(() => setKnowledgeShortcuts(FALLBACK_KNOWLEDGE_SHORTCUTS));
  }, []);

  const actionById = (actionId: string) => digitalHumanActions.find((action) => action.action_id === actionId);
  const canUseAction = (actionId: string) => digitalHumanActions.length === 0 || Boolean(actionById(actionId));
  const actionFeedback = (actionId: string, fallback: string) => actionById(actionId)?.success_feedback ?? fallback;

  const handleStart = async (overrides?: { knowledgeId?: string; knowledgeName?: string; selectionContext?: GenerateSelectionContext | null }) => {
    const selectedKnowledgeId = overrides?.knowledgeId ?? knowledgeId;
    const selectedKnowledgeName = overrides?.knowledgeName ?? knowledgeName;
    const activeSelectionContext = overrides?.selectionContext ?? selectionContext;

    setError(null);
    setResults(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          knowledge_id: selectedKnowledgeId,
          knowledge_name: selectedKnowledgeName,
          conversation: [],
          selection_context: activeSelectionContext,
          exercise_count: 5,
          languages: ['python', 'java'],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data = (await res.json()) as GenerateResponse;
      setTaskId(data.task_id);
      setGenerating(true);
      startPolling(data.task_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  /** 从专业探索模块选择知识点后跳转到资源生成 */
  const handleUseKnowledge = (item: RecommendedKnowledge) => {
    setSelectionContext({
      source: 'exploration',
      reason: item.reason,
      suggested_difficulty: item.suggested_difficulty,
    });
    setKnowledgeId(item.knowledge_id);
    setKnowledgeName(item.knowledge_name);
    setActiveModule('generator');
  };

  /** CoachWorkbench 内点击"开始生成"后触发 */
  const handleCoachStartGeneration = () => {
    setActiveModule('generator');
    if (!submitting && !generating) {
      void handleStart();
    }
  };

  /** 数字人悬浮球指令处理 —— 动态感知当前知识点，不再硬编码 */
  const handleTutorCommand = async (text: string): Promise<string | null> => {
    const command = text.trim().toLowerCase();
    const wantsNavigation =
      command.includes('打开') ||
      command.includes('进入') ||
      command.includes('切到') ||
      command.includes('切换') ||
      command.includes('去');
    const wantsGeneration =
      command.includes('开始生成') ||
      command.includes('生成学习资源') ||
      command.includes('生成资源');

    // ── 模块导航 ──
    if (
      command === '打开专业探索' ||
      ((command.includes('专业探索') || command.includes('探索工作台')) && wantsNavigation)
    ) {
      if (!canUseAction('nav.open_exploration')) return '后端动作注册表还没有登记「打开专业探索」。';
      setActiveModule('exploration');
      return actionFeedback('nav.open_exploration', '已打开专业探索工作台。');
    }

    if (
      command === '打开资源生成' ||
      ((command.includes('资源生成') || command.includes('生成页')) && wantsNavigation)
    ) {
      if (!canUseAction('nav.open_generator')) return '后端动作注册表还没有登记「打开资源生成」。';
      setActiveModule('generator');
      return `${actionFeedback('nav.open_generator', '已打开资源生成页。')}当前知识点是「${knowledgeName}」。`;
    }

    if (
      command === '打开工作台' ||
      command === '打开ai工作台' ||
      ((command.includes('工作台') || command.includes('coach')) && wantsNavigation)
    ) {
      if (!canUseAction('nav.open_coach')) return '后端动作注册表还没有登记「打开 AI 工作台」。';
      setActiveModule('coach');
      return actionFeedback('nav.open_coach', '已打开 AI 工作台。');
    }

    // ── 动态知识点识别：先检查当前知识点名称，再检查常见知识点关键词 ──
    const currentKnowledgeLower = knowledgeName.toLowerCase();
    const mentionsCurrent = command.includes(currentKnowledgeLower) || command.includes(knowledgeId.toLowerCase());

    // 已知知识点快捷入口 —— 来自后端 /api/digital-human/knowledge-shortcuts，降级用本地 fallback
    const KNOWN_KNOWLEDGE = knowledgeShortcuts.length > 0 ? knowledgeShortcuts : FALLBACK_KNOWLEDGE_SHORTCUTS;

    // 当前知识点触发
    if (mentionsCurrent && (wantsNavigation || wantsGeneration)) {
      if (!canUseAction(wantsGeneration ? 'generation.start' : 'nav.open_generator')) {
        return wantsGeneration ? '后端动作注册表还没有登记「启动资源生成」。' : '后端动作注册表还没有登记「打开资源生成」。';
      }
      setActiveModule('generator');
      if (wantsGeneration) {
        if (submitting || generating) return '这一轮已经在跑了，右侧可以看到 Agent 剧场的实时进度。';
        void handleStart();
        return `已为当前知识点「${knowledgeName}」启动资源生成。`;
      }
      return `已切到「${knowledgeName}」资源生成。`;
    }

    // 已知知识点关键词匹配（knowledge_id / knowledge_name 字段来自后端 KnowledgeShortcut）
    for (const kw of KNOWN_KNOWLEDGE) {
      const id = kw.knowledge_id;
      const name = kw.knowledge_name;
      if (kw.keywords.some((k) => command.includes(k)) && (wantsNavigation || wantsGeneration)) {
        if (!canUseAction(wantsGeneration ? 'generation.start' : 'nav.open_generator')) {
          return wantsGeneration ? '后端动作注册表还没有登记「启动资源生成」。' : '后端动作注册表还没有登记「打开资源生成」。';
        }
        const nextSelectionContext: GenerateSelectionContext = {
          source: 'digital_human',
          reason: `数字人指令命中「${name}」：${kw.description || kw.keywords[0]}`,
        };
        setKnowledgeId(id);
        setKnowledgeName(name);
        setSelectionContext(nextSelectionContext);
        setActiveModule('generator');
        if (wantsGeneration) {
          if (submitting || generating) return '这一轮已经在跑了，右侧可以看到 Agent 剧场的实时进度。';
          void handleStart({ knowledgeId: id, knowledgeName: name, selectionContext: nextSelectionContext });
          return `已切到「${name}」，并启动资源生成。`;
        }
        return `已切到「${name}」资源生成。`;
      }
    }

    // ── 直接触发生成（不指定知识点）──
    if (wantsGeneration) {
      if (!canUseAction('generation.start')) return '后端动作注册表还没有登记「启动资源生成」。';
      setActiveModule('generator');
      if (submitting || generating) return '这一轮已经在跑了，右侧可以看到 Agent 剧场的实时进度。';
      void handleStart();
      return `已为「${knowledgeName}」启动多 Agent 资源生成。`;
    }

    // ── 查询数字人能力 ──
    if (command.includes('能做什么') || command.includes('可以操作') || command.includes('操作')) {
      let actions = digitalHumanActions;
      if (actions.length === 0) {
        const res = await fetch('/api/digital-human/actions');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        actions = (await res.json()) as DigitalHumanAction[];
        setDigitalHumanActions(actions);
      }
      const domains = Array.from(new Set(actions.map((action) => action.domain)));
      return `我现在登记了 ${actions.length} 类动作，覆盖 ${domains.join('、')}。已接入：模块切换、知识点切换、生成启动、工作台控制。`;
    }

    return null;
  };

  const startPolling = (id: string) => {
    if (pollHandle.current !== null) window.clearInterval(pollHandle.current);
    pollHandle.current = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/tasks/${id}/results`);
        if (r.status === 404) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as GenerateResults;
        setResults(data);
        setGenerating(false);
        if (pollHandle.current !== null) {
          window.clearInterval(pollHandle.current);
          pollHandle.current = null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        if (pollHandle.current !== null) {
          window.clearInterval(pollHandle.current);
          pollHandle.current = null;
        }
        setGenerating(false);
      }
    }, 1500);
  };

  const startLabel = submitting ? '正在递交…' : generating ? 'Agent 生成中…' : '开始生成';

  return (
    <div className="freddie-app-shell">
      <main className="freddie-main-stage">
        <header className="freddie-hero">
          <div className="freddie-hero-copy">
            <span className="freddie-eyebrow">EduResource Agent / Warm Humanist Demo</span>
            <h1>把专业探索和学习资源生成，做成一个会说话的创作工作台。</h1>
            <p>
              从兴趣线索出发，先帮学生找到方向；再让多 Agent 把讲解、题目、代码、可视化和评估一次性编排出来。
            </p>
          </div>
          <div className="freddie-mascot-card" aria-hidden="true">
            <div className="freddie-mascot-face" />
            <strong>7 个 Agent</strong>
            <span>不是黑盒，是排队干活。</span>
          </div>
        </header>

        <section className="freddie-mode-strip" aria-label="模块切换">
          <button
            onClick={() => setActiveModule('exploration')}
            className={activeModule === 'exploration' ? 'freddie-tab freddie-tab-active' : 'freddie-tab'}
          >
            专业探索
          </button>
          <button
            onClick={() => setActiveModule('generator')}
            className={activeModule === 'generator' ? 'freddie-tab freddie-tab-active' : 'freddie-tab'}
          >
            资源生成
          </button>
          <button
            onClick={() => setActiveModule('coach')}
            className={activeModule === 'coach' ? 'freddie-tab freddie-tab-active' : 'freddie-tab'}
          >
            AI 工作台
          </button>
          <div className="freddie-status-note">
            {activeModule === 'exploration'
              ? '先选方向，再开工。'
              : activeModule === 'coach'
                ? `工作台 · ${knowledgeName}${taskId ? ' · 任务已绑定' : ''}`
                : taskId
                  ? `当前任务：${knowledgeName} · ${studentId}`
                  : '选择知识点，启动 Agent。'}
          </div>
        </section>

        {activeModule === 'generator' && (
          <section className="freddie-generator-band">
            <div style={fieldStyle}>
              <label style={labelStyle}>知识点 ID</label>
              <input
                value={knowledgeId}
                onChange={(e) => {
                  setKnowledgeId(e.target.value);
                  setSelectionContext(null);
                }}
                style={INPUT_STYLE}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>名称</label>
              <input
                value={knowledgeName}
                onChange={(e) => {
                  setKnowledgeName(e.target.value);
                  setSelectionContext(null);
                }}
                style={INPUT_STYLE}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>学生 ID</label>
              <input value={studentId} onChange={(e) => setStudentId(e.target.value)} style={INPUT_STYLE} />
            </div>
            <button
              onClick={() => void handleStart()}
              disabled={submitting || generating}
              className="freddie-primary-button"
            >
              {startLabel}
            </button>
            {selectionContext && (
              <div style={contextStyle}>
                <strong>选择理由</strong>
                <span>
                  {selectionContext.reason}
                  {selectionContext.suggested_difficulty ? ` · 建议难度 ${selectionContext.suggested_difficulty}` : ''}
                </span>
              </div>
            )}
          </section>
        )}

        {error && <div className="freddie-error-card">生成链路出错：{error}</div>}

        <div className="freddie-content-scroll">
          {activeModule === 'exploration' ? (
            <MajorExplorationPanel studentId={studentId} onUseKnowledge={handleUseKnowledge} />
          ) : activeModule === 'coach' ? (
            <CoachWorkbenchPanel
              sourcePage="generator"
              activeTaskId={taskId}
              knowledgeName={knowledgeName}
              onStartGeneration={handleCoachStartGeneration}
              disabled={submitting || generating}
            />
          ) : (
            <ResultsPanel results={results} loading={generating} />
          )}
        </div>
      </main>

      {/* Agent Flow 可视化面板（右侧）*/}
      <aside style={{
        position: 'relative',
        zIndex: 1,
        width: 460,
        height: 'calc(100vh - 36px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        <AgentFlowViz taskId={taskId} />
      </aside>
      <TutorFloatingBall onCommand={handleTutorCommand} />
    </div>
  );
}

const INPUT_STYLE: CSSProperties = {
  padding: '10px 12px',
  fontSize: 14,
  border: `2px solid ${FREDDIE.ink}`,
  borderRadius: 16,
  minWidth: 0,
  background: '#fffaf0',
  color: FREDDIE.ink,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  color: FREDDIE.ink,
  whiteSpace: 'nowrap',
  fontWeight: 900,
  letterSpacing: '0.04em',
};

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
};

const contextStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  minWidth: 220,
  maxWidth: 360,
  padding: '9px 12px',
  border: `2px dashed ${FREDDIE.ink}`,
  borderRadius: 12,
  background: FREDDIE.paper,
  color: FREDDIE.ink,
  fontSize: 12,
  lineHeight: 1.35,
};
