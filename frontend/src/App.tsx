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
import { AgentTracePanel } from './components/AgentTracePanel';
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
}

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

  const pollHandle = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollHandle.current !== null) window.clearInterval(pollHandle.current);
  }, []);

  const handleStart = async (overrides?: { knowledgeId?: string; knowledgeName?: string }) => {
    const selectedKnowledgeId = overrides?.knowledgeId ?? knowledgeId;
    const selectedKnowledgeName = overrides?.knowledgeName ?? knowledgeName;

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
      setActiveModule('exploration');
      return '已打开专业探索工作台。先把兴趣、基础和时间填进去，我会帮你把方向收窄到可行动的路线。';
    }

    if (
      command === '打开资源生成' ||
      ((command.includes('资源生成') || command.includes('生成页')) && wantsNavigation)
    ) {
      setActiveModule('generator');
      return `已打开资源生成页。当前知识点是「${knowledgeName}」，可以直接启动多 Agent 生成。`;
    }

    if (
      command === '打开工作台' ||
      command === '打开ai工作台' ||
      ((command.includes('工作台') || command.includes('coach')) && wantsNavigation)
    ) {
      setActiveModule('coach');
      return `已打开 AI 工作台。可以用自然语言或 slash 技能来操控多 Agent 系统。`;
    }

    // ── 动态知识点识别：先检查当前知识点名称，再检查常见知识点关键词 ──
    const currentKnowledgeLower = knowledgeName.toLowerCase();
    const mentionsCurrent = command.includes(currentKnowledgeLower) || command.includes(knowledgeId.toLowerCase());

    // 已知知识点快捷入口（可扩展）
    const KNOWN_KNOWLEDGE: Array<{ keywords: string[]; id: string; name: string }> = [
      { keywords: ['链表', 'linked list', 'linkedlist'], id: 'linked-list-basics', name: '链表' },
      { keywords: ['二叉树', 'binary tree', 'binarytree', '树遍历'], id: 'binary-tree-traversal', name: '二叉树遍历' },
      { keywords: ['排序', 'sort', 'bubble sort', 'quick sort'], id: 'sorting-algorithms', name: '排序算法' },
      { keywords: ['动态规划', 'dp', 'dynamic programming'], id: 'dynamic-programming', name: '动态规划' },
      { keywords: ['图', 'graph', 'bfs', 'dfs'], id: 'graph-algorithms', name: '图算法' },
    ];

    // 当前知识点触发
    if (mentionsCurrent && (wantsNavigation || wantsGeneration)) {
      setActiveModule('generator');
      if (wantsGeneration) {
        if (submitting || generating) return '这一轮已经在跑了，右侧可以看到 Agent 剧场的实时进度。';
        void handleStart();
        return `已为当前知识点「${knowledgeName}」启动资源生成。`;
      }
      return `已切到「${knowledgeName}」资源生成。`;
    }

    // 已知知识点关键词匹配
    for (const kw of KNOWN_KNOWLEDGE) {
      if (kw.keywords.some((k) => command.includes(k)) && (wantsNavigation || wantsGeneration)) {
        setKnowledgeId(kw.id);
        setKnowledgeName(kw.name);
        setActiveModule('generator');
        if (wantsGeneration) {
          if (submitting || generating) return '这一轮已经在跑了，右侧可以看到 Agent 剧场的实时进度。';
          void handleStart({ knowledgeId: kw.id, knowledgeName: kw.name });
          return `已切到「${kw.name}」，并启动资源生成。`;
        }
        return `已切到「${kw.name}」资源生成。`;
      }
    }

    // ── 直接触发生成（不指定知识点）──
    if (wantsGeneration) {
      setActiveModule('generator');
      if (submitting || generating) return '这一轮已经在跑了，右侧可以看到 Agent 剧场的实时进度。';
      void handleStart();
      return `已为「${knowledgeName}」启动多 Agent 资源生成。`;
    }

    // ── 查询数字人能力 ──
    if (command.includes('能做什么') || command.includes('可以操作') || command.includes('操作')) {
      const res = await fetch('/api/digital-human/actions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const actions = (await res.json()) as DigitalHumanAction[];
      const domains = Array.from(new Set(actions.map((action) => action.domain)));
      return `我现在登记了 ${actions.length} 类动作，覆盖 ${domains.join('、')}。已接入：模块切换、知识点切换（动态识别）、生成启动、工作台控制。`;
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
              <input value={knowledgeId} onChange={(e) => setKnowledgeId(e.target.value)} style={INPUT_STYLE} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>名称</label>
              <input value={knowledgeName} onChange={(e) => setKnowledgeName(e.target.value)} style={INPUT_STYLE} />
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

      <AgentTracePanel taskId={taskId} title={taskId ? `${knowledgeName} · ${studentId}` : '还没开工'} />
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
