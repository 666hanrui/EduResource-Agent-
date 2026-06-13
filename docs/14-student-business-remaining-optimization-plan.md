# Student Business Remaining Optimization Plan

> 当前状态：学生端后端业务 API 已补齐；旧 `/api/exploration/plan` 已兼容真实落库；前端已接入真实成长报告生成、画像历史读取，并扩展了 `StudentDashboard` 类型。

本计划用于继续推进剩余优化项，目标是把学生端从“能跑通接口”推进到“页面真实闭环、路径可更新、OpenMAIC 回写可验收”。

---

## 一、当前已完成能力

### 后端

已完成：

```text
GET   /api/students/{student_id}/profile
PATCH /api/students/{student_id}/profile
GET   /api/students/{student_id}/profile/history

POST  /api/students/{student_id}/exploration-sessions
GET   /api/students/{student_id}/exploration-sessions/{session_id}

GET   /api/students/{student_id}/learning-path
PATCH /api/students/{student_id}/learning-path/steps/{step_id}

POST  /api/students/{student_id}/reports
GET   /api/students/{student_id}/reports/{report_id}
```

已完成兼容：

```text
POST /api/exploration/plan
```

旧前端继续调用该接口时，也会触发：

```text
ExplorationPlan
→ StudentProfile
→ StudentProfileHistory
→ LearningPath
→ LearningPathStep
→ ExplorationSession
```

### 前端

已完成：

- `ProgressOverview` 可调用 `POST /api/students/{student_id}/reports` 生成真实成长报告。
- `StudentContextRail` 可调用 `GET /api/students/{student_id}/profile/history?limit=5` 展示画像历史。
- `model.ts` 已扩展真实 `profile / learning_path / report` 类型。

### 测试

已新增：

```text
backend/tests/test_student_business_api.py
```

覆盖：

- profile 默认读取；
- profile PATCH 后写 history；
- exploration session 落库；
- learning path step PATCH；
- report POST / GET；
- legacy `/api/exploration/plan` 兼容落库。

---

## 二、剩余优化总目标

继续补齐以下闭环：

```text
专业探索显式落库
→ 前端刷新画像 / 路径 / 画像历史
→ 学习路径 step 可手动更新
→ 课堂生成绑定 path step
→ OpenMAIC 回写作答与评估
→ 评估更新画像和路径
→ 报告基于最新数据生成
→ 前端展示完整证据链
```

---

## 三、Phase 1：学习路径 Step 手动更新

### 目标

让学生端页面可以直接调用：

```text
PATCH /api/students/{student_id}/learning-path/steps/{step_id}
```

将路径步骤更新为：

```text
pending
in_progress
done
adjusted
```

### 需要改的前端文件

```text
frontend/src/components/student-workspace/TrainingPlanBoard.tsx
frontend/src/App.tsx
```

### 推荐实现

#### 1. `TrainingPlanBoard` 增加 props

```ts
onUpdateStep?: (stepId: string, payload: {
  status?: 'pending' | 'in_progress' | 'done' | 'adjusted';
  evidence?: string;
  mastery_after?: number;
  updated_reason?: string;
}) => Promise<void>;
```

#### 2. 在路径相关区域展示真实 step

当前 `TrainingPlanBoard` 主要展示 `training_plan.stages`，还需要加一个真实路径区块：

```text
LearningPath Steps
- step.title
- step.status
- step.mastery_before → step.mastery_after
- step.updated_reason
- package_id / evaluation_id
```

#### 3. 每个 step 增加动作

最小可用动作：

```text
开始学习 → status = in_progress
标记完成 → status = done
需要调整 → status = adjusted
```

请求示例：

