# 下一阶段执行计划

> 本计划接在 `docs/10-remediation-plan.md` 之后，用来继续推进当前已经开始的整改工作。当前已经完成老师端真实接口核查、OpenMAIC fallback 初步实现，并对 `routes.py` 中途截断问题进行了恢复。下一阶段的重点不是继续堆概念，而是先把当前改动稳定下来，再继续做 PPTX 降级、ToolCalling 边界、测试和轻量索引。

## 当前状态快照

| 模块 | 状态 | 说明 |
|------|------|------|
| P0-1 老师端 Dashboard 接入 | 已核查 | 老师端已经通过 `useTeacherRemoteData` 请求 `/api/teachers/{teacher_id}/dashboard` |
| P0-2 老师端教学包生成接口 | 已核查 | 老师端生成已经走 `/api/teachers/{teacher_id}/classes/{class_id}/teaching-packages` |
| P1-1 OpenMAIC fallback | 已实现 | 新增 `EDU_OPENMAIC_FALLBACK=1` 开关和本地 OpenMAIC 兼容课堂构造器 |
| routes.py 中途截断风险 | 已恢复但需复检 | 已恢复完整路由文件，但下一阶段必须优先做接口完整性检查 |
| P1-2 PPTX 健康检查与 Markdown 降级 | 未开始 | 下一项核心任务 |
| P1-3 ToolCalling 演示边界 | 未开始 | 需要文档和接口说明收口 |
| P2 SQLite 轻量索引 | 未开始 | 后续增强，不抢主演示链路 |

---

## 阶段 0：先做安全复检

### 目标

确认刚才对 `routes.py`、`openmaic_client.py` 的改动没有破坏现有 API 入口。

### 涉及文件

- `backend/app/api/routes.py`
- `backend/app/services/openmaic_client.py`
- `backend/tests/test_student_interactive_classrooms.py`
- `backend/tests/test_teacher_routes.py`
- `backend/tests/test_openmaic_import.py`

### 执行步骤

1. 检查 `routes.py` 是否仍包含以下接口：
   - `GET /api/health`
   - `POST /api/students/{student_id}/interactive-classrooms`
   - `GET /api/students/{student_id}/interactive-classrooms/{job_id}`
   - `GET /api/students/{student_id}/dashboard`
   - `POST /api/integrations/openmaic/resource-package`
   - `POST /api/integrations/openmaic/exercise-attempts`
   - `GET /api/resource-packages/{package_id}`
   - `GET /api/resource-packages/{package_id}/attempts`
   - `POST /api/exploration/plan`
   - `GET /api/teachers/{teacher_id}/dashboard`
   - `POST /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages`
   - `GET /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages/{job_id}`
   - `GET /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages/{package_id}/pptx`
   - `POST /api/generate`
   - `POST /api/generate/tool-calling`
   - `GET /api/tasks/{task_id}/results`
   - `GET /api/tasks/{task_id}/events`
   - `POST /api/chat`

2. 检查两个 helper 是否存在：
   - `_serialize_outputs`
   - `_teacher_store_http_error`

3. 检查 OpenMAIC fallback 是否只在环境变量开启时生效：
   - 默认不开启 fallback，OpenMAIC 失败仍返回 502
   - 设置 `EDU_OPENMAIC_FALLBACK=1` 后，本地生成课堂并返回 `succeeded`

4. 补一个测试用例：
   - mock OpenMAICClient 抛异常
   - 设置 fallback env
   - 调用学生互动课堂创建接口
   - 断言返回 `succeeded`
   - 断言 package 可通过 `/api/resource-packages/{package_id}` 读取

### 验收标准

- 现有老师端测试不挂
- 现有 OpenMAIC 导入测试不挂
- 新增 fallback 测试通过
- `routes.py` 不再出现半截覆盖问题

---

## 阶段 1：PPTX 导出健康检查

### 当前问题

老师端 PPTX 导出依赖外部 `apps/ppt-master`，如果部署环境缺少 exporter 或 `python-pptx`，接口会直接报错。当前错误虽然能返回 502，但诊断信息不够产品化。

