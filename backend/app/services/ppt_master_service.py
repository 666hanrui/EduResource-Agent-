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
        f'<circle cx="1090" cy="70" r="260" fill="{glow}" opacity="{0.16 if dark else 0.11}"/>',
        f'<circle cx="170" cy="640" r="210" fill="{ink}" opacity="{0.05 if dark else 0.035}"/>',
        f'<line x1="64" y1="80" x2="1216" y2="80" stroke="{rule}" stroke-width="1"/>',
        f'<line x1="64" y1="640" x2="1216" y2="640" stroke="{rule}" stroke-width="1"/>',
        f'<text x="64" y="55" fill="{muted}" font-size="18" font-family="Georgia, serif" letter-spacing="3">{_esc(kicker)}</text>',
        f'<text x="1138" y="55" fill="{muted}" font-size="16" font-family="Georgia, serif">{index:02d}/{total:02d}</text>',
        '<g id="title-block">',
        _text_block(title_lines, 76, 170, 64 if len(title_lines) == 1 else 54, ink, "Georgia, serif", 1.05),
        _text_block(subtitle_lines, 80, 315, 24, muted, "Arial, sans-serif", 1.35),
        "</g>",
        _chips_svg(chips, 82, 392, ink, bg, rule, dark),
    ]

    if layout == "steps":
        page.append(_steps_svg(body, ink, muted, rule, dark))
    elif layout == "orbit":
        page.append(_orbit_svg(body, ink, muted, rule, dark))
    elif layout == "code":
        page.append(_code_svg(body, ink, muted, rule, dark))
    else:
        page.append(_cards_svg(body, ink, muted, rule, dark))

    page.append("</svg>")
    return "\n".join(page)


def _chips_svg(chips: list[str], x: int, y: int, ink: str, bg: str, rule: str, dark: bool) -> str:
    parts: list[str] = ['<g id="chips">']
    cursor = x
    for chip in chips:
        width = min(190, max(70, _text_width(chip, 8) + 34))
        parts.append(
            f'<rect x="{cursor}" y="{y}" width="{width}" height="34" rx="17" fill="{ink if dark else bg}" '
            f'opacity="{0.92 if dark else 1}" stroke="{rule}" stroke-width="1"/>'
        )
        parts.append(
            f'<text x="{cursor + 17}" y="{y + 22}" fill="{bg if dark else ink}" '
            f'font-size="14" font-family="Arial, sans-serif">{_esc(_compact(chip, 16))}</text>'
        )
        cursor += width + 10
    parts.append("</g>")
    return "\n".join(parts)


