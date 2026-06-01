# 数字人全功能操作规划

## 当前检查结论

截至当前远端 `origin/main`，数字人尚未合入主干；但 PR #1 `数字人` 已存在：

- PR 引用：`refs/pull/1/head`
- 关键提交：`9417741 增加了悬浮数字人和对于数字人的使用方法`
- 合并提交：`bb7d599`
- 主要新增：
  - `frontend/src/components/TutorFloatingBall/`
  - `frontend/src/components/TutorLivePanel/`
  - `frontend/public/live2d/haru/`
  - `frontend/public/live2dcubismcore.min.js`
  - `pixi.js`、`pixi-live2d-display`
  - `POST /api/chat`

当前 PR 的数字人能力是“可视化助教 + 聊天问答”：能展示 Live2D、拖拽、口型动效、向 `/api/chat` 发消息；但它还不能直接操作系统功能。要让数字人操作全部功能，需要把它从“聊天组件”升级为“Action Operator”。

## 产品定位

数字人不是新业务模块，而是 EduResource-Agent 的“自然语言操作层”：

```text
学生语音/文本
  -> 数字人意图识别
  -> Action Catalog 查询可执行动作
  -> 参数补齐/二次确认
  -> 调用现有 REST API 或前端导航
  -> 播报结果 + 高亮相关 UI
```

核心原则：

- 不让数字人直接改 React state 或数据库。
- 所有业务动作必须走现有 API。
- 写操作必须有参数校验；高风险动作要二次确认。
- 数字人播报内容来自真实接口返回，避免“说了但没做”。

## 已落地协议

后端新增：

```text
GET /api/digital-human/actions
```

返回数字人可执行动作列表，包括：

- `action_id`
- `title`
- `domain`
- `description`
- `method`
- `endpoint`
- `required_params`
- `optional_params`
- `risk`
- `confirmation_required`
- `success_feedback`

## 可操作功能覆盖

| 功能域 | 数字人动作 | 对应能力 |
|---|---|---|
| 导航 | `nav.open_exploration` | 打开专业探索 |
| 导航 | `nav.open_generator` | 打开资源生成 |
| 专业探索 | `exploration.build_plan` | 生成 12 维画像、知识地图、方向推荐 |
| 专业探索 | `exploration.create_workspace` | 收藏方向并创建路径工作区 |
| 工作区 | `workspace.toggle_task` | 任务完成/取消完成 |
| 工作区 | `workspace.update_profile` | 编辑 12 维画像关键词 |
| 工作区 | `workspace.update_resource` | 打开/完成学习资源 |
| 工作区 | `workspace.add_review` | 保存周/月复盘 |
| 工作区 | `workspace.ask_coach` | 询问探索教练 |
| 资源生成 | `generation.start` | 启动 7-Agent 全 DAG 资源生成 |
| 报告 | `report.build` | 生成成长报告 |
| 报告 | `report.save_draft` | 保存报告编辑稿 |
| 报告 | `report.export` | 导出 Markdown/HTML 报告 |

## 前端接入方案

新增 `DigitalHumanPanel`，建议固定在右下角或作为右侧 AgentTracePanel 上方的折叠层。

组件职责：

- 拉取 `/api/digital-human/actions`
- 展示数字人状态：待命、理解中、需要确认、执行中、完成、失败
- 接收文本或语音识别结果
- 将意图映射到 `action_id`
- 补齐参数，例如当前 `studentId`、`workspaceId`、`knowledgeId`
- 触发业务动作
- 播报 `success_feedback` 或错误原因

前端需要维护一个 `DigitalHumanContext`：

```ts
interface DigitalHumanContext {
  activeModule: 'exploration' | 'generator';
  studentId: string;
  currentPlan?: ExplorationPlan;
  currentWorkspace?: ExplorationWorkspace;
  currentKnowledge?: { knowledge_id: string; knowledge_name: string };
  currentTaskId?: string;
}
```

## 意图到动作示例

| 用户说法 | 动作 | 参数来源 |
|---|---|---|
| “帮我生成软件工程的探索计划” | `exploration.build_plan` | major=软件工程 |
| “收藏第一个方向，开始路径” | `exploration.create_workspace` | currentPlan + first direction |
| “把这个任务标记完成” | `workspace.toggle_task` | currentWorkspace + selected task |
| “我学完这个资源了” | `workspace.update_resource` | selected resource |
| “问问教练我下一步做什么” | `workspace.ask_coach` | currentWorkspace |
| “用这个知识点生成学习资源” | `generation.start` | selected knowledge |
| “导出我的成长报告” | `report.export` | currentWorkspace + format |

## 二次确认规则

必须确认：

- 创建工作区
- 修改画像关键词
- 修改任务状态
- 保存复盘
- 启动 7-Agent 生成
- 保存报告编辑稿
- 导出报告或打开外链

无需确认：

- 打开页面
- 查询 action catalog
- 生成教练建议
- 生成/查看成长报告

## 后续落地步骤

1. 前端新增 `DigitalHumanPanel` 与 `DigitalHumanContext`。
2. 接入文本命令输入，先不做语音。
3. 实现本地规则意图识别：关键词匹配到 `action_id`。
4. 接入浏览器语音识别与 TTS。
5. 接入数字人形象渲染组件。
6. 将规则意图识别替换为 LLM function calling，但仍只允许调用 action catalog 中的动作。
7. 对每个 action 增加前端 E2E 测试，确保数字人说到做到。