```ts
await fetch(`/api/students/${studentId}/learning-path/steps/${stepId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'done',
    evidence: '学生手动标记完成',
    updated_reason: '学生完成该阶段学习',
  }),
});
```

#### 4. 更新后刷新 dashboard

`App.tsx` 中新增：

```ts
const handleUpdatePathStep = async (...) => {
  await fetch(...PATCH...);
  await refreshStudentDashboard(studentId);
};
```

### 验收标准

- 点击“开始学习”后，step 状态变为 `in_progress`。
- 点击“标记完成”后，step 状态变为 `done`。
- `adjustment_history` 追加记录。
- 刷新页面后状态仍存在。

---

## 四、Phase 2：专业探索显式改调学生业务接口

### 当前情况

前端 `MajorExplorationPanel` 仍调用：

```text
POST /api/exploration/plan
```

后端已经做了兼容落库，所以功能可用。

但从架构清晰度看，学生端应该显式调用：

```text
POST /api/students/{student_id}/exploration-sessions
```

### 目标

将学生端专业探索提交入口从旧接口切到新接口。

### 需要改的文件

```text
frontend/src/components/MajorExplorationPanel/index.tsx
frontend/src/types/exploration.ts
```

### 推荐实现

#### 1. 新增响应类型

```ts
interface StudentExplorationSessionResponse {
  session: ExplorationSession;
  plan: ExplorationPlan;
}
```

#### 2. 请求地址改为

```ts
const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/exploration-sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
```

#### 3. 前端继续使用 `response.plan` 渲染旧探索 UI

保持现有页面不大改：

```ts
const data = await res.json() as StudentExplorationSessionResponse;
setPlan(data.plan);
setLastExplorationSession(data.session);
```

#### 4. 成功后触发外层刷新

`MajorExplorationPanel` 增加回调：

```ts
onExplorationPersisted?: () => void;
```

`App.tsx` 传入：

```ts
onExplorationPersisted={() => refreshStudentDashboard(studentId)}
```

### 验收标准

- 专业探索页面仍能正常显示探索结果。
- network 中请求地址变为 `/api/students/{id}/exploration-sessions`。
- 生成后 dashboard、画像历史、学习路径自动刷新。
- 不依赖 legacy `/api/exploration/plan`。

---

## 五、Phase 3：画像编辑能力补齐

### 当前情况

后端已支持：

```text
PATCH /api/students/{student_id}/profile
```

前端目前只展示画像摘要和历史，没有提供编辑入口。

### 目标

让学生可以修改画像中的关键字段，并真实写入 history。

### 建议位置

右侧 `StudentContextRail` 或 `MajorExplorationPanel` 顶部画像区域。

### 最小字段

```text
learning_goal
learning_style
resource_preference
learning_pace
mistake_points
```

### 推荐交互

- “编辑画像”按钮；
- 弹出或展开小表单；
- 保存后调用 PATCH；
- 成功后刷新 dashboard 和 history。

### 验收标准

- 修改学习目标后刷新仍存在。
- profile_history 新增 `manual` 来源记录。
- dashboard 中的画像摘要同步变化。

---

## 六、Phase 4：OpenMAIC 回写闭环检查与补强

### 当前已有主线

```text
POST /api/students/{student_id}/interactive-classrooms
GET  /api/students/{student_id}/interactive-classrooms/{job_id}
```

课堂创建时已经会创建：

- ResourcePackage
- InteractiveClassroomJob
- LearningPathStep

### 需要重点检查

OpenMAIC 回写接口是否完整触发：

```text
ResourcePackage
ExerciseSet
ExerciseAttempt
EvaluationRecord
StudentProfileHistory
StudentProfile
LearningPathStep
```

### 需要检查的后端文件

```text
backend/app/api/routes.py
backend/app/services/resource_package_store.py
backend/app/services/student_learning_store.py
```

### 重点查找接口

```text
/api/openmaic/classroom-imports
/api/openmaic/exercise-attempts/imports
```

### 如果缺失，需要补的逻辑

```text
OpenMAIC attempts import
→ package_store.save_attempts_and_evaluation(...)
→ student_learning_store.apply_evaluation(...)
→ profile_history 写入 evaluation
→ learning_path step 更新 done / adjusted
```

### 验收标准

- OpenMAIC 回写作答后，`EvaluationRecord` 真实存在。
- `StudentProfile.knowledge_mastery` 变化。
- `StudentProfileHistory` 增加 `evaluation` 来源记录。
- 对应 `LearningPathStep` 绑定 `evaluation_id`。
- dashboard 展示最新评估和路径状态。

---

## 七、Phase 5：前端状态刷新机制优化

### 当前问题

现在 dashboard 只在部分操作后刷新。

后续应保证以下动作后都刷新：

```text
专业探索成功
画像 PATCH 成功
路径 step PATCH 成功
课堂创建成功
课堂轮询 succeeded
报告生成成功
OpenMAIC 回写后进入 progress 页
```

### 推荐统一函数

在 `App.tsx` 中保留：

```ts
refreshStudentDashboard(studentId)
```

并新增可选扩展：

```ts
refreshStudentBusinessState(studentId)
```

包含：

```text
dashboard
profile/history 可选
learning-path 可选
```

### 验收标准

- 不需要手动刷新页面也能看到最新画像、路径、报告。
- 切换 student_id 后，旧学生数据不会残留。

---

## 八、Phase 6：前端 API 层抽离

### 当前问题

`fetch(...)` 分散在多个组件里：

- `App.tsx`
- `ProgressOverview.tsx`
- `StudentContextRail.tsx`
- `MajorExplorationPanel.tsx`

后面会越来越难维护。

### 推荐新增

```text
frontend/src/api/studentBusiness.ts
```

封装：

```ts
getStudentProfile(studentId)
patchStudentProfile(studentId, payload)
getProfileHistory(studentId, limit)
createExplorationSession(studentId, payload)
getLearningPath(studentId)
patchLearningPathStep(studentId, stepId, payload)
createStudentReport(studentId)
getStudentReport(studentId, reportId)
```

### 验收标准

- 组件中不再直接拼大段 `/api/students/...`。
- 错误处理统一。
- 后续改接口路径只改一个文件。

---

## 九、Phase 7：测试与 smoke 结果文档

### 后端测试

当前已有：

```text
backend/tests/test_student_business_api.py
```

还需要补：

1. OpenMAIC attempts import 后是否 apply_evaluation。
2. learning path step PATCH 找不到 step 时是否 404。
3. report 读取不存在 id 是否 404。
4. profile history limit 参数是否生效。

### 前端手动验收文档

建议新增：

```text
docs/15-student-business-manual-acceptance.md
```

内容记录：

```text
运行时间
后端端口
前端端口
student_id
exploration_session_id
path_id
classroom_job_id
package_id
evaluation_id
report_id
发现的问题
下一步修复
```

### smoke 脚本增强

现有：

```text
scripts/smoke_student_business_api.sh
```

可继续补：

```text
- 校验 /api/exploration/plan 兼容落库
- 校验 profile/history limit
- 校验 report 404
- 校验 path step 404
```

---

## 十、Phase 8：UI 细节优化

### 目标

不是换风格，而是让真实业务数据更清楚。

### 需要优化的地方

#### 1. LearningPath Step 显示

当前路径 step 如果只显示 package_id，不够直观。

应该优先显示：

```text
step.title
step.target_knowledge_id
status
mastery_before → mastery_after
updated_reason
```

#### 2. Profile History 显示

当前只展示 note/source，需要补：

```text
source_type
source_id
created_at
delta 摘要
```

#### 3. Report Markdown 显示

当前用 `<pre>` 可以跑，但更好的做法是：

- 保留 markdown 文本；
- 后续可接 markdown renderer；
- 暂时不要引入太多依赖。

#### 4. 错误提示

所有接口错误需要统一：

```text
接口不可用
数据为空
OpenMAIC 服务不可用
落库成功但课堂失败
```

### 验收标准

- 老师或评委能看懂每一块数据来自哪里。
- 页面能明确区分：探索数据、画像数据、路径数据、评估数据、报告数据。

---

## 十一、推荐执行顺序

### 第一优先级

```text
1. LearningPath Step 手动更新
2. 专业探索显式改调 /exploration-sessions
3. OpenMAIC 回写 apply_evaluation 检查
```

### 第二优先级

```text
4. 画像编辑 PATCH
5. 前端 API 层抽离
6. 状态刷新机制统一
```

### 第三优先级

```text
7. 补 OpenMAIC 回写测试
8. 补 smoke 结果文档
9. UI 细节优化
```

---

## 十二、下一步立刻执行建议

最推荐马上做：

```text
Phase 1：LearningPath Step 手动更新
```

因为这一步能直接闭合验收项：

```text
学习路径必须真实落库
支持查看路径
支持更新路径步骤状态
支持路径调整记录
```

完成后，学生端就不只是“展示路径”，而是能真实写回路径状态。