def _cards_svg(body: list[str], ink: str, muted: str, rule: str, dark: bool) -> str:
    parts = ['<g id="content-cards">']
    for index, line in enumerate(body[:4]):
        x = 80 + (index % 2) * 560
        y = 470 + (index // 2) * 74
        parts.append(
            f'<rect x="{x}" y="{y}" width="520" height="56" fill="{ink}" opacity="{0.08 if dark else 0.04}" '
            f'stroke="{rule}" stroke-width="1"/>'
        )
        parts.append(
            f'<text x="{x + 18}" y="{y + 35}" fill="{muted if index % 2 else ink}" '
            f'font-size="22" font-family="Arial, sans-serif">{_esc(_compact(line, 28))}</text>'
        )
    parts.append("</g>")
    return "\n".join(parts)


def _steps_svg(body: list[str], ink: str, muted: str, rule: str, dark: bool) -> str:
    parts = ['<g id="step-ladder">']
    for index, line in enumerate(body[:4]):
        x = 110 + index * 270
        y = 476
        parts.append(f'<line x1="{x + 58}" y1="{y - 28}" x2="{x + 58}" y2="{y + 98}" stroke="{rule}" stroke-width="1"/>')
        parts.append(f'<circle cx="{x + 58}" cy="{y}" r="42" fill="{ink}" opacity="{0.9 if not dark else 0.18}"/>')
        parts.append(
            f'<text x="{x + 43}" y="{y + 10}" fill="{"#f2eee4" if not dark else ink}" '
            f'font-size="28" font-family="Georgia, serif">{index + 1}</text>'
        )
        parts.append(
            f'<text x="{x}" y="{y + 88}" fill="{muted}" font-size="20" font-family="Arial, sans-serif">'
            f'{_esc(_compact(line, 16))}</text>'
        )
    parts.append("</g>")
    return "\n".join(parts)


def _orbit_svg(body: list[str], ink: str, muted: str, rule: str, dark: bool) -> str:
    labels = (body + ["观察", "讲解", "检测"])[:3]
    positions = [(830, 476), (1034, 520), (920, 600)]
    parts = [
        '<g id="visual-orbit">',
        f'<circle cx="940" cy="536" r="132" fill="{ink}" opacity="{0.08 if dark else 0.04}" stroke="{rule}" stroke-width="1"/>',
        f'<circle cx="940" cy="536" r="56" fill="{ink}" opacity="{0.88 if not dark else 0.18}"/>',
        f'<text x="905" y="546" fill="{"#f2eee4" if not dark else ink}" font-size="22" font-family="Georgia, serif">VIS</text>',
    ]
    for index, label in enumerate(labels):
        x, y = positions[index]
        parts.append(f'<circle cx="{x}" cy="{y}" r="46" fill="{ink}" opacity="{0.1 if dark else 0.06}" stroke="{rule}" stroke-width="1"/>')
        parts.append(
            f'<text x="{x - 54}" y="{y + 74}" fill="{muted}" font-size="18" font-family="Arial, sans-serif">'
            f'{_esc(_compact(label, 18))}</text>'
        )
    parts.append("</g>")
    return "\n".join(parts)


def _code_svg(body: list[str], ink: str, muted: str, rule: str, dark: bool) -> str:
    parts = [
        '<g id="code-frame">',
        f'<rect x="700" y="420" width="500" height="180" rx="18" fill="{ink}" opacity="{0.9 if not dark else 0.12}" stroke="{rule}" stroke-width="1"/>',
    ]
    code_fill = "#f2eee4" if not dark else ink
    for index, line in enumerate(body[:6]):
        parts.append(
            f'<text x="730" y="{462 + index * 24}" fill="{code_fill if index == 0 else muted}" '
            f'font-size="18" font-family="Menlo, Consolas, monospace">{_esc(_compact(line, 42))}</text>'
        )
    parts.append("</g>")
    return "\n".join(parts)


def _text_block(lines: list[str], x: int, y: int, size: int, fill: str, font: str, line_height: float) -> str:
    parts: list[str] = []
    for index, line in enumerate(lines):
        parts.append(
            f'<text x="{x}" y="{y + round(index * size * line_height)}" fill="{fill}" '
            f'font-size="{size}" font-family="{font}">{_esc(line)}</text>'
        )
    return "\n".join(parts)


def _section_lines(section: dict[str, Any], fallback: list[str]) -> list[str]:
    text = str(section.get("body_md") or section.get("body") or "")
    lines = [_compact(line, 32) for line in _wrap(text, 34, 4)]
    return lines or [_compact(line, 32) for line in fallback if line]


def _code_lines(code: str) -> list[str]:
    lines = [line.rstrip() for line in code.splitlines() if line.strip()]
    return lines[:6] or ["// demo", "step_1()", "step_2()", "check()"]


def _collect_weakness(results: dict[str, Any], teaching_goal: str) -> list[str]:
    values: list[str] = []
    for key in ["document", "exercise", "visual", "code"]:
        rationale = _as_dict(_as_dict(results.get(key)).get("rationale"))
        values.extend(str(item) for item in _as_list(rationale.get("addressed_weakness")))
        values.extend(str(item) for item in _as_list(rationale.get("matched_profile")))
    profile = _as_dict(results.get("profile"))
    values.extend(str(item) for item in _as_list(profile.get("weakness")))
    if teaching_goal:
        values.append(teaching_goal)
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        compacted = _compact(value, 40)
        if compacted and compacted not in seen:
            seen.add(compacted)
            unique.append(compacted)
    return unique[:5]


def _wrap(value: str, max_units: int, max_lines: int) -> list[str]:
    text = re.sub(r"\s+", " ", value.strip())
    if not text:
        return []
    lines: list[str] = []
    current = ""
    units = 0
    for char in text:
        char_units = 2 if ord(char) > 127 else 1
        if current and units + char_units > max_units:
            lines.append(current)
            current = char
            units = char_units
            if len(lines) >= max_lines:
                break
        else:
            current += char
            units += char_units
    if current and len(lines) < max_lines:
        lines.append(current)
    return lines[:max_lines]


def _compact(value: str, max_units: int) -> str:
    wrapped = _wrap(value, max_units, 1)
    if not wrapped:
        return ""
    text = wrapped[0]
    return f"{text}..." if _text_width(value, 1) > max_units else text


def _text_width(value: str, latin_unit: int) -> int:
    return sum(latin_unit * (2 if ord(char) > 127 else 1) for char in value)


def _safe_slug(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-")
    return safe or "deck"


def _esc(value: str) -> str:
    return html.escape(value, quote=True)


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []
