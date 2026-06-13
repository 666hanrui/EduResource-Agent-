# Student Business API 下一步执行计划

> 当前状态：已新增 `backend/app/api/student_business.py`，并在 `backend/main.py` 中优先挂载；旧前端继续调用 `/api/exploration/plan` 时，也会触发画像、路径、探索会话落库。已新增 `scripts/smoke_student_business_api.sh`。

## 总目标

把学生端从“接口已补齐”推进到“前后端完整闭环可验收”。

完整链路：

```text
专业探索
→ 写入学生画像
→ 写入画像历史
→ 初始化学习路径
→ 选择知识点进入互动课堂
→ 生成资源包 / 练习
→ 学生作答
→ 评估记录
→ 更新画像和路径
→ 生成成长报告
```

---

## Phase 1：后端接口自检与修错

### 1.1 启动后端

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 1.2 跑 smoke 脚本

```bash
cd ..
bash scripts/smoke_student_business_api.sh
```

### 1.3 重点检查

- `/api/students/business/health` 是否能返回接口列表。
- `POST /api/students/{student_id}/exploration-sessions` 是否能返回：
  - `session`
  - `plan`
- `GET /api/students/{student_id}/profile` 是否能读到专业探索写入后的画像。
- `GET /api/students/{student_id}/profile/history` 是否至少有一条 exploration 来源记录。
- `GET /api/students/{student_id}/learning-path` 是否能读到由探索结果生成的 step。
- `PATCH /api/students/{student_id}/learning-path/steps/{step_id}` 是否能更新 step 状态并追加 `adjustment_history`。
- `POST /api/students/{student_id}/reports` 是否能生成 Markdown 报告。
- `GET /api/students/{student_id}/reports/{report_id}` 是否能读回同一份报告。

### 1.4 如果报错，优先修这几类

1. Pydantic 字段不匹配。
2. SQLite 表名或字段名不一致。
3. `SQLiteStudentLearningStore` 内部方法名变化。
4. `ResourcePackageStore` 缺少 `list_packages` 或 `list_evaluations_for_student` 的参数兼容问题。
5. legacy `/api/exploration/plan` 是否真的命中新 business router。

---

## Phase 2：前端学生端接线

当前前端已经有四个阶段：

- 画像与广度
- 培养方案
- 课堂验证
- 回写证据

下一步不大改 UI，优先换真实数据源。

### 2.1 学生工作台首页 / Dashboard

保留已有：

```text
GET /api/students/{student_id}/dashboard
```

新增补充读取：

```text
GET /api/students/{student_id}/profile
GET /api/students/{student_id}/learning-path
```

页面展示：

- 当前画像摘要
- 当前学习目标
- 当前学习路径进度
- 最近资源包
- 最近评估结果
- 下一步建议

### 2.2 专业探索页

当前旧调用：

```text
POST /api/exploration/plan
```

短期保留，因为后端已兼容落库。

推荐下一步改成明确学生业务接口：

```text
POST /api/students/{student_id}/exploration-sessions
```

成功后刷新：

```text
GET /api/students/{student_id}/profile
GET /api/students/{student_id}/profile/history
GET /api/students/{student_id}/learning-path
GET /api/students/{student_id}/dashboard
```

前端状态需要新增：

```ts
studentProfile
profileHistory
learningPath
lastExplorationSession
```

### 2.3 学习画像页

新增或扩展页面区块：

```text
GET   /api/students/{student_id}/profile
PATCH /api/students/{student_id}/profile
GET   /api/students/{student_id}/profile/history
```

展示字段：

- professional_background
- knowledge_mastery
- learning_goal
- learning_style
- mistake_points
- resource_preference
- learning_pace
- current_progress
- history

编辑能力：

- 学习目标
- 学习风格
- 资源偏好
- 学习节奏
- 易错点

### 2.4 培养方案 / 学习路径页

接：

```text
GET   /api/students/{student_id}/learning-path
PATCH /api/students/{student_id}/learning-path/steps/{step_id}
```

功能：

- 展示路径步骤
- step 状态：pending / in_progress / done / adjusted
- 展示 package_id / evaluation_id / evidence
- 允许学生标记“开始学习”或“已完成”
- 显示 adjustment_history

### 2.5 课堂验证页

保留现有：

