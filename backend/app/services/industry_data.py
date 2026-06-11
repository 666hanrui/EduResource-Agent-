"""Local industry data summaries for teacher-side curriculum planning."""

from __future__ import annotations

import os
import re
import zipfile
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from statistics import mean
from xml.etree import ElementTree as ET


DEFAULT_INDUSTRY_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "industry_data"

COURSE_BLUEPRINTS: dict[str, dict] = {
    "程序设计基础": {
        "hours": 64,
        "lessons": 32,
        "roles": ["Java", "C_C++", "前端开发"],
        "industries": ["IT服务", "计算机软件", "互联网", "云计算_大数据"],
        "requirements": ["掌握变量、控制流、函数、调试与基本代码规范", "能把小需求拆成可运行程序"],
        "outcomes": ["能独立完成小型控制台程序", "能讲清楚错误定位过程"],
        "frontier": ["AI 编程助手进入基础编码训练", "更强调读懂报错、评估生成代码与写测试"],
    },
    "离散数学基础": {
        "hours": 48,
        "lessons": 24,
        "roles": ["Java", "C_C++", "测试工程师"],
        "industries": ["IT服务", "网络_信息安全", "人工智能"],
        "requirements": ["理解集合、逻辑、图与递推", "能把抽象约束表达成程序判断"],
        "outcomes": ["能为算法和数据库课程提供形式化基础", "能用逻辑表达需求边界"],
        "frontier": ["图、约束和形式化验证重新进入 AI 系统可靠性议题"],
    },
    "数字逻辑入门": {
        "hours": 48,
        "lessons": 24,
        "roles": ["C_C++", "硬件测试", "测试工程师"],
        "industries": ["智能硬件", "物联网", "电子_半导体_集成电路"],
        "requirements": ["理解二进制、逻辑门、组合与时序电路", "能解释软件运行的底层表示"],
        "outcomes": ["能读懂基础硬件接口与调试现象", "能连接计算机组成课程"],
        "frontier": ["端侧智能和智能硬件岗位要求软件学生理解设备约束"],
    },
    "数据结构": {
        "hours": 64,
        "lessons": 32,
        "roles": ["Java", "C_C++", "软件测试", "前端开发"],
        "industries": ["IT服务", "计算机软件", "云计算_大数据", "网络_信息安全"],
        "requirements": ["掌握线性表、树、图、哈希和复杂度", "能在真实需求中选择合适结构"],
        "outcomes": ["能解释结构选择的原因", "能用代码、图示和测试证明实现正确"],
        "frontier": ["Agent/RAG 系统仍依赖检索、图结构、队列和缓存等基础抽象"],
    },
    "算法基础": {
        "hours": 48,
        "lessons": 24,
        "roles": ["Java", "C_C++", "测试工程师"],
        "industries": ["IT服务", "人工智能", "云计算_大数据"],
        "requirements": ["掌握递归、排序、搜索、动态规划和复杂度分析", "能权衡效率与可维护性"],
        "outcomes": ["能完成常见算法实现与复杂度说明", "能把算法思路转成可讲解步骤"],
        "frontier": ["AI 生成代码提高速度，但算法边界、性能评估和测试仍要人工把关"],
    },
    "计算机组成基础": {
        "hours": 56,
        "lessons": 28,
        "roles": ["C_C++", "技术支持工程师", "实施工程师"],
        "industries": ["计算机硬件", "物联网", "工业自动化"],
        "requirements": ["理解 CPU、内存、I/O 与指令执行", "能解释性能瓶颈和系统资源约束"],
        "outcomes": ["能把代码执行和系统资源联系起来", "能读懂基础性能问题"],
        "frontier": ["端云协同、边缘计算和高性能推理让系统底层知识重新重要"],
    },
    "面向对象程序设计": {
        "hours": 64,
        "lessons": 32,
        "roles": ["Java", "前端开发", "C_C++"],
        "industries": ["IT服务", "计算机软件", "互联网"],
        "requirements": ["掌握类、对象、封装、继承、多态与模块化", "能组织中等规模代码"],
        "outcomes": ["能完成模块化课程项目", "能进行基础重构和接口说明"],
        "frontier": ["大型语言模型生成代码后，结构设计、边界划分和评审能力更关键"],
    },
    "数据库系统": {
        "hours": 56,
        "lessons": 28,
        "roles": ["Java", "实施工程师", "测试工程师"],
        "industries": ["IT服务", "云计算_大数据", "企业服务"],
        "requirements": ["掌握建模、SQL、索引、事务与数据一致性", "能把业务对象落到表结构"],
        "outcomes": ["能设计小系统数据库", "能解释查询和数据质量问题"],
        "frontier": ["RAG、数据治理和企业 AI 应用都要求更强的数据建模意识"],
    },
    "操作系统基础": {
        "hours": 56,
        "lessons": 28,
        "roles": ["Java", "C_C++", "技术支持工程师"],
        "industries": ["IT服务", "云计算_大数据", "网络_信息安全"],
        "requirements": ["理解进程、线程、内存、文件和 Linux 基础", "能定位基础系统问题"],
        "outcomes": ["能使用命令行排查运行环境", "能解释并发和资源问题"],
        "frontier": ["云原生、容器和 AI 推理部署持续提高 Linux/系统能力要求"],
    },
    "软件工程": {
        "hours": 48,
        "lessons": 24,
        "roles": ["Java", "前端开发", "软件测试", "测试工程师"],
        "industries": ["IT服务", "计算机软件", "企业服务"],
        "requirements": ["掌握需求分析、设计、测试、评审和迭代交付", "能进行团队协作"],
        "outcomes": ["能维护团队仓库、任务板和测试记录", "能做项目复盘与文档交付"],
        "frontier": ["Agentic coding 强化需求拆解、工具调用、评测和人类评审闭环"],
    },
    "计算机网络": {
        "hours": 48,
        "lessons": 24,
        "roles": ["实施工程师", "技术支持工程师", "Java"],
        "industries": ["网络_信息安全", "IT服务", "云计算_大数据"],
        "requirements": ["理解 TCP/IP、HTTP、DNS、接口通信和基础安全", "能定位常见网络故障"],
        "outcomes": ["能解释前后端通信链路", "能完成接口联调记录"],
        "frontier": ["API 生态、云服务和安全合规让网络基础成为所有开发岗位底座"],
    },
    "软件测试": {
        "hours": 40,
        "lessons": 20,
        "roles": ["软件测试", "测试工程师", "质量管理_测试"],
        "industries": ["IT服务", "计算机软件", "网络_信息安全"],
        "requirements": ["掌握测试用例、缺陷报告、接口测试和自动化基础", "能推动缺陷闭环"],
        "outcomes": ["能为课程项目建立测试集", "能写清楚复现步骤和风险"],
        "frontier": ["AI 生成测试、质量工程和安全测试正在变成开发流程的一部分"],
    },
    "设计模式": {
        "hours": 32,
        "lessons": 16,
        "roles": ["Java", "前端开发"],
        "industries": ["IT服务", "计算机软件"],
        "requirements": ["理解常见设计模式、职责划分和可维护性", "能识别过度设计"],
        "outcomes": ["能重构一个小模块", "能解释设计取舍"],
        "frontier": ["AI 写代码越快，架构审美、边界控制和可维护性越重要"],
    },
}

