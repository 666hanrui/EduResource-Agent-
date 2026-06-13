import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AGENTS } from './model';
import type {
  ClassProfile,
  ReviewItem,
  RunState,
  Student,
  TeacherIndustryCourseReport,
  TeacherIndustrySummary,
} from './model';
import type {
  TeacherArtifact,
  TeacherArtifactLibrary,
  TeacherArtifactType,
} from './artifacts';
import { compactText, summarizeSection } from './utils';

const PLAN_MODULES: Array<{ type: TeacherArtifactType; label: string }> = [
  { type: 'TalentPlan', label: '人培方案' },
  { type: 'Syllabus', label: '大纲' },
  { type: 'LessonPlan', label: '教案' },
  { type: 'SlideDeck', label: 'PPT' },
  { type: 'KeyFocus', label: '重难点' },
];

const CURRICULUM_RESOURCE_MODULES: Array<{ type: TeacherArtifactType; label: string; role: string }> = [
  { type: 'Syllabus', label: '教学大纲', role: '课程结构' },
  { type: 'LessonPlan', label: '教案', role: '课堂设计' },
  { type: 'SlideDeck', label: 'PPT', role: '投屏页稿' },
  { type: 'KeyFocus', label: '重难点', role: '讲法提醒' },
];

type ExportState = 'idle' | 'exporting' | 'done' | 'error';

