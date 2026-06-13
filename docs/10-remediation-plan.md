# 当前问题整改计划

> 本计划对应 `docs/09-current-system-architecture.md` 中识别出的真实工程风险。目标不是继续堆新功能，而是把已经存在的学生端、老师端、Agent、OpenMAIC、PPTX 导出链路收束成稳定可演示、可答辩、可继续开发的系统。

## 总体优先级

| 优先级 | 问题 | 目标 |
|-------|------|------|
| P0 | 老师端前端没有完全接入教师业务接口 | 让老师端从本地 Demo 数据切换为真实 TeacherStore 数据 |
| P0 | 老师端生成仍容易绕过教师教学包业务边界 | 让老师端生成走教师教学包接口，而不是直接打 `/api/generate` |
| P1 | OpenMAIC 外部服务不可用时学生端链路会断 | 增加本地 fallback，保证演示稳定 |
| P1 | PPTX 导出依赖外部 `apps/ppt-master` 环境 | 增加可诊断状态与降级导出，避免演示现场报死错 |
| P1 | ToolCallingFlow 动态模式稳定性不如固定流水线 | 明确演示默认使用 GenerateFlow，ToolCalling 只作为增强展示 |
| P2 | SQLite JSON Store 后续统计查询困难 | 保留 JSON 快速实现，同时增加轻量索引表或派生快照 |
| P2 | 视觉系统混杂 | 单独立项处理首页与老师端视觉统一，不在本轮后端收口中混改 |
| Done | README 与真实代码不同步 | 已更新 README |
| Done | 静态 HTML 实验页干扰正式结构 | 已通过 `html/README.md` 和 archived stub 隔离 |

---

## P0-1：老师端前端接入 Teacher Dashboard

### 当前问题

后端已经有完整教师业务边界：

- `TeacherStore`
- `TeacherDashboard`
- `ClassProfile`
- `TeacherStudentSnapshot`
- `TeacherTeachingPackage`
- `TeacherReviewItem`

但老师端前端仍然保留 `TeacherPortal/model.ts` 里的本地 Demo 数据，导致页面展示与真实后端状态没有完全闭合。

### 涉及文件

- `frontend/src/components/TeacherPortal/index.tsx`
- `frontend/src/components/TeacherPortal/model.ts`
- `frontend/src/components/TeacherPortal/panels.tsx`
- `backend/app/api/routes.py`
- `backend/app/services/teacher_store.py`
- `backend/app/schemas/teacher.py`

### 实施步骤

1. 新增老师端 API client：
   - 建议文件：`frontend/src/components/TeacherPortal/api.ts`
   - 封装：
     - `fetchTeacherDashboard(teacherId, classId?)`
     - `createTeachingPackage(teacherId, classId, payload)`
     - `fetchTeachingPackageJob(teacherId, classId, jobId)`

2. 在 `TeacherPortal/index.tsx` 中新增状态：
   - `teacherId = 'tch_001'`
   - `activeClassId`
   - `dashboard`
   - `dashboardLoading`
   - `dashboardError`

3. 页面初始化时请求：
   - `GET /api/teachers/tch_001/dashboard`

4. 班级切换时请求：
   - `GET /api/teachers/tch_001/dashboard?class_id=xxx`

5. 用接口数据替换本地数据：
   - `CLASSES` → `dashboard.classes`
   - `STUDENTS` → `dashboard.attention_queue`
   - `reviewItems` → `dashboard.review_items`
   - `recentPackages` → `dashboard.recent_packages`
   - `activeClass` → `dashboard.active_class`

6. 保留 `model.ts` 作为 fallback/mock，但只在接口失败时使用，并在 UI 上标注 mock fallback。

### 验收标准

- 打开老师端后，Network 面板能看到 `/api/teachers/tch_001/dashboard`。
- 总览页班级、风险学生、审核队列来自后端接口。
- 切换班级能刷新 attention queue。
- 后端 SQLite 种子数据能直接显示到老师端。
- 接口失败时页面不白屏，有 fallback 和错误提示。

---

## P0-2：老师端生成改走教师教学包接口

### 当前问题

老师端后端已经提供教师教学包生成接口：

```http
POST /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages
```

但前端仍可能直接调用 `/api/generate`。这样会绕开：

- TeacherStore job 状态
- TeacherPackage 持久化
- TeacherReviewItem 自动拆分
- PPTX 导出入口

### 涉及文件

