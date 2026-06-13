"""PPT Master integration for teacher slide deck exports."""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class PPTMasterExportError(RuntimeError):
    """Raised when the PPT Master export pipeline cannot produce a PPTX."""


@dataclass(frozen=True)
class PPTMasterExport:
    path: Path
    filename: str


def check_ppt_master_status() -> dict[str, Any]:
    """Return a non-throwing diagnostic snapshot for PPT Master exports."""

    errors: list[str] = []
    ppt_master_root = _ppt_master_root()
    exporter = ppt_master_root / "skills" / "ppt-master" / "scripts" / "svg_to_pptx.py"
    export_root = _export_root()

    ppt_master_root_exists = ppt_master_root.exists()
    exporter_exists = exporter.is_file()
    export_root_writable = False
    python_ok = False
    python_pptx_available = False
    python_executable: str | None = None

    if not ppt_master_root_exists:
        errors.append(f"PPT Master root not found: {ppt_master_root}")
    if not exporter_exists:
        errors.append(f"PPT Master exporter not found: {exporter}")

    try:
        export_root.mkdir(parents=True, exist_ok=True)
        probe = export_root / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        export_root_writable = True
    except Exception as exc:  # pragma: no cover - platform dependent
        errors.append(f"PPT export root is not writable: {export_root} ({exc})")

    try:
        python_executable = _ppt_master_python()
        python_ok = True
        python_pptx_available = True
    except PPTMasterExportError as exc:
        errors.append(str(exc))

    return {
        "ok": not errors,
        "ppt_master_root": str(ppt_master_root),
        "ppt_master_root_exists": ppt_master_root_exists,
        "exporter": str(exporter),
        "exporter_exists": exporter_exists,
        "python": python_executable,
        "python_ok": python_ok,
        "python_pptx_available": python_pptx_available,
        "export_root": str(export_root),
        "export_root_writable": export_root_writable,
        "errors": errors,
    }


