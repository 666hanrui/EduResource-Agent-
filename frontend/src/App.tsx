/**
 * 演示页：杀手锏一（Agent 协作时序）+ 杀手锏二（资源溯源）。
 *
 * 流程：
 * 1. 用户填写"目标知识点 / 学生 ID"，点 "开始生成"
 * 2. 前端 POST /api/generate 拿到 task_id —— 后端串起 Profile→Planner→并行三件套→Code→Evaluation
 * 3. <AgentTracePanel> 通过 SSE 实时看 7 行 Agent
 * 4. 看到 task.summary 时，前端拉 /api/tasks/{id}/results 把 ResultsPanel 渲染出来
 * 5. ResultsPanel 每张卡片右上"为什么"按钮唤出 RationalePanel —— 杀手锏二
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AgentTracePanel } from './components/AgentTracePanel';
import { MajorExplorationPanel } from './components/MajorExplorationPanel';
import { ResultsPanel } from './components/ResultsPanel';
import type { RecommendedKnowledge } from './types/exploration';
import type { GenerateResults } from './types/resources';

interface GenerateResponse {
  task_id: string;
}

export function App() {
  const [activeModule, setActiveModule] = useState<'exploration' | 'generator'>('exploration');
  const [knowledgeName, setKnowledgeName] = useState('链表');
  const [knowledgeId, setKnowledgeId] = useState('linked-list-basics');
  const [studentId, setStudentId] = useState('stu_001');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [results, setResults] = useState<GenerateResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);

  // 轮询 /results 直到拿到 —— 因为后端是任务结束后才落到内存
  const pollHandle = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollHandle.current !== null) window.clearInterval(pollHandle.current);
  }, []);

  const handleStart = async () => {
    setError(null);
    setResults(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          knowledge_id: knowledgeId,
          knowledge_name: knowledgeName,
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

  const handleUseKnowledge = (item: RecommendedKnowledge) => {
    setKnowledgeId(item.knowledge_id);
    setKnowledgeName(item.knowledge_name);
    setActiveModule('generator');
  };

  const startPolling = (id: string) => {
    if (pollHandle.current !== null) window.clearInterval(pollHandle.current);
    pollHandle.current = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/tasks/${id}/results`);
        if (r.status === 404) return; // 还没结束，继续等
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

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#f5f5f5',
      }}
    >
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ padding: '20px 24px 12px' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>EduResource Agent</h1>
          <p style={{ color: '#666', margin: '4px 0 0', fontSize: 13 }}>
            从专业探索开始，逐步收敛兴趣方向，再用多 Agent 生成个性化学习资源。
          </p>
        </header>

        <nav style={tabBarStyle}>
          <button
            onClick={() => setActiveModule('exploration')}
            style={activeModule === 'exploration' ? activeTabStyle : tabStyle}
          >
            专业探索
          </button>
          <button
            onClick={() => setActiveModule('generator')}
            style={activeModule === 'generator' ? activeTabStyle : tabStyle}
          >
            资源生成
          </button>
        </nav>

        {activeModule === 'generator' && (
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto 1fr auto 1fr auto',
              alignItems: 'center',
              gap: 8,
              padding: '0 24px 12px',
            }}
          >
            <label style={labelStyle}>知识点 ID</label>
            <input
              value={knowledgeId}
              onChange={(e) => setKnowledgeId(e.target.value)}
              style={INPUT_STYLE}
            />
            <label style={labelStyle}>名称</label>
            <input
              value={knowledgeName}
              onChange={(e) => setKnowledgeName(e.target.value)}
              style={INPUT_STYLE}
            />
            <label style={labelStyle}>学生 ID</label>
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              style={INPUT_STYLE}
            />
            <button
              onClick={handleStart}
              disabled={submitting || generating}
              style={{
                padding: '8px 20px',
                fontSize: 14,
                border: 'none',
                borderRadius: 6,
                backgroundColor: submitting || generating ? '#a0c4ff' : '#1677ff',
                color: '#fff',
                cursor: submitting || generating ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {submitting ? '提交中...' : generating ? '生成中...' : '开始生成'}
            </button>
          </section>
        )}

        {error && (
          <div
            style={{
              margin: '0 24px 8px',
              padding: 8,
              borderRadius: 6,
              backgroundColor: '#fff1f0',
              color: '#cf1322',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeModule === 'exploration' ? (
            <MajorExplorationPanel studentId={studentId} onUseKnowledge={handleUseKnowledge} />
          ) : (
            <ResultsPanel results={results} loading={generating} />
          )}
        </div>
      </main>

      <AgentTracePanel
        taskId={taskId}
        title={taskId ? `${knowledgeName} · ${studentId}` : '未启动任务'}
      />
    </div>
  );
}

const INPUT_STYLE: CSSProperties = {
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid #d9d9d9',
  borderRadius: 4,
  minWidth: 0,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: '#555',
  whiteSpace: 'nowrap',
};

const tabBarStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '0 24px 12px',
};

const tabStyle: CSSProperties = {
  padding: '7px 12px',
  border: '1px solid #d9d9d9',
  borderRadius: 6,
  background: '#fff',
  color: '#4b5563',
  cursor: 'pointer',
};

const activeTabStyle: CSSProperties = {
  ...tabStyle,
  borderColor: '#256f6c',
  background: '#e6f4f1',
  color: '#174c49',
  fontWeight: 700,
};