KEYWORDS = [
    "Java",
    "Python",
    "Go",
    "C++",
    "JavaScript",
    "TypeScript",
    "Vue",
    "React",
    "Spring",
    "MySQL",
    "Redis",
    "Linux",
    "SQL",
    "Docker",
    "Kubernetes",
    "接口",
    "数据库",
    "系统设计",
    "需求分析",
    "单元测试",
    "自动化测试",
    "文档",
    "沟通",
    "抗压",
    "安全",
]


@dataclass
class _WorkbookRows:
    rows: list[dict[str, str]]


def industry_data_dir() -> Path:
    configured = os.getenv("EDU_INDUSTRY_DATA_DIR")
    return Path(configured).expanduser() if configured else DEFAULT_INDUSTRY_DATA_DIR


def build_teacher_industry_summary(program: str = "software-engineering") -> dict:
    base = industry_data_dir()
    xlsx_files = sorted(base.glob("*/*.xlsx")) if base.exists() else []
    industry_count = len({path.parent.name for path in xlsx_files})
    reports = [_build_course_report(base, course, spec) for course, spec in COURSE_BLUEPRINTS.items()]
    rows_scanned = sum(report["job_sample_count"] for report in reports)

    return {
        "program": program,
        "source": {
            "exists": base.exists(),
            "path": str(base),
            "industry_count": industry_count,
            "workbook_count": len(xlsx_files),
            "rows_scanned": rows_scanned,
            "label": f"行业数据 · {industry_count} 行业 · {len(xlsx_files)} 岗位表",
        },
        "course_reports": reports,
        "external_benchmarks": [
            {
                "source": "BLS OOH",
                "title": "Software Developers, QA Analysts, and Testers",
                "signal": "需求分析、设计、测试、维护和文档是软件岗位共同职责。",
                "url": "https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm",
            },
            {
                "source": "World Economic Forum",
                "title": "Future of Jobs Report 2025",
                "signal": "AI、大数据、网络安全与技术素养持续影响岗位能力结构。",
                "url": "https://www.weforum.org/publications/the-future-of-jobs-report-2025/",
            },
            {
                "source": "GitHub Octoverse",
                "title": "Octoverse 2024",
                "signal": "AI 编程、Python 和开源协作正在改变开发者技能组合。",
                "url": "https://github.blog/news-insights/octoverse/octoverse-2024/",
            },
        ],
    }