def build_teacher_pptx(
    *,
    package_id: str,
    title: str,
    target_knowledge_name: str,
    teaching_goal: str,
    target_student_id: str | None,
    results: dict[str, Any],
) -> PPTMasterExport:
    """Build a teacher PPTX by writing a PPT Master project and invoking its exporter."""

    ppt_master_root = _ppt_master_root()
    exporter = ppt_master_root / "skills" / "ppt-master" / "scripts" / "svg_to_pptx.py"
    if not exporter.is_file():
        raise PPTMasterExportError(f"PPT Master exporter not found: {exporter}")

    export_root = _export_root()
    safe_package_id = _safe_slug(package_id)
    project_dir = export_root / safe_package_id
    output_path = project_dir / "exports" / f"{safe_package_id}.pptx"

    if output_path.is_file() and output_path.stat().st_size > 0:
        return PPTMasterExport(path=output_path, filename=f"{safe_package_id}.pptx")

    _reset_project_dir(project_dir, export_root)
    svg_dir = project_dir / "svg_output"
    notes_dir = project_dir / "notes"
    exports_dir = project_dir / "exports"
    svg_dir.mkdir(parents=True, exist_ok=True)
    notes_dir.mkdir(parents=True, exist_ok=True)
    exports_dir.mkdir(parents=True, exist_ok=True)

    slides = _build_slides(
        title=title,
        target_knowledge_name=target_knowledge_name,
        teaching_goal=teaching_goal,
        target_student_id=target_student_id,
        results=results,
    )
    for index, slide in enumerate(slides, start=1):
        stem = f"{index:02d}_{_safe_slug(slide['slug'])}"
        (svg_dir / f"{stem}.svg").write_text(
            _render_slide_svg(index=index, total=len(slides), **slide),
            encoding="utf-8",
        )
        (notes_dir / f"{stem}.md").write_text(slide["notes"], encoding="utf-8")

    (project_dir / "metadata.json").write_text(
        json.dumps(
            {
                "title": title,
                "subject": target_knowledge_name,
                "creator": "EduResource-Agent + PPT Master",
                "keywords": ["teacher", "ppt-master", target_knowledge_name],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    command = [
        _ppt_master_python(),
        str(exporter),
        str(project_dir),
        "-o",
        str(output_path),
        "-s",
        "output",
        "--only",
        "native",
        "--no-compat",
        "-t",
        "none",
        "-a",
        "none",
        "-q",
    ]
    completed = subprocess.run(
        command,
        cwd=str(ppt_master_root),
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )
    if completed.returncode != 0 or not output_path.is_file():
        detail = "\n".join(part for part in [completed.stdout, completed.stderr] if part).strip()
        raise PPTMasterExportError(detail or "PPT Master export failed")

    return PPTMasterExport(path=output_path, filename=f"{safe_package_id}.pptx")


def build_teacher_lesson_markdown(
    *,
    package_id: str,
    title: str,
    target_knowledge_name: str,
    teaching_goal: str,
    target_student_id: str | None,
    results: dict[str, Any],
) -> PPTMasterExport:
    """Build a stable Markdown lesson plan fallback for a teacher package."""

    export_root = _export_root()
    safe_package_id = _safe_slug(package_id)
    project_dir = export_root / safe_package_id
    exports_dir = project_dir / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    output_path = exports_dir / f"{safe_package_id}-lesson-plan.md"

    slides = _build_slides(
        title=title,
        target_knowledge_name=target_knowledge_name,
        teaching_goal=teaching_goal,
        target_student_id=target_student_id,
        results=results,
    )
    lines = [
        f"# {title}",
        "",
        f"- 知识点：{target_knowledge_name}",
        f"- 教学目标：{teaching_goal}",
        f"- 目标学生：{target_student_id or '班级'}",
        f"- 来源教学包：{package_id}",
        "",
    ]
    for index, slide in enumerate(slides, start=1):
        lines.extend(
            [
                f"## {index}. {slide['title']}",
                "",
                f"> {slide['subtitle']}",
                "",
            ]
        )
        body = slide.get("body") or []
        if body:
            lines.extend(f"- {item}" for item in body)
            lines.append("")
        notes = str(slide.get("notes") or "").strip()
        if notes:
            lines.extend(["### 讲解备注", "", notes, ""])
    output_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    return PPTMasterExport(path=output_path, filename=output_path.name)


def _ppt_master_root() -> Path:
    configured = os.getenv("PPT_MASTER_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[3] / "apps" / "ppt-master"


def _export_root() -> Path:
    configured = os.getenv("EDU_PPT_MASTER_EXPORT_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[2] / ".data" / "ppt_master"


def _ppt_master_python() -> str:
    configured = os.getenv("PPT_MASTER_PYTHON")
    candidates = [configured] if configured else []
    candidates.extend([sys.executable, shutil.which("python3"), shutil.which("python")])

    for candidate in candidates:
        if not candidate:
            continue
        command = [
            str(candidate),
            "-c",
            "import sys; import pptx; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)",
        ]
        try:
            completed = subprocess.run(command, capture_output=True, text=True, timeout=8, check=False)
        except OSError:
            continue
        if completed.returncode == 0:
            return str(candidate)

    raise PPTMasterExportError("PPT Master requires Python >= 3.10 with python-pptx installed")


def _reset_project_dir(project_dir: Path, export_root: Path) -> None:
    export_root.mkdir(parents=True, exist_ok=True)
    resolved_project = project_dir.resolve()
    resolved_root = export_root.resolve()
    if resolved_project == resolved_root or resolved_root not in resolved_project.parents:
        raise PPTMasterExportError("refusing to reset an unsafe PPT export directory")
    if project_dir.exists():
        shutil.rmtree(project_dir)
    project_dir.mkdir(parents=True, exist_ok=True)


def _build_slides(
    *,
    title: str,
    target_knowledge_name: str,
    teaching_goal: str,
    target_student_id: str | None,
    results: dict[str, Any],
) -> list[dict[str, Any]]:
    document = _as_dict(results.get("document")).get("document")
    document_body = _as_dict(document)
    sections = [_as_dict(section) for section in _as_list(document_body.get("sections"))]
    questions = [_as_dict(item) for item in _as_list(_as_dict(results.get("exercise")).get("questions"))]
    visual = _as_dict(results.get("visual"))
    animation = _as_dict(visual.get("animation"))
    steps = [_as_dict(step) for step in _as_list(animation.get("steps"))]
    code_samples = [_as_dict(sample) for sample in _as_list(_as_dict(results.get("code")).get("code_samples"))]
    evaluation = _as_dict(results.get("evaluation"))
    delta = _as_dict(evaluation.get("evaluation_delta"))
    supplemental = _as_dict(results.get("supplemental"))
    readings = [_as_dict(item) for item in _as_list(supplemental.get("readings"))]

    weakness = _collect_weakness(results, teaching_goal)
    first_section = sections[0] if sections else {}
    second_section = sections[1] if len(sections) > 1 else first_section
    first_code = code_samples[0] if code_samples else {}
    first_question = questions[0] if questions else {}

    return [
        _slide(
            slug="cover",
            kicker="Teacher Deck",
            title=target_knowledge_name,
            subtitle=_compact(teaching_goal or title, 34),
            chips=[target_student_id or "class", "PPT Master", "PPTX"],
            body=[_compact(title, 34)],
            accent="dark",
        ),
        _slide(
            slug="goal",
            kicker="01",
            title="课时目标",
            subtitle=_compact(weakness[0] if weakness else teaching_goal, 32),
            chips=["目标", "短板", "闭环"],
            body=[
                f"知识点：{target_knowledge_name}",
                f"对象：{target_student_id or '班级'}",
                f"检测：{len(questions) or 3} 题",
            ],
        ),
        _slide(
            slug="concept",
            kicker="02",
            title=str(first_section.get("heading") or "核心概念"),
            subtitle=_compact(str(first_section.get("body_md") or first_section.get("body") or target_knowledge_name), 42),
            chips=["概念", "图解", "低负担"],
            body=_section_lines(first_section, fallback=[target_knowledge_name, *(weakness[:2])]),
        ),
        _slide(
            slug="process",
            kicker="03",
            title=str(second_section.get("heading") or "步骤拆解"),
            subtitle=_compact(str(second_section.get("body_md") or second_section.get("body") or ""), 42),
            chips=["步骤", "板书", "演示"],
            body=[_compact(str(step.get("action") or step.get("target") or "Step"), 22) for step in steps[:4]]
            or _section_lines(second_section, fallback=weakness[:4]),
            layout="steps",
        ),
        _slide(
            slug="visual",
            kicker="04",
            title=str(animation.get("scene") or "可视化演示"),
            subtitle=_compact(str(visual.get("mindmap_md") or "Mindmap / Animation"), 38),
            chips=["动画", "导图", "投屏"],
            body=[
                _compact(str(step.get("narration") or step.get("target") or ""), 34)
                for step in steps[:3]
                if step
            ]
            or ["图解关键结构", "拆开过程动作", "回到题目检测"],
            layout="orbit",
        ),
        _slide(
            slug="code",
            kicker="05",
            title=str(first_code.get("filename") or "代码走查"),
            subtitle=str(first_code.get("lang") or "Demo").upper(),
            chips=[str(sample.get("lang") or "code").upper() for sample in code_samples[:3]] or ["CODE"],
            body=_code_lines(str(first_code.get("code") or "")),
            layout="code",
        ),
        _slide(
            slug="quiz",
            kicker="06",
            title="当堂检测",
            subtitle=_compact(str(first_question.get("stem") or "用 1 道题回收"), 42),
            chips=["检测", "讲解", "回收"],
            body=[
                _compact(str(question.get("stem") or f"Q{index}"), 36)
                for index, question in enumerate(questions[:3], start=1)
            ]
            or ["完成一道低门槛题", "口述关键步骤", "标记下一轮短板"],
        ),
        _slide(
            slug="close",
            kicker="07",
            title="收束",
            subtitle=_compact(str(evaluation.get("narrative") or delta.get("next_focus") or "进入下一轮巩固"), 42),
            chips=["作业", "复盘", "下轮"],
            body=[
                _compact(str(delta.get("next_focus") or "下一轮巩固"), 30),
                _compact(str(readings[0].get("title") if readings else "课后回看资源"), 30),
                _compact(str(delta.get("resolved_weakness", ["错因复盘"])[0] if isinstance(delta.get("resolved_weakness"), list) and delta.get("resolved_weakness") else "错因复盘"), 30),
            ],
            accent="dark",
        ),
    ]


def _slide(
    *,
    slug: str,
    kicker: str,
    title: str,
    subtitle: str,
    chips: list[str],
    body: list[str],
    layout: str = "cards",
    accent: str = "light",
) -> dict[str, Any]:
    return {
        "slug": slug,
        "kicker": kicker,
        "title": title,
        "subtitle": subtitle,
        "chips": [chip for chip in chips if chip][:4],
        "body": [line for line in body if line][:6],
        "layout": layout,
        "accent": accent,
        "notes": "\n".join([title, subtitle, *body]).strip(),
    }


def _render_slide_svg(
    *,
    index: int,
    total: int,
    slug: str,
    kicker: str,
    title: str,
    subtitle: str,
    chips: list[str],
    body: list[str],
    layout: str,
    accent: str,
    notes: str,
) -> str:
    del slug, notes
    dark = accent == "dark"
    bg = "#171512" if dark else "#f2eee4"
    ink = "#f2eee4" if dark else "#171512"
    muted = "#c8bda8" if dark else "#71685d"
    rule = "#8f806d" if dark else "#cbbda7"
    glow = "#d56b43"
    title_lines = _wrap(title, 20, 3)
    subtitle_lines = _wrap(subtitle, 40, 2)
    page = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">',
        f'<rect x="0" y="0" width="1280" height="720" fill="{bg}"/>',
        f'<circle cx="1100" cy="-120" r="360" fill="{glow}" opacity="0.20"/>',
        f'<text x="72" y="78" font-family="Arial" font-size="20" letter-spacing="4" fill="{muted}">{_xml(kicker.upper())}</text>',
        f'<line x1="72" y1="104" x2="1208" y2="104" stroke="{rule}" stroke-width="2"/>',
    ]
    y = 178
    for line in title_lines:
        page.append(f'<text x="72" y="{y}" font-family="Arial" font-weight="700" font-size="58" fill="{ink}">{_xml(line)}</text>')
        y += 66
    y += 10
    for line in subtitle_lines:
        page.append(f'<text x="72" y="{y}" font-family="Arial" font-size="28" fill="{muted}">{_xml(line)}</text>')
        y += 38

    chip_x = 72
    for chip in chips[:4]:
        chip_text = _compact(str(chip), 12)
        width = 28 + len(chip_text) * 14
        page.append(f'<rect x="{chip_x}" y="500" width="{width}" height="42" rx="21" fill="none" stroke="{rule}" stroke-width="2"/>')
        page.append(f'<text x="{chip_x + 16}" y="527" font-family="Arial" font-size="18" fill="{ink}">{_xml(chip_text)}</text>')
        chip_x += width + 12

    if layout == "code":
        page.append(f'<rect x="690" y="180" width="500" height="360" rx="18" fill="rgba(0,0,0,0.24)" stroke="{rule}"/>')
        y2 = 224
        for line in body[:8]:
            page.append(f'<text x="720" y="{y2}" font-family="Courier New" font-size="18" fill="{ink}">{_xml(_compact(line, 42))}</text>')
            y2 += 36
    else:
        y2 = 585
        for line in body[:4]:
            page.append(f'<text x="72" y="{y2}" font-family="Arial" font-size="24" fill="{ink}">• {_xml(_compact(line, 54))}</text>')
            y2 += 34
    page.append(f'<text x="1120" y="672" font-family="Arial" font-size="20" fill="{muted}">{index:02d}/{total:02d}</text>')
    page.append("</svg>")
    return "\n".join(page)


def _collect_weakness(results: dict[str, Any], fallback: str) -> list[str]:
    profile = _as_dict(results.get("profile"))
    weakness = [str(item) for item in _as_list(profile.get("weakness")) if item]
    if weakness:
        return weakness[:4]
    document = _as_dict(results.get("document"))
    rationale = _as_dict(document.get("rationale"))
    return [str(item) for item in _as_list(rationale.get("addressed_weakness")) if item][:4] or [fallback]


def _section_lines(section: dict[str, Any], fallback: list[str]) -> list[str]:
    lines = [str(item) for item in _as_list(section.get("bullets")) if item]
    if lines:
        return lines[:4]
    text = str(section.get("body_md") or section.get("body") or "")
    if text:
        return [_compact(line.strip("# -*"), 38) for line in text.splitlines() if line.strip()][:4]
    return fallback[:4]


def _code_lines(code: str) -> list[str]:
    lines = [line.rstrip() for line in code.splitlines() if line.strip()]
    return lines[:8] or ["# 课堂代码示例", "def demo():", "    return 'ready'"]


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _compact(value: str, max_len: int) -> str:
    value = " ".join(str(value).split())
    if len(value) <= max_len:
        return value
    return value[: max_len - 1] + "…"


def _wrap(value: str, max_len: int, max_lines: int) -> list[str]:
    value = _compact(value, max_len * max_lines)
    chunks = [value[i : i + max_len] for i in range(0, len(value), max_len)] or [""]
    return chunks[:max_lines]


def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-").lower()
    return slug or "deck"


def _xml(value: str) -> str:
    return html.escape(str(value), quote=True)
