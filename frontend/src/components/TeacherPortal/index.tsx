import type { CSSProperties } from 'react';
import { MeshNav } from '../ProjectLanding';
import '../../vercel-mesh.css';

const CLASSES = [
  { name: '软件工程 2301', students: 42, risk: 6, progress: 78, status: '正常推进' },
  { name: '数据结构强化班', students: 36, risk: 11, progress: 64, status: '需要干预' },
  { name: 'AI 应用项目组', students: 18, risk: 3, progress: 83, status: '正常推进' },
];

const STUDENTS = [
  { name: 'stu_001', focus: '链表 / 指针顺序', mastery: 72, risk: 'medium', action: '补一组可视化步骤题' },
  { name: 'stu_018', focus: '二叉树遍历', mastery: 51, risk: 'high', action: '安排 1 次代码走查' },
  { name: 'stu_026', focus: '动态规划入门', mastery: 67, risk: 'medium', action: '降低题目梯度' },
  { name: 'stu_033', focus: '图算法 BFS', mastery: 86, risk: 'low', action: '推荐挑战任务' },
];

const AGENTS = [
  ['ProfileAgent', '画像更新', '12 维画像已同步 128 次'],
  ['PlannerAgent', '任务编排', '本周生成 74 条学习路径'],
  ['EvaluationAgent', '闭环评估', '发现 20 个新增短板'],
];

export function TeacherPortal() {
  return (
    <div className="mesh-page">
      <div className="mesh-shell">
        <MeshNav active="teacher" />
        <main className="mesh-main mesh-dashboard">
          <aside className="mesh-sidebar">
            <button className="mesh-side-item is-active"><strong>总览</strong><span>班级状态与风险雷达</span></button>
            <button className="mesh-side-item"><strong>学生画像</strong><span>12 维画像与证据</span></button>
            <button className="mesh-side-item"><strong>资源审核</strong><span>生成结果与引用依据</span></button>
            <button className="mesh-side-item"><strong>干预建议</strong><span>下一步教学动作</span></button>
          </aside>

          <section className="mesh-dashboard-main">
            <div className="mesh-dashboard-hero">
              <div>
                <div className="mesh-kicker"><span className="mesh-pulse" /> Teacher Console / observability layer</div>
                <h1>用老师视角观察每一次个性化生成。</h1>
                <p className="mesh-subtitle">
                  老师端不复制学生端的温暖卡片，而是提供平台级可观测性：班级风险、学生画像、资源质量、Agent 运行状态和可执行干预建议。
                </p>
              </div>
              <a className="mesh-primary-button" href="#/student">查看学生端体验</a>
            </div>

            <div className="mesh-metric-grid">
              <div className="mesh-metric"><strong>96</strong><span>活跃学生</span></div>
              <div className="mesh-metric"><strong>20</strong><span>待干预短板</span></div>
              <div className="mesh-metric"><strong>312</strong><span>生成资源</span></div>
              <div className="mesh-metric"><strong>91%</strong><span>资源可追溯率</span></div>
            </div>

            <div className="mesh-grid-2">
              <section className="mesh-panel">
                <div className="mesh-section-head" style={compactHeadStyle}>
                  <h2 style={panelTitleStyle}>班级运行状态</h2>
                  <span className="mesh-mono">/classes</span>
                </div>
                <table className="mesh-table">
                  <thead>
                    <tr><th>班级</th><th>学生</th><th>风险</th><th>进度</th><th>状态</th></tr>
                  </thead>
                  <tbody>
                    {CLASSES.map((item) => (
                      <tr key={item.name}>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.students}</td>
                        <td>{item.risk}</td>
                        <td><Progress value={item.progress} /></td>
                        <td><span className={item.risk > 8 ? 'mesh-status warn' : 'mesh-status'}>{item.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="mesh-panel">
                <div className="mesh-section-head" style={compactHeadStyle}>
                  <h2 style={panelTitleStyle}>Agent 生产线</h2>
                  <span className="mesh-mono">/runtime</span>
                </div>
                <div className="mesh-grid-3" style={agentGridStyle}>
                  {AGENTS.map(([name, status, detail]) => (
                    <article className="mesh-card" key={name}>
                      <small>{name}</small>
                      <h3>{status}</h3>
                      <p>{detail}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <section className="mesh-panel">
              <div className="mesh-section-head" style={compactHeadStyle}>
                <h2 style={panelTitleStyle}>学生风险与干预建议</h2>
                <span className="mesh-mono">/students</span>
              </div>
              <table className="mesh-table">
                <thead>
                  <tr><th>学生</th><th>当前焦点</th><th>掌握度</th><th>风险</th><th>建议动作</th></tr>
                </thead>
                <tbody>
                  {STUDENTS.map((item) => (
                    <tr key={item.name}>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.focus}</td>
                      <td><Progress value={item.mastery} /></td>
                      <td><span className={item.risk === 'high' ? 'mesh-status warn' : 'mesh-status'}>{item.risk}</span></td>
                      <td>{item.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
        </main>
        <footer className="mesh-footer">Teacher Console · Built with vercel-mesh visual language</footer>
      </div>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return <div className="mesh-progress"><span style={{ '--value': `${value}%` } as CSSProperties} /></div>;
}

const compactHeadStyle: CSSProperties = { marginBottom: 18 };
const panelTitleStyle: CSSProperties = { fontSize: 24 };
const agentGridStyle: CSSProperties = { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' };