### 涉及文件

- `backend/app/services/ppt_master_service.py`
- `backend/app/api/routes.py`
- `backend/tests/test_teacher_routes.py`

### 实施步骤

1. 在 `ppt_master_service.py` 中新增：

```py
check_ppt_master_status() -> dict
```

返回内容建议：

```json
{
  "ok": true,
  "ppt_master_root": "...",
  "ppt_master_root_exists": true,
  "exporter": ".../svg_to_pptx.py",
  "exporter_exists": true,
  "python": "...",
  "python_ok": true,
  "python_pptx_available": true,
  "export_root": "...",
  "export_root_writable": true,
  "errors": []
}
```

2. 在 `routes.py` 中新增接口：

```http
GET /api/teachers/export/pptx/status
```

3. 接口只做诊断，不触发实际 PPTX 生成。

4. 如果缺少环境，不抛 500，而是返回：

```json
{
  "ok": false,
  "errors": ["PPT Master exporter not found: ..."]
}
```

### 验收标准

- 正常环境下 `ok=true`
- 缺少 `apps/ppt-master` 时 `ok=false` 且返回清楚错误
- 不影响原 PPTX 导出接口

---

## 阶段 2：Markdown 教案降级导出

### 当前问题

PPTX 导出失败时，老师端没有可用的教学包文件输出。演示现场如果环境不完整，会影响展示闭环。

### 涉及文件

- `backend/app/services/ppt_master_service.py`
- `backend/app/api/routes.py`
- `backend/tests/test_teacher_routes.py`

### 实施步骤

1. 在 `ppt_master_service.py` 中新增：

```py
build_teacher_lesson_markdown(
    *,
    package_id: str,
    title: str,
    target_knowledge_name: str,
    teaching_goal: str,
    target_student_id: str | None,
    results: dict[str, Any],
) -> PPTMasterExport
```

2. 复用 `_build_slides(...)` 的 slide 数据，生成一个 Markdown 教案。

3. Markdown 结构建议：

```md
# 教学包标题

- 知识点：xxx
- 教学目标：xxx
- 目标学生：xxx

## 1. 课时目标
...

## 2. 核心概念
...

## 3. 步骤拆解
...

## 4. 课堂检测
...

## 5. 课后回收
...
```

4. 在 `routes.py` 中新增接口：

```http
GET /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages/{package_id}/lesson-plan.md
```

5. 这个接口不依赖 `apps/ppt-master`，只依赖已生成好的 package results。

### 验收标准

- 即使没有 ppt-master，也能导出 `.md`
- 老师端教学包 ready 后能下载 Markdown 教案
- Markdown 内容包含目标、知识点、讲解、练习、收束建议

---

## 阶段 3：PPTX 失败时提供降级路径

### 当前问题

前端目前只知道 PPTX 导出成功或失败，不知道失败后可以拿 Markdown 教案。

### 涉及文件

- `frontend/src/components/TeacherPortal/index.tsx`
- `frontend/src/components/TeacherPortal/desks.tsx`
- `backend/app/api/routes.py`

### 实施步骤

1. 后端保留 PPTX 原接口，不自动改成 Markdown，避免前端误判文件类型。

2. 前端导出 PPTX 失败时，在错误提示里显示：

```text
PPTX 环境不可用，可下载 Markdown 教案作为降级产物。
```

3. Review / TalentSystem 区域增加一个“导出 Markdown 教案”按钮。

4. 下载接口：

```http
GET /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages/{package_id}/lesson-plan.md
```

### 验收标准

- PPTX 失败后页面不只显示报错，还能下载 Markdown
- PPTX 成功时不影响原下载路径
- 评委演示时至少有一个稳定文件可导出

---

## 阶段 4：ToolCallingFlow 演示边界收口

### 当前问题

`/api/generate/tool-calling` 适合展示 MainAgent 自主调度，但不适合作为主演示链路，因为它更依赖模型输出稳定性。

### 涉及文件

- `README.md`
- `docs/09-current-system-architecture.md`
- `docs/10-remediation-plan.md`
- `backend/app/agents/orchestrator.py`
- `backend/app/api/routes.py`

