import { useState } from 'react';
import type { GenerateResults, SupplementalVideoResource } from '../../types/resources';
import { buildLearningResourceSet } from '../../utils/learningResources';
import { AgentFlowViz } from '../AgentFlowViz';
import { ResultsPanel } from '../ResultsPanel';
import { buildClassroomFlow, type GenerateSelectionContext, type InteractiveClassroomJob } from './model';

interface Props {
  studentId: string;
  knowledgeId: string;
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
  submitting: boolean;
  generating: boolean;
  interactiveJob: InteractiveClassroomJob | null;
  results: GenerateResults | null;
  taskId: string | null;
  estimatedMastery?: number;
  evaluationFeedback?: string;
  pathFeedback?: string;
  canOpenProgress: boolean;
  onKnowledgeId: (value: string) => void;
  onKnowledgeName: (value: string) => void;
  onStart: () => void;
  onLightweightGenerate: () => void;
  onOpenProgress: () => void;
  onOpenTrainingPlan: () => void;
}

export function InteractiveClassroomStudio({
  studentId,
  knowledgeId,
  knowledgeName,
  selectionContext,
  submitting,
  generating,
  interactiveJob,
  results,
  taskId,
  estimatedMastery,
  evaluationFeedback,
  pathFeedback,
  canOpenProgress,
  onKnowledgeId,
  onKnowledgeName,
  onStart,
  onLightweightGenerate,
  onOpenProgress,
  onOpenTrainingPlan,
}: Props) {
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const flow = buildClassroomFlow({
    knowledgeName,
    interactiveJob,
    hasEvaluation: Boolean(evaluationFeedback),
  });
  const startLabel = submitting ? '创建中…' : generating ? '生成中…' : '生成课堂';
  const learningWindow = buildLearningWindowSource(interactiveJob, results, {
    knowledgeId,
    knowledgeName,
    studentId,
  });

  return (
    <div className="classroom-studio">
      <section className="classroom-studio__composer">
          <div className="classroom-studio__intro">
            <small>Interactive Classroom</small>
            <h2>OpenMAIC 课堂</h2>
          </div>
        <div className="classroom-studio__fields">
          <label>
            <span>知识点 ID</span>
            <input value={knowledgeId} onChange={(e) => onKnowledgeId(e.target.value)} />
          </label>
          <label>
            <span>知识点名称</span>
            <input value={knowledgeName} onChange={(e) => onKnowledgeName(e.target.value)} />
          </label>
          <div className="classroom-studio__actions">
            <button type="button" className="freddie-primary-button" onClick={onStart} disabled={submitting || generating}>
              {startLabel}
            </button>
            <button type="button" className="freddie-secondary-button" onClick={onLightweightGenerate} disabled={submitting || generating}>
              轻量资源
            </button>
          </div>
        </div>
        <div className="classroom-studio__meta">
          <span>Student · {studentId}</span>
          {selectionContext?.stage_title && <span>Stage · {selectionContext.stage_title}</span>}
          {estimatedMastery !== undefined && <span>掌握度 · {estimatedMastery}%</span>}
        </div>
      </section>

      <section className="classroom-learning-card">
        <div className="classroom-learning-card__head">
          <div>
            <small>Learning Window</small>
            <h3>{learningWindow.title}</h3>
          </div>
          <div className="classroom-learning-card__actions">
            <button
              type="button"
              className="freddie-secondary-button"
              disabled={!learningWindow.url}
              onClick={() => setPlayerExpanded(true)}
            >
              放大
            </button>
            <button type="button" className="freddie-primary-button" onClick={learningWindow.url ? onOpenTrainingPlan : onStart} disabled={submitting || generating}>
              {learningWindow.url ? '回培养方案' : startLabel}
            </button>
          </div>
        </div>

        <div className="classroom-learning-card__body">
          <div className="classroom-learning-frame">
            {learningWindow.url ? (
              <iframe
                title={learningWindow.title}
                src={learningWindow.url}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="classroom-learning-placeholder">
                <span className="classroom-learning-placeholder__play">▶</span>
                <strong>{knowledgeName}</strong>
                <p>生成课堂或轻量资源后，这里会直接出现可播放的小窗。</p>
              </div>
            )}
          </div>

          <aside className="classroom-learning-playlist">
            <span>当前焦点</span>
            <strong>{knowledgeName}</strong>
            <p>{selectionContext?.reason ? compactText(selectionContext.reason, 42) : '从探索地图或培养方案进入后，会带入推荐理由。'}</p>
            {learningWindow.video && (
              <a href={learningWindow.video.url} target="_blank" rel="noreferrer">
                B站原页
              </a>
            )}
          </aside>
        </div>
      </section>

      {playerExpanded && learningWindow.url && (
        <div className="classroom-learning-lightbox" role="dialog" aria-modal="true" aria-label={`${learningWindow.title} 放大播放`}>
          <section>
            <header>
              <strong>{learningWindow.title}</strong>
              <button type="button" onClick={() => setPlayerExpanded(false)}>关闭</button>
            </header>
            <iframe
              title={`${learningWindow.title} 放大播放`}
              src={learningWindow.url}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </section>
        </div>
      )}

      <section className="classroom-studio__flow">
        <div className="classroom-studio__section-title">
          <div>
            <small>Flow</small>
            <h3>多 Agent 流程</h3>
          </div>
        </div>
        <div className="classroom-flow-grid">
          {flow.map((step, index) => (
            <article key={step.id} className={`classroom-flow-step classroom-flow-step--${step.status}`}>
              <div className="classroom-flow-step__index">{index + 1}</div>
              <div className="classroom-flow-step__body">
                <div className="classroom-flow-step__head">
                  <strong>{step.title}</strong>
                  <span>{step.owner}</span>
                </div>
                <code>{step.endpoint}</code>
                <p>{compactText(step.summary, 18)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {interactiveJob && (
        <section className="classroom-runtime-card">
          <div className="classroom-runtime-card__head">
            <div>
              <small>Runtime Status</small>
              <h3>{knowledgeName}</h3>
              <p>{compactText(interactiveJob.message || '任务已提交', 26)}</p>
            </div>
            <span className={`freddie-classroom-status freddie-classroom-status--${interactiveJob.status}`}>
              {interactiveJob.status}
            </span>
          </div>
          <div className="classroom-runtime-card__meta">
            <span>Job · {interactiveJob.job_id}</span>
            <span>OpenMAIC · {interactiveJob.openmaic_job_id}</span>
            <span>Package · {interactiveJob.resource_package_id}</span>
          </div>
          {(evaluationFeedback || pathFeedback) && (
            <div className="classroom-runtime-card__feedback">
              <strong>回写反馈</strong>
              <span>{compactText(evaluationFeedback || pathFeedback || '', 20)}</span>
            </div>
          )}
          <div className="classroom-runtime-card__actions">
            <button
              type="button"
              className="freddie-primary-button"
              disabled={interactiveJob.status !== 'succeeded' || !interactiveJob.classroom_url}
              onClick={() => {
                if (interactiveJob.classroom_url) window.open(interactiveJob.classroom_url, '_blank', 'noopener,noreferrer');
              }}
            >
              打开课堂
            </button>
            <button type="button" className="freddie-secondary-button" onClick={onOpenTrainingPlan}>
              回培养方案页
            </button>
            <button
              type="button"
              className="freddie-secondary-button"
              disabled={!canOpenProgress}
              onClick={onOpenProgress}
            >
              看回写
            </button>
            <a href={interactiveJob.package_url} target="_blank" rel="noreferrer">资源 JSON</a>
          </div>
        </section>
      )}

      <div className="classroom-studio__results-grid">
        <section className="classroom-studio__results">
          <div className="classroom-studio__section-title">
            <div>
              <small>Support Pack</small>
              <h3>轻量资源</h3>
            </div>
          </div>
          <ResultsPanel
            results={results}
            loading={Boolean(taskId && generating)}
            knowledgeId={knowledgeId}
            knowledgeName={knowledgeName}
            studentId={studentId}
          />
        </section>

        <section className="classroom-studio__trace">
          <div className="classroom-studio__section-title">
            <div>
              <small>Agent Trace</small>
              <h3>Agent 轨迹</h3>
            </div>
          </div>
          <div className="classroom-trace-frame">
            <AgentFlowViz taskId={taskId} />
          </div>
        </section>
      </div>
    </div>
  );
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function buildLearningWindowSource(
  interactiveJob: InteractiveClassroomJob | null,
  results: GenerateResults | null,
  current: { knowledgeId: string; knowledgeName: string; studentId: string },
): { title: string; url: string; video: SupplementalVideoResource | null } {
  if (interactiveJob?.classroom_url) {
    return {
      title: `${current.knowledgeName} · 互动课堂`,
      url: interactiveJob.classroom_url,
      video: null,
    };
  }
  const supplemental = results?.supplemental ?? buildLearningResourceSet(current);
  const video = supplemental.videos.find((item) => resolveBilibiliEmbedUrl(item)) ?? null;
  if (video) {
    return {
      title: video.title,
      url: resolveBilibiliEmbedUrl(video),
      video,
    };
  }
  return {
    title: `${current.knowledgeName} · 学习小窗`,
    url: '',
    video: null,
  };
}

function resolveBilibiliEmbedUrl(video: SupplementalVideoResource): string {
  if (video.embed_url) return video.embed_url;
  if (!video.bvid) return '';
  const page = video.page && video.page > 1 ? video.page : 1;
  return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(video.bvid)}&page=${page}&as_wide=1&high_quality=1&danmaku=0&autoplay=0`;
}
