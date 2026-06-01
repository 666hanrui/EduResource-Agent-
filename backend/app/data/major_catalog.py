"""Professional exploration catalog.

The first imported module was career-planning oriented, so it assumed a target job.
This catalog keeps the useful role-profile idea while making the entry point a
major/discipline map that works for freshmen.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ResourceSource:
    source_key: str
    source_name: str
    logo_hint: str
    url_template: str
    resource_type: str
    quality_score: int
    best_for: tuple[str, ...]


@dataclass(frozen=True)
class CareerProfile:
    title: str
    direction: str
    core_skills: tuple[str, ...]
    typical_tasks: tuple[str, ...]
    dimension_weights: dict[str, int]
    evidence_suggestions: tuple[str, ...]


@dataclass(frozen=True)
class MajorTemplate:
    aliases: tuple[str, ...]
    foundations: tuple[str, ...]
    core: tuple[str, ...]
    directions: tuple[str, ...]
    practice: tuple[str, ...]
    career_profiles: tuple[CareerProfile, ...]
    tools: tuple[str, ...]

    @property
    def careers(self) -> tuple[str, ...]:
        return tuple(item.title for item in self.career_profiles)


COMPUTER_TEMPLATE = MajorTemplate(
    aliases=("计算机", "软件", "人工智能", "数据科学", "网络工程", "信息安全"),
    foundations=("程序设计基础", "离散数学", "高等数学", "计算机导论"),
    core=("数据结构", "计算机组成原理", "操作系统", "数据库系统", "计算机网络"),
    directions=("Web 开发", "数据分析", "AI 应用", "软件测试", "信息安全"),
    practice=("命令行与 Git", "小型管理系统", "算法练习", "开源项目阅读"),
    tools=("Python", "Java", "SQL", "Git"),
    career_profiles=(
        CareerProfile(
            title="软件工程师",
            direction="Web 开发",
            core_skills=("程序设计基础", "数据结构", "数据库系统", "Git", "API 联调"),
            typical_tasks=("实现业务功能", "调试接口", "编写单元测试", "维护技术文档"),
            dimension_weights={
                "professional_skills": 30,
                "problem_solving": 25,
                "learning_ability": 20,
                "documentation_awareness": 15,
                "teamwork": 10,
            },
            evidence_suggestions=("完成一个可运行小项目", "写一份接口调试记录", "提交一次代码复盘"),
        ),
        CareerProfile(
            title="数据分析师",
            direction="数据分析",
            core_skills=("统计学", "SQL", "Python", "数据可视化", "业务理解"),
            typical_tasks=("清洗数据", "制作指标看板", "解释异常波动", "输出分析结论"),
            dimension_weights={
                "professional_skills": 25,
                "professional_background": 20,
                "problem_solving": 25,
                "communication": 15,
                "documentation_awareness": 15,
            },
            evidence_suggestions=("做一个公开数据集分析", "解释 3 个指标含义", "输出一页分析报告"),
        ),
        CareerProfile(
            title="AI 应用工程师",
            direction="AI 应用",
            core_skills=("Python", "机器学习基础", "Prompt 设计", "API 调用", "数据处理"),
            typical_tasks=("调用模型接口", "评估生成质量", "构建 AI 小工具", "整理失败案例"),
            dimension_weights={
                "professional_skills": 25,
                "learning_ability": 25,
                "problem_solving": 20,
                "documentation_awareness": 15,
                "stress_adaptability": 15,
            },
            evidence_suggestions=("做一个 AI 助手原型", "记录 5 个失败样例", "比较两种提示词效果"),
        ),
        CareerProfile(
            title="测试工程师",
            direction="软件测试",
            core_skills=("测试用例设计", "缺陷定位", "自动化测试", "接口测试", "质量意识"),
            typical_tasks=("设计测试场景", "复现缺陷", "编写自动化脚本", "推动问题闭环"),
            dimension_weights={
                "problem_solving": 25,
                "responsibility": 20,
                "documentation_awareness": 20,
                "communication": 15,
                "professional_skills": 20,
            },
            evidence_suggestions=("给一个小系统写测试用例", "复盘一个 bug", "整理缺陷报告"),
        ),
        CareerProfile(
            title="产品经理",
            direction="产品与运营",
            core_skills=("需求分析", "用户访谈", "原型设计", "数据分析", "沟通表达"),
            typical_tasks=("梳理用户问题", "写需求文档", "协调研发测试", "观察数据反馈"),
            dimension_weights={
                "communication": 25,
                "problem_solving": 20,
                "documentation_awareness": 20,
                "teamwork": 20,
                "learning_ability": 15,
            },
            evidence_suggestions=("拆解一个 App 功能", "写一页需求说明", "访谈 2 位同学"),
        ),
    ),
)

ELECTRONICS_TEMPLATE = MajorTemplate(
    aliases=("电子", "通信", "自动化", "物联网", "电气"),
    foundations=("高等数学", "大学物理", "电路基础", "工程制图"),
    core=("模拟电子技术", "数字电子技术", "信号与系统", "嵌入式系统", "通信原理"),
    directions=("嵌入式开发", "智能硬件", "通信网络", "工业自动化", "物联网应用"),
    practice=("单片机实验", "传感器采集", "电路仿真", "硬件调试记录"),
    tools=("C 语言", "Keil", "Matlab", "Arduino"),
    career_profiles=(
        CareerProfile(
            title="嵌入式工程师",
            direction="嵌入式开发",
            core_skills=("C 语言", "单片机", "传感器", "调试工具", "硬件接口"),
            typical_tasks=("读取传感器数据", "调试通信协议", "定位硬件问题", "记录实验现象"),
            dimension_weights={"professional_skills": 30, "problem_solving": 25, "stress_adaptability": 15, "documentation_awareness": 15, "learning_ability": 15},
            evidence_suggestions=("完成一次单片机实验", "记录调试过程", "解释一个传感器数据流"),
        ),
        CareerProfile(
            title="硬件工程师",
            direction="智能硬件",
            core_skills=("电路基础", "模拟电子", "PCB 阅读", "仪器使用", "实验记录"),
            typical_tasks=("阅读电路图", "测量关键节点", "排查硬件异常", "整理测试报告"),
            dimension_weights={"professional_background": 25, "professional_skills": 25, "problem_solving": 20, "documentation_awareness": 20, "responsibility": 10},
            evidence_suggestions=("画一张电路模块图", "完成一次测量记录", "复盘一个实验异常"),
        ),
        CareerProfile(
            title="自动化工程师",
            direction="工业自动化",
            core_skills=("控制原理", "PLC", "传感器", "数据采集", "系统联调"),
            typical_tasks=("设计控制流程", "配置采集点", "联调设备", "处理现场异常"),
            dimension_weights={"problem_solving": 25, "teamwork": 20, "stress_adaptability": 20, "professional_skills": 20, "responsibility": 15},
            evidence_suggestions=("拆解一个自动控制场景", "做一次传感器采集", "写一份联调清单"),
        ),
        CareerProfile(
            title="通信工程师",
            direction="通信网络",
            core_skills=("通信原理", "网络协议", "信号分析", "链路预算", "故障排查"),
            typical_tasks=("分析网络指标", "排查链路故障", "配置通信设备", "输出优化建议"),
            dimension_weights={"professional_background": 25, "professional_skills": 20, "problem_solving": 25, "communication": 15, "documentation_awareness": 15},
            evidence_suggestions=("解释一个通信链路", "记录一次网络诊断", "输出一页优化建议"),
        ),
    ),
)

BUSINESS_TEMPLATE = MajorTemplate(
    aliases=("经管", "管理", "工商", "市场", "会计", "金融"),
    foundations=("管理学原理", "经济学基础", "统计学", "会计学基础"),
    core=("市场营销", "组织行为学", "财务管理", "商业分析", "运营管理"),
    directions=("产品运营", "市场分析", "财务分析", "人力资源", "商业数据分析"),
    practice=("商业案例拆解", "问卷调研", "数据看板", "竞品分析报告"),
    tools=("Excel", "SQL", "Power BI", "问卷工具"),
    career_profiles=(
        CareerProfile(
            title="产品运营",
            direction="产品运营",
            core_skills=("用户理解", "活动策划", "数据分析", "内容表达", "协作推进"),
            typical_tasks=("策划活动", "分析转化数据", "整理用户反馈", "推动迭代"),
            dimension_weights={"communication": 25, "problem_solving": 20, "teamwork": 20, "documentation_awareness": 15, "learning_ability": 20},
            evidence_suggestions=("拆解一次运营活动", "做一个用户反馈表", "输出一页复盘"),
        ),
        CareerProfile(
            title="商业分析师",
            direction="商业数据分析",
            core_skills=("统计学", "SQL", "Excel", "行业研究", "表达汇报"),
            typical_tasks=("分析经营指标", "搭建数据表", "解释业务波动", "写分析报告"),
            dimension_weights={"professional_skills": 25, "problem_solving": 25, "communication": 20, "documentation_awareness": 20, "professional_background": 10},
            evidence_suggestions=("做一份行业数据分析", "复盘一个商业案例", "制作一张指标看板"),
        ),
        CareerProfile(
            title="市场专员",
            direction="市场分析",
            core_skills=("市场调研", "用户访谈", "竞品分析", "内容策划", "数据反馈"),
            typical_tasks=("调研目标用户", "整理竞品卖点", "策划传播内容", "评估投放效果"),
            dimension_weights={"communication": 25, "learning_ability": 20, "documentation_awareness": 20, "teamwork": 15, "problem_solving": 20},
            evidence_suggestions=("完成 3 个竞品拆解", "做 5 份问卷反馈", "写一份市场观察"),
        ),
        CareerProfile(
            title="财务分析师",
            direction="财务分析",
            core_skills=("会计基础", "财务管理", "Excel", "预算分析", "风险意识"),
            typical_tasks=("整理财务数据", "分析费用结构", "追踪预算执行", "输出风险提示"),
            dimension_weights={"professional_background": 25, "professional_skills": 25, "responsibility": 20, "documentation_awareness": 20, "problem_solving": 10},
            evidence_suggestions=("拆解一张财报", "做一份预算表", "解释一个财务指标"),
        ),
    ),
)

DEFAULT_TEMPLATE = MajorTemplate(
    aliases=(),
    foundations=("专业导论", "高等数学", "大学英语", "信息检索"),
    core=("专业核心概论", "研究方法", "数据分析基础", "项目实践"),
    directions=("专业应用方向", "数字化交叉方向", "行业研究方向", "产品与运营方向"),
    practice=("课程笔记整理", "案例拆解", "小组展示", "资料检索报告"),
    tools=("Excel", "Markdown", "AI 检索", "演示文稿"),
    career_profiles=(
        CareerProfile(
            title="行业研究助理",
            direction="行业研究方向",
            core_skills=("信息检索", "资料整理", "结构化表达", "数据分析基础", "访谈记录"),
            typical_tasks=("收集行业资料", "整理观点卡片", "比较案例", "输出研究摘要"),
            dimension_weights={"documentation_awareness": 25, "learning_ability": 25, "problem_solving": 20, "communication": 15, "professional_background": 15},
            evidence_suggestions=("整理 5 篇资料卡片", "输出一页行业摘要", "记录一次访谈"),
        ),
        CareerProfile(
            title="产品运营",
            direction="产品与运营方向",
            core_skills=("用户理解", "内容表达", "数据反馈", "协作推进", "复盘意识"),
            typical_tasks=("整理用户反馈", "策划小活动", "观察数据", "推动改进"),
            dimension_weights={"communication": 25, "teamwork": 20, "learning_ability": 20, "documentation_awareness": 20, "problem_solving": 15},
            evidence_suggestions=("拆解一个产品功能", "做一次用户访谈", "写一页复盘"),
        ),
        CareerProfile(
            title="项目助理",
            direction="专业应用方向",
            core_skills=("任务拆解", "进度跟踪", "文档整理", "沟通同步", "风险提醒"),
            typical_tasks=("维护任务清单", "整理会议纪要", "跟进交付物", "同步进度"),
            dimension_weights={"responsibility": 25, "teamwork": 25, "documentation_awareness": 20, "communication": 15, "problem_solving": 15},
            evidence_suggestions=("维护一周任务板", "写一份会议纪要", "复盘一次延期原因"),
        ),
    ),
)

TEMPLATES: tuple[MajorTemplate, ...] = (
    COMPUTER_TEMPLATE,
    ELECTRONICS_TEMPLATE,
    BUSINESS_TEMPLATE,
)


RESOURCE_SOURCES: tuple[ResourceSource, ...] = (
    ResourceSource(
        source_key="bilibili",
        source_name="Bilibili",
        logo_hint="B",
        url_template="https://search.bilibili.com/all?keyword={query}",
        resource_type="video",
        quality_score=82,
        best_for=("入门", "演示", "实验", "可视化", "教程"),
    ),
    ResourceSource(
        source_key="mooc",
        source_name="中国大学 MOOC",
        logo_hint="MOOC",
        url_template="https://www.icourse163.org/search.htm?search={query}",
        resource_type="course",
        quality_score=90,
        best_for=("课程", "基础", "核心", "系统学习", "大学"),
    ),
    ResourceSource(
        source_key="github",
        source_name="GitHub",
        logo_hint="GH",
        url_template="https://github.com/search?q={query}",
        resource_type="article",
        quality_score=78,
        best_for=("项目", "代码", "Git", "开源", "实践"),
    ),
    ResourceSource(
        source_key="zhihu",
        source_name="知乎",
        logo_hint="知",
        url_template="https://www.zhihu.com/search?type=content&q={query}",
        resource_type="article",
        quality_score=72,
        best_for=("经验", "方向", "职业", "案例", "方法"),
    ),
)