### 实施步骤

1. 在文档中明确三句话：
   - 正式演示默认使用教师教学包接口和固定 GenerateFlow
   - ToolCallingFlow 是增强展示模式
   - 未注入 LLM service 时会自动降级为 GenerateFlow

2. 在 `/api/generate/tool-calling` 返回或文档中标明 fallback 行为。

3. 如果前端未来展示 ToolCalling，需要放在“实验模式 / Advanced”入口，不放主演示按钮。

### 验收标准

- 答辩主路径不依赖 ToolCallingFlow
- ToolCallingFlow 出错不影响老师端教学包生成
- README 和架构文档定位一致

---

## 阶段 5：测试补齐

### 当前问题

本轮改动涉及 fallback、teacher routes、PPTX export，必须有最小测试兜底，避免后续继续改时再次破坏主链路。

### 涉及文件

- `backend/tests/test_student_interactive_classrooms.py`
- `backend/tests/test_teacher_routes.py`
- `backend/tests/test_openmaic_import.py`
- `backend/tests/test_generate_orchestration.py`

### 新增/补充测试

1. OpenMAIC fallback 测试：
   - OpenMAICClient 抛异常
   - `EDU_OPENMAIC_FALLBACK=1`
   - 创建课堂返回 `succeeded`
   - resource package 可读取

2. OpenMAIC fallback 关闭测试：
   - OpenMAICClient 抛异常
   - 未设置 fallback
   - 创建课堂返回 502

3. PPTX status 测试：
   - mock 不存在的 `PPT_MASTER_ROOT`
   - status 返回 `ok=false`

4. Markdown lesson plan 测试：
   - 使用 seed package 或 mock package results
   - 调用 lesson-plan.md
   - 返回 `text/markdown`

5. 老师端教学包主链路测试：
   - 创建 teacher package job
   - 轮询 job
   - 确认生成 task id 存在

### 验收标准

- 后端最小测试覆盖学生课堂 fallback、老师教学包、PPTX 诊断、Markdown 导出
- 后续修改 `routes.py` 时能尽早暴露断路问题

---

## 阶段 6：SQLite 轻量索引

### 当前问题

当前大量状态存在 JSON payload 里，开发快但统计弱。这个不影响当前演示，所以排在 P2。

### 涉及文件

- `backend/app/services/resource_package_store.py`
- `backend/app/services/student_learning_store.py`
- `backend/app/services/teacher_store.py`

### 实施步骤

1. 新增索引表：

```sql
student_mastery_index(student_id, knowledge_id, mastery, updated_at)
teacher_risk_index(teacher_id, class_id, student_id, knowledge_id, risk, mastery, updated_at)
package_index(package_id, owner_id, owner_role, target_knowledge_id, status, updated_at)
```

2. 保存 profile/package/snapshot 时同步写索引。

3. 新增统计查询接口：

```http
GET /api/teachers/{teacher_id}/analytics/knowledge-risk
GET /api/students/{student_id}/analytics/mastery
```

### 验收标准

- 不破坏现有 JSON 存储
- Dashboard 可直接查询知识点风险和学生掌握度趋势
- 初赛演示不依赖此项，作为后续增强

---

## 推荐执行顺序

### 第一批：马上做

1. 安全复检 `routes.py`
2. 增加 OpenMAIC fallback 测试
3. PPTX status check
4. Markdown lesson plan 导出

### 第二批：演示稳定性

1. 前端增加 Markdown 导出按钮
2. PPTX 失败提示降级路径
3. ToolCallingFlow 文档收口
4. README 演示路径补充

### 第三批：工程增强

1. SQLite 轻量索引
2. 教师 analytics 接口
3. 学生 mastery analytics 接口
4. 更完整的 CI 测试链路

---

## 下一步实际执行任务

下一条应执行：

```text
阶段 0：安全复检 + OpenMAIC fallback 测试
```

完成后再进入：

```text
阶段 1：PPTX 导出健康检查
阶段 2：Markdown 教案降级导出
```
