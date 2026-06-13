import { useState } from 'react';
import type { StudentDashboard } from './model';
import './learning-path-step-board.css';

type LearningPathStep = NonNullable<StudentDashboard['learning_path']>['steps'][number];

type StepStatus = 'pending' | 'in_progress' | 'done' | 'adjusted';

type StepPatch = {
  status?: StepStatus;
  evidence?: string;
  mastery_after?: number;
  updated_reason?: string;
};

interface Props {
  studentDashboard: StudentDashboard | null;
  onUpdateStep?: (stepId: string, payload: StepPatch) => Promise<void>;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待开始',
  in_progress: '学习中',
  done: '已完成',
  adjusted: '已调整',
};

export function LearningPathStepBoard({ studentDashboard, onUpdateStep }: Props) {
  const [updatingStepId, setUpdatingStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshHint, setRefreshHint] = useState('');
  const [localPatches, setLocalPatches] = useState<Record<string, Partial<LearningPathStep>>>({});
  const path = studentDashboard?.learning_path;
  const steps = (path?.steps ?? []).map((step) => {
    const patch = step.step_id ? localPatches[step.step_id] : undefined;
    return patch ? { ...step, ...patch } : step;
  });
  const adjustmentHistory = path?.adjustment_history ?? [];
  const studentId = studentDashboard?.profile?.student_id ?? 'stu_001';

  const updateStep = async (step: LearningPathStep, status: StepStatus) => {
    if (!step.step_id) return;
    setError(null);
    setRefreshHint('');
    setUpdatingStepId(step.step_id);
    try {
      const patch = buildStepPatch(step, status);
      if (onUpdateStep) {
        await onUpdateStep(step.step_id, patch);
      } else {
        const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/learning-path/steps/${encodeURIComponent(step.step_id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      setLocalPatches((current) => ({
        ...current,
        [step.step_id as string]: {
          status: patch.status,
          evidence: patch.evidence,
          mastery_after: patch.mastery_after,
          updated_reason: patch.updated_reason,
        },
      }));
      setRefreshHint('路径已写回并完成本地更新。刷新 dashboard 后可看到后端最新 adjustment_history。');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingStepId(null);
    }
  };

  return (
    <section className="student-stage-card">
      <div className="student-stage-card__header">
        <div>
          <small>Persisted LearningPath</small>
          <h3>真实路径步骤</h3>
          <p>这里读取后端落库的 LearningPathStep。操作会 PATCH 写回，并追加 adjustment_history。</p>
        </div>
        <p>{path?.title ?? '暂无路径标题'}</p>
      </div>

      {error && <p className="student-context-empty">路径更新失败：{error}</p>}
      {refreshHint && <p className="student-context-empty">{refreshHint}</p>}

      <div className="training-path-step-grid">
        {steps.length > 0 ? (
          steps.map((step, index) => {
            const status = step.status ?? 'pending';
            const disabled = updatingStepId === step.step_id;
            return (
              <article key={step.step_id ?? `${step.target_knowledge_id}-${index}`} className={`training-path-step training-path-step--${status}`}>
                <div className="training-path-step__top">
                  <span>#{index + 1}</span>
                  <strong>{step.title ?? step.target_knowledge_id ?? `路径步骤 ${index + 1}`}</strong>
                  <em>{STATUS_LABELS[status] ?? status}</em>
                </div>
                <p>{step.updated_reason || '等待探索、课堂或评估回写。'}</p>
                <div className="training-validation-meta">
                  <span>{step.target_knowledge_id ?? 'unknown knowledge'}</span>
                  {step.package_id && <span>package {step.package_id}</span>}
                  {step.evaluation_id && <span>evaluation {step.evaluation_id}</span>}
                  <span>{step.mastery_before ?? 0} → {step.mastery_after ?? 0}</span>
                </div>
                {step.evidence && <p>{step.evidence}</p>}
                <div className="training-path-step__actions">
                  <button type="button" className="freddie-secondary-button" disabled={disabled || !step.step_id} onClick={() => updateStep(step, 'in_progress')}>开始学习</button>
                  <button type="button" className="freddie-secondary-button" disabled={disabled || !step.step_id} onClick={() => updateStep(step, 'done')}>标记完成</button>
                  <button type="button" className="freddie-secondary-button" disabled={disabled || !step.step_id} onClick={() => updateStep(step, 'adjusted')}>需要调整</button>
                </div>
              </article>
            );
          })
        ) : (
          <p className="student-context-empty">暂无真实路径步骤。先完成一次专业探索，系统会把推荐知识点写入 LearningPath。</p>
        )}
      </div>

      {adjustmentHistory.length > 0 && (
        <div className="training-path-history">
          <strong>最近路径调整</strong>
          <div className="training-stage-list">
            {adjustmentHistory.slice(-3).reverse().map((item, index) => (
              <article key={`${String(item.step_id ?? item.session_id ?? 'history')}-${index}`}>
                <strong>{String(item.reason ?? item.source ?? '路径调整')}</strong>
                <span>{String(item.created_at ?? '')}</span>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function buildStepPatch(step: LearningPathStep, status: StepStatus): StepPatch {
  if (status === 'done') {
    return {
      status,
      mastery_after: Math.max(step.mastery_after ?? 0, 80),
      evidence: '学生在培养方案页手动标记完成。',
      updated_reason: '学生手动完成路径步骤',
    };
  }
  if (status === 'in_progress') {
    return {
      status,
      mastery_after: step.mastery_after,
      evidence: '学生在培养方案页开始推进该步骤。',
      updated_reason: '学生开始学习该路径步骤',
    };
  }
  if (status === 'adjusted') {
    return {
      status,
      mastery_after: step.mastery_after,
      evidence: '学生认为该步骤需要调整。',
      updated_reason: '学生请求调整该路径步骤',
    };
  }
  return {
    status,
    mastery_after: step.mastery_after,
    evidence: '学生将步骤重置为待开始。',
    updated_reason: '学生重置路径步骤状态',
  };
}