export function OverviewDesk({
  metrics,
  classes,
  activeClassId,
  onClassId,
  students,
  activeStudent,
  deliverables,
  onChooseStudent,
  onOpenTalentSystem,
}: {
  metrics: { label: string; value: string }[];
  classes: ClassProfile[];
  activeClassId: string;
  onClassId: (value: string) => void;
  students: Student[];
  activeStudent: Student;
  deliverables: TeacherArtifact[];
  onChooseStudent: (student: Student) => void;
  onOpenTalentSystem: (type?: TeacherArtifactType) => void;
}) {
  const filteredStudents = activeClassId
    ? students.filter((student) => !student.class_id || student.class_id === activeClassId)
    : students;
  const plan = deliverables.find((item) => item.type === 'TalentPlan');

  return (
    <section className="teacher-console-grid teacher-console-grid--overview">
      <div className="teacher-console-card teacher-console-card--metrics">
        {metrics.map((item) => (
          <MetricCell key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <section className="teacher-console-card">
        <PanelHead title="班级" aside={
          <select value={activeClassId} onChange={(event) => onClassId(event.target.value)}>
            {classes.map((item) => (
              <option key={item.class_id} value={item.class_id}>{item.name}</option>
            ))}
          </select>
        } />
        <div className="teacher-class-list">
          {classes.map((item) => (
            <button
              key={item.class_id}
              type="button"
              className={item.class_id === activeClassId ? 'is-active' : ''}
              onClick={() => onClassId(item.class_id)}
            >
              <strong>{item.name}</strong>
              <span>{item.students} 人</span>
              <em>{item.risk} 风险</em>
            </button>
          ))}
        </div>
      </section>

      <section className="teacher-console-card teacher-console-card--wide">
        <PanelHead title="人培方案体系" aside={<button type="button" onClick={() => onOpenTalentSystem('TalentPlan')}>进入</button>} />
        <div className="teacher-plan-entry">
          <div>
            <span>{activeStudent.id}</span>
            <strong>{plan?.title ?? '人培方案体系'}</strong>
          </div>
          <div className="teacher-plan-modules">
            {PLAN_MODULES.map((module) => (
              <button key={module.type} type="button" onClick={() => onOpenTalentSystem(module.type)}>
                {module.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="teacher-console-card">
        <PanelHead title="风险队列" />
        <div className="teacher-risk-list">
          {filteredStudents.map((student) => (
            <button key={student.id} type="button" onClick={() => onChooseStudent(student)}>
              <strong>{student.id}</strong>
              <span>{compactText(student.focus, 16)}</span>
              <em className={`is-${student.risk}`}>{student.mastery}%</em>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

export function GeneratorDesk({
  studentId,
  knowledgeId,
  knowledgeName,
  goal,
  runState,
  taskId,
  error,
  onStudentId,
  onKnowledgeId,
  onKnowledgeName,
  onGoal,
  onGenerate,
}: {
  studentId: string;
  knowledgeId: string;
  knowledgeName: string;
  goal: string;
  runState: RunState;
  taskId: string | null;
  error: string | null;
  onStudentId: (value: string) => void;
  onKnowledgeId: (value: string) => void;
  onKnowledgeName: (value: string) => void;
  onGoal: (value: string) => void;
  onGenerate: () => void;
}) {
  const running = runState === 'submitting' || runState === 'running';

  return (
    <section className="teacher-console-grid teacher-console-grid--split">
      <div className="teacher-console-card">
        <PanelHead title="生成参数" aside={<span>{taskId ?? 'standby'}</span>} />
        <div className="teacher-form-grid">
          <Field label="对象" value={studentId} onChange={onStudentId} />
          <Field label="知识点 ID" value={knowledgeId} onChange={onKnowledgeId} />
          <Field label="知识点" value={knowledgeName} onChange={onKnowledgeName} />
        </div>
        <label className="teacher-field teacher-field--full">
          <span>目标</span>
          <textarea value={goal} onChange={(event) => onGoal(event.target.value)} />
        </label>
        <div className="teacher-action-row">
          <button type="button" className="teacher-primary-button" disabled={running} onClick={onGenerate}>
            {running ? '生成中' : '生成资源包'}
          </button>
          {error && <strong className="teacher-error">{error}</strong>}
        </div>
      </div>

      <div className="teacher-console-card">
        <PanelHead title="主控 Agent" />
        <div className="teacher-runtime-compact">
          {AGENTS.map(([name, label]) => (
            <div key={name} className={name === 'PlannerAgent' ? 'is-main' : ''}>
              <span>{label}</span>
              <strong>{name}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TalentSystemDesk({
  activeClass,
  activeStudent,
  industrySummary,
  artifactLibrary,
  reviews,
  selectedType,
  canExportPptx,
  pptExportState,
  lessonMarkdownExportState,
  onSelectedType,
  onExportPptx,
  onExportLessonMarkdown,
}: {
  activeClass: ClassProfile;
  activeStudent: Student;
  industrySummary: TeacherIndustrySummary | null;
  artifactLibrary: TeacherArtifactLibrary;
  reviews: ReviewItem[];
  selectedType: TeacherArtifactType;
  canExportPptx: boolean;
  pptExportState: ExportState;
  lessonMarkdownExportState: ExportState;
  onSelectedType: (type: TeacherArtifactType) => void;
  onExportPptx: () => void;
  onExportLessonMarkdown: () => void;
}) {
  const planArtifact = artifactLibrary.TalentPlan;
  const blueprint = planArtifact?.presentation;
  const semesters = blueprint?.semesterPlan ?? [];
  const defaultSemesterId = semesters.find((semester) => semester.id === 'year1-fall')?.id ?? semesters[0]?.id ?? '';
  const [selectedSemesterId, setSelectedSemesterId] = useState(defaultSemesterId);
  const selectedSemester =
    semesters.find((semester) => semester.id === selectedSemesterId) ??
    semesters.find((semester) => semester.id === defaultSemesterId) ??
    semesters[0];
  const [selectedCourse, setSelectedCourse] = useState(selectedSemester?.courses[0] ?? '');
  const resourceModules = CURRICULUM_RESOURCE_MODULES.filter((module) => artifactLibrary[module.type]);
  const activeType = selectedType === 'TalentPlan' || resourceModules.some((module) => module.type === selectedType)
    ? selectedType
    : 'TalentPlan';
  const activeArtifact = artifactLibrary[activeType] ?? planArtifact;
  const activeReview = reviews.find((item) => item.type === activeType);
  const showMarkdownExport = activeType === 'LessonPlan' || activeType === 'SlideDeck';

  useEffect(() => {
    if (!defaultSemesterId || semesters.some((semester) => semester.id === selectedSemesterId)) return;
    setSelectedSemesterId(defaultSemesterId);
  }, [defaultSemesterId, selectedSemesterId, semesters]);

  useEffect(() => {
    if (!selectedSemester) return;
    if (selectedCourse && selectedSemester.courses.includes(selectedCourse)) return;
    setSelectedCourse(selectedSemester.courses[0] ?? '');
  }, [selectedCourse, selectedSemester]);

  if (!activeArtifact || !planArtifact || !selectedSemester) {
    return (
      <section className="teacher-console-card">
        <PanelHead title="人培方案体系" />
        <p className="teacher-empty">暂无内容</p>
      </section>
    );
  }

  const industryReport = pickIndustryCourseReport(industrySummary, selectedCourse);
  const courseMilestones = buildCourseMilestones(selectedCourse, selectedSemester, activeStudent, activeArtifact, industryReport);
  const detailSections = activeArtifact.sections.slice(0, activeType === 'TalentPlan' ? 3 : 4);
  const focusTitle = activeType === 'TalentPlan'
    ? `${activeClass.name} · 人培总纲`
    : `${selectedCourse || selectedSemester.courses[0]} · ${activeArtifact.label}`;

  return (
    <section className="teacher-curriculum-board">
      <aside className="teacher-program-spine">
        <button
          type="button"
          className={activeType === 'TalentPlan' ? 'teacher-program-card is-active' : 'teacher-program-card'}
          onClick={() => onSelectedType('TalentPlan')}
        >
          <span>人培总纲</span>
          <strong>{activeClass.name}</strong>
          <em>{blueprint?.direction ?? '软件工程方向'}</em>
          <i>4 年 · 8 学期 · 课程 / 项目 / 作品集</i>
        </button>

        <div className="teacher-stage-ladder" aria-label="学期路线">
          {semesters.map((semester) => (
            <button
              key={semester.id}
              type="button"
              className={semester.id === selectedSemester.id ? 'is-active' : ''}
              onClick={() => setSelectedSemesterId(semester.id)}
            >
              <span>{semester.label}</span>
              <strong>{semester.theme}</strong>
              <em>{semester.courses.slice(0, 2).join(' / ')}</em>
            </button>
          ))}
        </div>
      </aside>

      <article className="teacher-course-system">
        <header className="teacher-course-system__head">
          <div>
            <span>{selectedSemester.stage}</span>
            <h2>{selectedSemester.label} · {selectedSemester.theme}</h2>
          </div>
          <strong>{compactText(selectedSemester.output, 24)}</strong>
        </header>

        <div className="teacher-course-tabs" aria-label="当前学期课程">
          {selectedSemester.courses.map((course) => (
            <button
              key={course}
              type="button"
              className={course === selectedCourse ? 'is-active' : ''}
              onClick={() => setSelectedCourse(course)}
            >
              {course}
            </button>
          ))}
        </div>

        <div className="teacher-semester-brief">
          <section>
            <span>目标</span>
            <strong>{compactText(selectedSemester.target, 42)}</strong>
          </section>
          <section>
            <span>工程训练</span>
            <strong>{selectedSemester.engineering.slice(0, 2).join(' / ')}</strong>
          </section>
          <section>
            <span>学生焦点</span>
            <strong>{activeStudent.id} · {activeStudent.knowledgeName}</strong>
          </section>
        </div>

        <div className="teacher-course-milestones" aria-label="课程执行链路">
          {courseMilestones.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item.label}</strong>
              <em>{item.value}</em>
            </div>
          ))}
        </div>

        <IndustryAlignmentPanel
          selectedCourse={selectedCourse}
          report={industryReport}
          summary={industrySummary}
        />

        <div className="teacher-resource-stack">
          <div className="teacher-resource-rail" aria-label="当前课程资源">
            <button
              type="button"
              className={activeType === 'TalentPlan' ? 'is-active is-plan' : 'is-plan'}
              onClick={() => onSelectedType('TalentPlan')}
            >
              总纲
            </button>
            {resourceModules.map((module) => (
              <button
                key={module.type}
                type="button"
                className={activeType === module.type ? 'is-active' : ''}
                onClick={() => onSelectedType(module.type)}
              >
                <strong>{module.label}</strong>
                <span>{module.role}</span>
              </button>
            ))}
          </div>

          <section className="teacher-resource-sheet">
            <div className="teacher-resource-sheet__head">
              <div>
                <span>{activeReview?.agent ?? activeArtifact.agent}</span>
                <h3>{focusTitle}</h3>
              </div>
              <div className="teacher-system-actions">
                {activeType === 'SlideDeck' && (
                  <button type="button" disabled={!canExportPptx || pptExportState === 'exporting'} onClick={onExportPptx}>
                    {pptExportState === 'exporting' ? '导出中' : pptExportState === 'done' ? '已导出' : pptExportState === 'error' ? 'PPTX失败' : '导出 PPTX'}
                  </button>
                )}
                {showMarkdownExport && (
                  <button type="button" disabled={!canExportPptx || lessonMarkdownExportState === 'exporting'} onClick={onExportLessonMarkdown}>
                    {lessonMarkdownExportState === 'exporting' ? '导出中' : lessonMarkdownExportState === 'done' ? '已导出教案' : '导出 Markdown'}
                  </button>
                )}
                <strong>{activeArtifact.status}</strong>
              </div>
            </div>

            <div className="teacher-resource-marks">
              {activeArtifact.chips.slice(0, 3).map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>

            <div className="teacher-resource-sections">
              {detailSections.map((section) => (
                <section key={section.heading}>
                  <span>{section.heading}</span>
                  <strong>{compactText(summarizeSection(section.body, 1), 38)}</strong>
                </section>
              ))}
            </div>
          </section>
        </div>
      </article>
    </section>
  );
}

function buildCourseMilestones(
  course: string,
  semester: NonNullable<TeacherArtifact['presentation']>['semesterPlan'][number],
  student: Student,
  artifact: TeacherArtifact,
  industryReport: TeacherIndustryCourseReport | null,
) {
  const normalizedCourse = course || semester.courses[0] || '专业课程';
  const anchor = student.knowledgeName || artifact.label;
  const hours = industryReport?.hours ?? inferCourseHours(normalizedCourse);
  const lessons = industryReport?.lessons ?? Math.round(hours / 2);

  return [
    { label: '学时课时', value: `${hours} 学时 / ${lessons} 课时` },
    { label: '课程要求', value: compactText(industryReport?.requirements[0] ?? `${normalizedCourse} · ${semester.theme}`, 28) },
    { label: '学生状态', value: compactText(industryReport?.student_outcomes[0] ?? `${anchor} / ${artifact.outline[0] ?? '核心概念'}`, 28) },
    { label: '行业对接', value: compactText((industryReport?.roles ?? []).slice(0, 2).join(' / ') || semester.project, 28) },
    { label: '前沿发展', value: compactText(industryReport?.frontier_signals[0] ?? artifact.chips[0] ?? '持续跟踪', 28) },
  ];
}

function IndustryAlignmentPanel({
  selectedCourse,
  report,
  summary,
}: {
  selectedCourse: string;
  report: TeacherIndustryCourseReport | null;
  summary: TeacherIndustrySummary | null;
}) {
  const sourceLabel = summary?.source.exists
    ? summary.source.label
    : '行业数据 · 等待接入';
  const keywords = report?.top_keywords.length ? report.top_keywords.slice(0, 6) : ['Java', 'SQL', '接口', '文档'];
  const requirements = report?.requirements ?? ['明确课程要求', '沉淀可验证证据'];
  const outcomes = report?.student_outcomes ?? ['形成课程作品', '完成课堂复盘'];
  const frontiers = report?.frontier_signals ?? ['跟踪 AI 编程、云服务与安全合规'];

  return (
    <section className="teacher-industry-bridge" aria-label="课程行业对齐">
      <header>
        <div>
          <span>行业数据</span>
          <strong>{selectedCourse || report?.course || '课程'} · 岗位对齐</strong>
        </div>
        <em>{sourceLabel}</em>
      </header>

      <div className="teacher-industry-stats">
        <div>
          <span>学时</span>
          <strong>{report ? `${report.hours}/${report.lessons}` : '--'}</strong>
        </div>
        <div>
          <span>岗位样本</span>
          <strong>{report?.job_sample_count ?? '--'}</strong>
        </div>
        <div>
          <span>行业</span>
          <strong>{report?.industries.slice(0, 2).join(' / ') || '待匹配'}</strong>
        </div>
        <div>
          <span>薪资</span>
          <strong>{report?.salary.label ?? '样本不足'}</strong>
        </div>
      </div>

      <div className="teacher-industry-grid">
        <section>
          <span>课程要求</span>
          <strong>{requirements.slice(0, 2).join(' / ')}</strong>
        </section>
        <section>
          <span>学生应达到</span>
          <strong>{outcomes.slice(0, 2).join(' / ')}</strong>
        </section>
        <section>
          <span>岗位关键词</span>
          <div className="teacher-industry-keywords">
            {keywords.map((keyword) => <i key={keyword}>{keyword}</i>)}
          </div>
        </section>
        <section>
          <span>前沿发展</span>
          <strong>{frontiers.slice(0, 2).join(' / ')}</strong>
        </section>
      </div>
    </section>
  );
}

function pickIndustryCourseReport(
  summary: TeacherIndustrySummary | null,
  course: string,
): TeacherIndustryCourseReport | null {
  if (!summary) return null;
  const normalized = normalizeCourseName(course);
  return summary.course_reports.find((item) => normalizeCourseName(item.course) === normalized)
    ?? summary.course_reports.find((item) => normalized.includes(normalizeCourseName(item.course)) || normalizeCourseName(item.course).includes(normalized))
    ?? null;
}

function normalizeCourseName(value: string): string {
  return value.replace(/[·\s]/g, '').replace(/入门|基础/g, '').toLowerCase();
}

function inferCourseHours(course: string): number {
  if (/数据结构|程序设计|面向对象/.test(course)) return 64;
  if (/组成|操作系统|数据库/.test(course)) return 56;
  if (/网络|算法|离散|软件工程/.test(course)) return 48;
  return 40;
}

export function InterventionDesk({
  students,
  activeStudent,
  onChooseStudent,
}: {
  students: Student[];
  activeStudent: Student;
  onChooseStudent: (student: Student) => void;
}) {
  return (
    <section className="teacher-console-grid teacher-console-grid--split">
      <div className="teacher-console-card">
        <PanelHead title="干预队列" />
        <div className="teacher-intervention-table">
          {students.map((student) => (
            <button
              key={student.id}
              type="button"
              className={student.id === activeStudent.id ? 'is-active' : ''}
              onClick={() => onChooseStudent(student)}
            >
              <strong>{student.id}</strong>
              <span>{compactText(student.focus, 18)}</span>
              <em>{student.action}</em>
            </button>
          ))}
        </div>
      </div>
      <div className="teacher-console-card teacher-intervention-focus">
        <PanelHead title="当前对象" />
        <strong>{activeStudent.id}</strong>
        <span>{activeStudent.mastery}%</span>
        <p>{compactText(activeStudent.evidence, 46)}</p>
      </div>
    </section>
  );
}

export function AgentFlow({ runState, taskId }: { runState: RunState; taskId: string | null }) {
  const status = taskId ? runState : 'idle';

  return (
    <section className="teacher-agent-flow" aria-label="老师端多 Agent">
      <div>
        <span>Multi-Agent</span>
        <strong>{taskId ?? status}</strong>
      </div>
      <ol>
        {AGENTS.map(([name, label]) => (
          <li key={name} className={name === 'PlannerAgent' ? 'is-main' : ''}>
            <span>{label}</span>
            <strong>{name}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PanelHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="teacher-panel-head">
      <h2>{title}</h2>
      {aside && <div>{aside}</div>}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="teacher-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="teacher-metric-cell">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function StatusPill({ label, value, tone }: { label: string; value: string; tone?: 'active' | 'danger' }) {
  return (
    <div className={tone ? `teacher-status-pill is-${tone}` : 'teacher-status-pill'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