- `frontend/src/components/TeacherPortal/index.tsx`
- `frontend/src/components/TeacherPortal/api.ts`
- `backend/app/api/routes.py`
- `backend/app/services/teacher_store.py`

### 实施步骤

1. 将老师端生成按钮调用改成：

```http
POST /api/teachers/tch_001/classes/{active_class_id}/teaching-packages
```

2. 请求体使用：

```json
{
  "target_knowledge_id": "binary-tree-traversal",
  "target_knowledge_name": "二叉树遍历",
  "teaching_goal": "为高风险学生生成低负担教学包",
  "target_student_id": "stu_018",
  "difficulty": 2,
  "exercise_count": 6,
  "languages": ["python", "java"]
}
```

3. 创建成功后保存：
   - `job_id`
   - `teaching_package_id`
   - `generate_task_id`

4. SSE 订阅继续使用：

```http
GET /api/tasks/{generate_task_id}/events
```

5. 任务轮询改成：

```http
GET /api/teachers/tch_001/classes/{class_id}/teaching-packages/{job_id}
```

6. 任务成功后从 job 中读取：
   - `results`
   - `review_items`

7. 刷新 dashboard，确保审核队列更新。

### 验收标准

- 生成任务会写入 `teacher_generation_jobs`。
- 生成结果会写入 `teacher_packages`。
- 审核项会写入 `teacher_review_items`。
- 前端 Review 页显示的是后端拆出的 review items。
- 生成完成后可以拿到 `teaching_package_id`，为 PPTX 导出做准备。

---

## P1-1：OpenMAIC 增加本地 fallback

### 当前问题

学生端互动课堂主链路依赖 OpenMAIC。如果外部服务不可用，课堂生成会失败，演示链路不稳定。

### 涉及文件

- `backend/app/services/openmaic_client.py`
- `backend/app/api/routes.py`
- `backend/app/services/openmaic_import.py`
- `backend/app/services/student_learning_store.py`
- `backend/app/schemas/openmaic.py`

### 实施步骤

1. 在 `openmaic_client.py` 中增加 fallback 生成器：
   - 函数名建议：`build_mock_openmaic_classroom(payload)`

2. fallback 输出结构要与真实 OpenMAIC 返回兼容，至少包含：
   - stage
   - scenes
   - slide scene
   - interactive scene
   - quiz scene
   - pbl scene

3. 当 OpenMAIC 请求失败时，根据环境变量决定是否启用 fallback：

```env
EDU_OPENMAIC_FALLBACK=1
```

4. fallback 生成后仍然走 `openmaic_import.py`，不要绕开正式导入链路。

5. 在返回 job message 中标注：
   - `OpenMAIC fallback classroom generated locally`

### 验收标准

- 关闭 OpenMAIC 服务时，学生端仍能生成课堂。
- 生成的课堂仍会导入 ResourcePackage。
- 学生端 learning path 仍会产生 in_progress step。
- 后续模拟测验仍能触发 evaluation 与 profile update。

---

## P1-2：PPTX 导出增加可诊断与降级

### 当前问题

`ppt_master_service.py` 依赖：

- `apps/ppt-master/skills/ppt-master/scripts/svg_to_pptx.py`
- Python >= 3.10
- `python-pptx`

如果部署环境缺失，导出会失败。

### 涉及文件

- `backend/app/services/ppt_master_service.py`
- `backend/app/api/routes.py`
- `docs/09-current-system-architecture.md`

### 实施步骤

1. 新增健康检查函数：

```py
check_ppt_master_status() -> dict
```

返回：

- ppt_master_root exists
- exporter exists
- python executable
- python-pptx available
- export_root writable

2. 新增接口：

```http
GET /api/teachers/export/pptx/status
```

3. PPTX 导出失败时，返回明确错误：
   - 缺少 ppt-master
   - 缺少 python-pptx
   - exporter 执行失败

4. 增加降级导出：
   - 如果 PPTX 不可用，返回 Markdown 教案
   - 建议接口：

```http
GET /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages/{package_id}/lesson-plan.md
```

5. Markdown 教案内容复用 `_build_slides` 的 slide notes。

### 验收标准

- 环境缺失时不会返回模糊 500，而是返回清楚诊断。
- 演示现场即使 PPTX 失败，也能导出 Markdown 教案。
- PPTX 环境正确时仍然正常导出 `.pptx`。

---

## P1-3：明确 ToolCallingFlow 的演示边界

### 当前问题

`/api/generate/tool-calling` 展示 MainAgent 动态调度能力，但它依赖 LLM 输出，稳定性不如固定 GenerateFlow。