def _build_course_report(base: Path, course: str, spec: dict) -> dict:
    selected_files = _select_files(base, spec["industries"], spec["roles"])
    rows: list[dict[str, str]] = []
    for path in selected_files[:12]:
        rows.extend(_read_xlsx_rows(path).rows)

    salaries = [_parse_salary(row.get("薪资范围", "")) for row in rows]
    salaries = [item for item in salaries if item is not None]
    keyword_counts: Counter[str] = Counter()
    role_counts: Counter[str] = Counter()
    industry_counts: Counter[str] = Counter()

    for row in rows:
        detail = " ".join([row.get("岗位详情", ""), row.get("公司详情", "")])
        for keyword in KEYWORDS:
            if keyword.lower() in detail.lower():
                keyword_counts[keyword] += 1
        if row.get("岗位名称"):
            role_counts[row["岗位名称"]] += 1
        if row.get("所属行业"):
            industry_counts[row["所属行业"]] += 1

    return {
        "course": course,
        "hours": spec["hours"],
        "lessons": spec["lessons"],
        "requirements": spec["requirements"],
        "student_outcomes": spec["outcomes"],
        "frontier_signals": spec["frontier"],
        "job_sample_count": len(rows),
        "source_files": [f"{path.parent.name}/{path.name}" for path in selected_files[:6]],
        "industries": [name for name, _ in industry_counts.most_common(4)] or spec["industries"][:4],
        "roles": [name for name, _ in role_counts.most_common(4)] or spec["roles"][:4],
        "top_keywords": [name for name, _ in keyword_counts.most_common(8)],
        "salary": _salary_summary(salaries),
    }


def _select_files(base: Path, industries: list[str], roles: list[str]) -> list[Path]:
    if not base.exists():
        return []
    files: list[Path] = []
    for industry in industries:
        for role in roles:
            path = base / industry / f"{role}.xlsx"
            if path.exists():
                files.append(path)
    if files:
        return files
    return [path for path in sorted(base.glob("*/*.xlsx")) if path.stem in set(roles)]


@lru_cache(maxsize=256)
def _read_xlsx_rows(path: Path) -> _WorkbookRows:
    if not path.exists():
        return _WorkbookRows([])
    try:
        with zipfile.ZipFile(path) as archive:
            shared = _read_shared_strings(archive)
            sheet_name = _first_sheet_path(archive)
            root = ET.fromstring(archive.read(sheet_name))
    except Exception:
        return _WorkbookRows([])

    rows: list[list[str]] = []
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    for row in root.iter(f"{ns}row"):
        values: list[str] = []
        for cell in row.iter(f"{ns}c"):
            values.append(_cell_value(cell, shared, ns))
        if any(values):
            rows.append(values)
    if not rows:
        return _WorkbookRows([])
    headers = [header.strip() for header in rows[0]]
    data = [
        {headers[index]: value for index, value in enumerate(row) if index < len(headers)}
        for row in rows[1:]
    ]
    return _WorkbookRows(data)


def _read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    values: list[str] = []
    for item in root.iter(f"{ns}si"):
        values.append("".join(text.text or "" for text in item.iter(f"{ns}t")))
    return values


def _first_sheet_path(archive: zipfile.ZipFile) -> str:
    try:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    except KeyError:
        return "xl/worksheets/sheet1.xml"
    rel_ns = "{http://schemas.openxmlformats.org/package/2006/relationships}"
    book_ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    relationship_id = None
    sheet = next(workbook.iter(f"{book_ns}sheet"), None)
    if sheet is not None:
        relationship_id = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    if relationship_id:
        for rel in rels.iter(f"{rel_ns}Relationship"):
            if rel.attrib.get("Id") == relationship_id:
                target = rel.attrib.get("Target", "worksheets/sheet1.xml")
                normalized = target.lstrip("/")
                if normalized.startswith("xl/"):
                    return normalized
                return f"xl/{normalized}"
    return "xl/worksheets/sheet1.xml"


def _cell_value(cell: ET.Element, shared: list[str], ns: str) -> str:
    value_node = cell.find(f"{ns}v")
    if value_node is None or value_node.text is None:
        inline = cell.find(f"{ns}is")
        if inline is None:
            return ""
        return "".join(text.text or "" for text in inline.iter(f"{ns}t")).strip()
    raw = value_node.text
    if cell.attrib.get("t") == "s":
        try:
            return shared[int(raw)].strip()
        except (ValueError, IndexError):
            return ""
    return raw.strip()


def _parse_salary(value: str) -> tuple[int, int] | None:
    text = value.replace(",", "").strip()
    if not text:
        return None
    if "/天" in text or "每天" in text:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(万|千|元)?", text)
    if not match:
        return None
    low = float(match.group(1))
    high = float(match.group(2))
    unit = match.group(3) or ("万" if "万" in text else "元")
    multiplier = 10000 if unit == "万" else 1000 if unit == "千" else 1
    parsed = int(low * multiplier), int(high * multiplier)
    if parsed[1] < 1000:
        return None
    return parsed


def _salary_summary(salaries: list[tuple[int, int]]) -> dict:
    if not salaries:
        return {"label": "样本不足", "min": None, "max": None, "average": None}
    low = min(item[0] for item in salaries)
    high = max(item[1] for item in salaries)
    avg = int(mean((item[0] + item[1]) / 2 for item in salaries))
    return {
        "label": f"{_format_salary(low)}-{_format_salary(high)}/月",
        "min": low,
        "max": high,
        "average": avg,
    }


def _format_salary(value: int) -> str:
    return f"{value / 10000:.1f}万".replace(".0", "") if value >= 10000 else f"{value // 1000}k"