```text
POST /api/students/{student_id}/interactive-classrooms
GET  /api/students/{student_id}/interactive-classrooms/{job_id}
```

要求：

- 从 learning path step 或 recommended knowledge 进入课堂。
- 创建课堂时带上：
  - target_knowledge_id
  - target_knowledge_name
  - learning_goal
  - selection_context
- 成功创建后，把 classroom job 与当前路径 step 关联。

### 2.6 回写证据 / 报告页

新增接：

```text
POST /api/students/{student_id}/reports
GET  /api/students/{student_id}/reports/{report_id}
```

页面展示：

- 报告 Markdown
- 报告 source_json
- 当前画像摘要
- 当前路径进度
- 最近评估记录

---

## Phase 3：OpenMAIC 回写闭环

这是最关键的真实闭环，不是 UI。

### 3.1 当前已有链路

已有接口：

```text
POST /api/students/{student_id}/interactive-classrooms
GET  /api/students/{student_id}/interactive-classrooms/{job_id}
```

创建课堂时会创建/更新：

- ResourcePackage
- InteractiveClassroomJob
- LearningPathStep

### 3.2 需要确认的回写点

OpenMAIC 回写后，EduResource 需要保存：

- ResourcePackage
- ResourceItem
- ExerciseSet
- ExerciseItem
- ExerciseAttempt
- EvaluationRecord

### 3.3 下一步补充检查

检查 routes 中现有 OpenMAIC import 接口：

```text
/api/openmaic/classroom-imports
/api/openmaic/exercise-attempts/imports
```

确认它们是否会触发：

```text
EvaluationRecord
→ StudentProfileHistory
→ StudentProfile
→ LearningPathStep
```

如果没有，要补：

```text
import_openmaic_attempts
→ package_store.save_attempts
→ package_store.save_evaluation
→ learning_store.apply_evaluation_result
```

---

## Phase 4：端到端测试

### 4.1 新增后端测试文件

建议新增：

```text
tests/test_student_business_api.py
```

测试内容：

1. profile GET 默认返回 default profile。
2. profile PATCH 后 history 增加。
3. exploration-sessions POST 后：
   - session 落库
   - profile 更新
   - learning path 生成 step
4. learning-path step PATCH 后：
   - status 改变
   - adjustment_history 增加
5. reports POST 后：
   - report 落库
   - GET report 可读取
   - markdown 包含画像、路径、资源、评估模块

### 4.2 前端手动验收

按页面执行：

1. 进入学生端。
2. 填专业探索表单并生成。
3. 查看画像是否变化。
4. 查看学习路径是否出现新 step。
5. 从推荐知识点进入课堂。
6. 生成互动课堂任务。
7. 完成练习或模拟回写。
8. 查看评估记录。
9. 生成成长报告。

---

## Phase 5：文档与验收记录

### 5.1 更新文档

需要更新：

```text
docs/11-student-frontend-workspace.md
docs/12-student-business-api-plan.md
```

写清楚当前学生端真实 API 主线。

### 5.2 新增验收记录

建议新增：

```text
docs/14-student-business-smoke-result.md
```

记录：

- smoke 脚本运行时间
- 后端端口
- student_id
- 生成的 exploration_session_id
- 生成的 path_id
- 生成的 report_id
- 是否发现 OpenMAIC 回写问题

---

## 推荐执行顺序

```text
1. 本地跑 smoke_student_business_api.sh
2. 修后端报错
3. 前端专业探索改调 /api/students/{id}/exploration-sessions
4. 前端画像页接 profile/history
5. 前端培养方案页接 learning-path
6. 前端报告页接 reports
7. 检查 OpenMAIC attempts import 是否更新 EvaluationRecord/Profile/Path
8. 补 tests/test_student_business_api.py
9. 写 smoke result 文档
```

## 当前不要做的事

- 不要继续加新 UI 风格。
- 不要新增管理员端。
- 不要重新设计一套 `/api/student/*`。
- 不要把 OpenMAIC 当成 EduResource 的数据存储。
- 不要让专业探索继续只是展示页。
- 不要让报告在前端临时拼接。

## 下一步建议立刻执行

优先做：

```text
Phase 1：运行 smoke 脚本并修后端问题
```

因为只有先确认后端四类接口真实可用，前端接线才不会变成盲改。