### 涉及文件

- `backend/app/agents/orchestrator.py`
- `backend/app/api/routes.py`
- `docs/09-current-system-architecture.md`
- `README.md`

### 实施步骤

1. README 中明确：正式演示默认使用 `/api/generate` 和教师教学包接口。

2. ToolCallingFlow 标注为增强演示：
   - 用于展示 MainAgent 自主规划
   - 不作为主线流程依赖

3. 增加 `/api/generate/tool-calling` 返回中的 message 字段或文档说明：
   - 如果未注入 `llm_service`，会降级到 GenerateFlow。

4. 前端如果未来接入 ToolCalling，需要加“实验模式”开关。

### 验收标准

- 答辩主路径不依赖 ToolCalling。
- ToolCalling 出错不会影响教师教学包生成主链路。
- 文档中对两者定位清楚。

---

## P2-1：SQLite JSON Store 增加轻量索引

### 当前问题

当前 `resource_packages`、`student_profiles`、`learning_paths` 等大量数据以 JSON payload 存储。优点是开发快，缺点是后续跨班级统计和知识点分析困难。

### 涉及文件

- `backend/app/services/resource_package_store.py`
- `backend/app/services/student_learning_store.py`
- `backend/app/services/teacher_store.py`

### 实施步骤

1. 保留 JSON document store，不推翻现有实现。

2. 增加派生索引表，例如：

```sql
student_mastery_index(student_id, knowledge_id, mastery, updated_at)
teacher_risk_index(teacher_id, class_id, student_id, knowledge_id, risk, mastery, updated_at)
package_index(package_id, owner_id, owner_role, target_knowledge_id, status, updated_at)
```

3. 在保存 profile、package、teacher snapshot 时同步写入索引表。

4. 新增统计查询接口：

```http
GET /api/teachers/{teacher_id}/analytics/knowledge-risk
GET /api/students/{student_id}/analytics/mastery
```

### 验收标准

- 不破坏现有 JSON 存储。
- 能按知识点查询班级风险。
- 能按学生查询掌握度趋势。
- Dashboard 后续可以直接读聚合结果，不用每次解析大 JSON。

---

## P2-2：视觉系统统一单独立项

### 当前问题

当前仓库里同时出现：

- Freddie 黄黑温暖风
- Vercel Mesh 黑底工具风
- Cinematic 电影感风

视觉混杂会影响展示一致性。

### 本轮处理原则

本计划先收口业务链路，不同时大改前端视觉，避免功能和视觉互相干扰。

### 后续单独计划

1. 明确最终展示策略：
   - 学生端是否保留当前学习工作区风格
   - 首页是否改回 Vercel Mesh
   - 老师端是否完全复用 Vercel Mesh

2. 建立统一 design token：
   - color
   - spacing
   - radius
   - typography
   - elevation

3. 将实验样式移动到 `docs/design-experiments/` 或完全删除。

4. 对老师端和首页做一次视觉重构，不改后端逻辑。

### 验收标准

- 首页、老师端、学生端各自视觉定位清楚。
- 不再出现无归属的静态实验页影响判断。
- 设计规范写入 docs。

---

## 已完成项记录

### README 同步

已完成：README 已更新为当前真实系统状态，包括学生端、老师端、双 Agent 系统、后端接口、OpenMAIC、TeacherStore、PPTX 导出等。

### 当前架构文档

已完成：新增 `docs/09-current-system-architecture.md`。

### 静态 HTML 实验页隔离

已完成：

- 新增 `html/README.md`
- 将 `html/homepage.html`
- `html/multi-agent-demo.html`
- `html/teacher-portal.html`
- `html/viz-studio.html`

统一改为 archived stub，避免被误认为正式前端页面。

---

## 推荐执行顺序

### 第 1 天：老师端业务闭环

1. 新建 `TeacherPortal/api.ts`
2. 接入 `/api/teachers/tch_001/dashboard`
3. 老师端生成改为教学包接口
4. Review 页读取后端 review items

### 第 2 天：演示稳定性

1. OpenMAIC fallback
2. PPTX status check
3. Markdown 教案降级导出

### 第 3 天：答辩打磨

1. ToolCalling 定位文档补充
2. README 演示路径补充
3. 录制稳定演示路径
4. 准备 PPT：学生端闭环 + 老师端闭环 + 双 7-Agent 架构

### 后续增强

1. SQLite 轻量索引表
2. 统计分析接口
3. 前端视觉统一
4. 部署脚本与一键启动文档
