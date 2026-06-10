"""Deterministic supplemental resource links for generated learning bundles."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote


_PRESET_BILIBILI_GROUPS = [
    {
        "keys": ["linked-list", "链表", "指针"],
        "videos": [
            {
                "title": "图码动画：链表完整代码动画版",
                "bvid": "BV1ea4y1r75V",
                "up_name": "数据结构与算法动画版",
                "duration": "动画讲解",
                "tags": ["链表", "动画讲解", "指针顺序"],
                "fit_reason": "适合把节点、next 指针、插入删除流程先看成连续动作。",
            },
            {
                "title": "基础算法精讲：反转链表",
                "bvid": "BV1sd4y1x7KN",
                "up_name": "灵茶山艾府",
                "duration": "短讲解优先",
                "tags": ["反转链表", "代码走查", "面试题"],
                "fit_reason": "适合在理解基础链表后，看指针翻转和循环不变量。",
            },
            {
                "title": "代码随想录刷题：206 反转链表",
                "bvid": "BV1EU421o79W",
                "up_name": "代码随想录刷题",
                "duration": "题目精讲",
                "tags": ["刷题复盘", "易错点", "链表"],
                "fit_reason": "适合练习后复盘链表双指针、虚拟头节点和反转链表。",
            },
        ],
    },
    {
        "keys": ["binary-tree", "二叉树", "树遍历", "tree"],
        "videos": [
            {
                "title": "动画数据结构：二叉树的遍历",
                "bvid": "BV1MF41147Ga",
                "up_name": "技术蛋老师",
                "duration": "动画讲解",
                "tags": ["递归栈", "遍历顺序", "DFS"],
                "fit_reason": "适合补清楚先序/中序/后序中“访问节点”的时机差异。",
            },
            {
                "title": "二叉树遍历秒解",
                "bvid": "BV1hw4m1q7DF",
                "up_name": "数据结构与算法动画版 C语言",
                "duration": "技巧讲解",
                "tags": ["遍历顺序", "考研", "动画"],
                "fit_reason": "适合用标记法快速区分前序、中序和后序。",
            },
            {
                "title": "前序中序推后序动画讲解",
                "bvid": "BV1iU4y1B7D7",
                "up_name": "蓝不过海呀",
                "duration": "题型精讲",
                "tags": ["遍历序列", "推导", "树结构"],
                "fit_reason": "适合把遍历顺序落到具体题型，训练序列还原。",
            },
        ],
    },
    {
        "keys": ["sort", "排序", "quick", "merge", "bubble"],
        "videos": [
            {
                "title": "算法模拟动画：快速排序",
                "bvid": "BV12v411K7pZ",
                "page": 12,
                "up_name": "自由的筱团",
                "duration": "动画合集",
                "tags": ["快速排序", "排序动画", "分治"],
                "fit_reason": "适合横向比较多种排序的比较、交换、分治和合并过程。",
            },
            {
                "title": "算法动画：快速排序",
                "bvid": "BV1Xv411w7PH",
                "up_name": "Maple-Kaede",
                "duration": "短动画",
                "tags": ["快速排序", "分区", "基准"],
                "fit_reason": "适合重点理解基准选择、左右分区和递归子问题。",
            },
            {
                "title": "排序稳定性与复杂度对比",
                "bvid": "BV1ye4y1J7Jt",
                "up_name": "数据结构期末复习",
                "duration": "体系梳理",
                "tags": ["复杂度", "稳定性", "排序对比"],
                "fit_reason": "适合把稳定性、复杂度和适用场景串起来。",
            },
        ],
    },
    {
        "keys": ["graph", "图算法", "bfs", "dfs", "dijkstra", "最短路"],
        "videos": [
            {
                "title": "数据结构：图的遍历 DFS 和 BFS",
                "bvid": "BV1HU4y1U7p8",
                "up_name": "fishtail2008",
                "duration": "系列讲解",
                "tags": ["BFS", "DFS", "图遍历"],
                "fit_reason": "适合看清 BFS 的队列扩展和 DFS 的深入回溯差异。",
            },
            {
                "title": "Dijkstra 最短路径算法",
                "bvid": "BV14dXpYEEZS",
                "up_name": "波波微课",
                "duration": "专题讲解",
                "tags": ["Dijkstra", "松弛", "最短路"],
                "fit_reason": "适合理解每轮选择最短未访问节点和松弛边的过程。",
            },
            {
                "title": "Dijkstra 有权图最短路",
                "bvid": "BV19K4y1g75e",
                "up_name": "ShusenWang",
                "duration": "课程片段",
                "tags": ["图结构", "最短路径", "英文术语"],
                "fit_reason": "适合从图结构基础过渡到有权图路径计算。",
            },
        ],
    },
    {
        "keys": ["dynamic-programming", "动态规划", "dp"],
        "videos": [
            {
                "title": "动态规划入门 50 题",
                "bvid": "BV1aa411f7uT",
                "up_name": "动态规划入门",
                "duration": "入门专题",
                "tags": ["状态转移", "DP", "递推"],
                "fit_reason": "适合先建立状态定义、转移方程和初始化的基本套路。",
            },
            {
                "title": "动态规划秘籍：01 背包",
                "bvid": "BV1jT4y1o71J",
                "up_name": "趣学算法",
                "duration": "体系讲解",
                "tags": ["背包", "状态设计", "空间优化"],
                "fit_reason": "适合用背包模型训练状态设计和边界条件。",
            },
            {
                "title": "01 背包滚动数组优化",
                "bvid": "BV13S7czSEWs",
                "up_name": "小菜要变强",
                "duration": "专题讲解",
                "tags": ["背包", "滚动数组", "空间优化"],
                "fit_reason": "适合看清二维表和一维滚动数组的关系。",
            },
        ],
    },
    {
        "keys": ["stack", "queue", "栈", "队列"],
        "videos": [
            {
                "title": "队列完整代码动画解析",
                "bvid": "BV12C411G7LR",
                "up_name": "数据结构与算法动画版",
                "duration": "动画讲解",
                "tags": ["队列", "FIFO", "动画"],
                "fit_reason": "适合先建立队列先进先出的操作直觉。",
            },
            {
                "title": "王道入门课：栈和队列",
                "bvid": "BV1URFfegEBC",
                "page": 4,
                "up_name": "王道计算机教育",
                "duration": "体系讲解",
                "tags": ["栈", "队列", "课程体系"],
                "fit_reason": "适合把顺序栈、链栈、循环队列等定义统一梳理。",
            },
            {
                "title": "Java 数据结构：栈和队列",
                "bvid": "BV1iQ4y1R7e1",
                "up_name": "Java 数据结构课程",
                "duration": "代码实现",
                "tags": ["Java", "栈", "队列"],
                "fit_reason": "适合把结构定义落到代码实现和常见应用。",
            },
        ],
    },
]


def build_supplemental_resources(
    *,
    knowledge_id: str,
    knowledge_name: str,
    student_id: str | None = None,
    weakness: list[str] | None = None,
) -> dict[str, Any]:
    """Build stable supplemental resources without scraping a vendor site."""

    clean_name = knowledge_name.strip() or knowledge_id.strip() or "数据结构"
    weakness_text = "、".join(item for item in (weakness or []) if item).strip()
    fit_suffix = f"；重点补足：{weakness_text}" if weakness_text else ""

    videos = [
        *_preset_bilibili_videos(knowledge_id, clean_name),
        {
            "title": "数据结构和算法入门课",
            "platform": "bilibili",
            "url": _bilibili_watch_url("BV1URFfegEBC"),
            "embed_url": _bilibili_embed_url("BV1URFfegEBC"),
            "bvid": "BV1URFfegEBC",
            "page": 1,
            "up_name": "王道计算机教育",
            "duration": "体系课程",
            "tags": ["课程体系", "概念入门", "B站"],
            "fit_reason": f"先用动画建立直觉，再回到本轮讲义和练习{fit_suffix}。",
        },
        {
            "title": "算法模拟动画合集",
            "platform": "bilibili",
            "url": _bilibili_watch_url("BV12v411K7pZ"),
            "embed_url": _bilibili_embed_url("BV12v411K7pZ"),
            "bvid": "BV12v411K7pZ",
            "page": 1,
            "up_name": "自由的筱团",
            "duration": "动画合集",
            "tags": ["动画讲解", "可视化", "B站"],
            "fit_reason": "适合把生成的可视化步骤和真实动画讲解对照起来看。",
        },
    ]

    readings = [
        {
            "title": "算法可视化演示工作室",
            "type": "local_visual_studio",
            "url": "/html/viz-studio.html",
            "tags": ["本地演示", "逐帧动画", "课堂可用"],
            "fit_reason": "老师可以直接投屏，学生也能自主重复播放关键步骤。",
        },
        {
            "title": f"{clean_name} · 本地专项动画",
            "type": "local_animation",
            "url": _local_animation_url(knowledge_id, clean_name),
            "tags": ["本地离线", "交互动画"],
            "fit_reason": "用一个低干扰的交互动画把抽象流程拆成可观察步骤。",
        },
        {
            "title": f"{clean_name} · 图文资料检索",
            "type": "web_search",
            "url": f"https://www.bing.com/search?q={quote(f'{clean_name} 数据结构 图文讲义')}",
            "tags": ["图文讲义", "拓展阅读"],
            "fit_reason": "适合需要静态讲义、博客或课堂笔记补充的学生。",
        },
    ]

    return {
        "target_knowledge_id": knowledge_id,
        "target_knowledge_name": clean_name,
        "student_id": student_id,
        "videos": videos,
        "readings": readings,
        "rationale": {
            "matched_profile": ["资源偏好：讲义 + 动画 + 视频补充", "学习场景：课堂审核后可部署给学生"],
            "addressed_weakness": weakness or [],
            "difficulty_adjusted_from": 3,
            "difficulty_used": 2,
            "agent_name": "ResourceScoutAgent",
            "prompt_version": "supplemental_resource_v1",
            "model_name": "deterministic-link-builder",
            "cited_sources": [
                {"title": "Bilibili embedded player", "page": "player.bilibili.com", "similarity": 1.0},
                {"title": "EduResource local visualization studio", "page": "/html/viz-studio.html", "similarity": 1.0},
            ],
        },
    }


def _bilibili_watch_url(bvid: str, page: int = 1) -> str:
    suffix = f"?p={page}" if page > 1 else ""
    return f"https://www.bilibili.com/video/{bvid}/{suffix}"


def _bilibili_embed_url(bvid: str, page: int = 1) -> str:
    return (
        "https://player.bilibili.com/player.html"
        f"?bvid={quote(bvid)}&page={page}&as_wide=1&high_quality=1&danmaku=0&autoplay=0"
    )


def _preset_bilibili_videos(knowledge_id: str, knowledge_name: str) -> list[dict[str, Any]]:
    text = f"{knowledge_id} {knowledge_name}".lower()
    for group in _PRESET_BILIBILI_GROUPS:
        if any(str(key).lower() in text for key in group["keys"]):
            return [_preset_video(video) for video in group["videos"]]
    return [
        _preset_video(
            {
                "title": "数据结构和算法入门课",
                "bvid": "BV1URFfegEBC",
                "up_name": "王道计算机教育",
                "duration": "体系课程",
                "tags": ["课程讲解", "数据结构", "入门"],
                "fit_reason": "优先用体系化课程资源补齐当前知识点的上下文。",
            }
        )
    ]


def _preset_video(video: dict[str, Any]) -> dict[str, Any]:
    bvid = str(video["bvid"])
    page = int(video.get("page") or 1)
    return {
        "title": video["title"],
        "platform": "bilibili",
        "url": _bilibili_watch_url(bvid, page),
        "embed_url": _bilibili_embed_url(bvid, page),
        "bvid": bvid,
        "page": page,
        "up_name": video["up_name"],
        "duration": video["duration"],
        "tags": video["tags"],
        "fit_reason": video["fit_reason"],
    }


def _local_animation_url(knowledge_id: str, knowledge_name: str) -> str:
    text = f"{knowledge_id} {knowledge_name}".lower()
    if "链表" in text or "linked" in text:
        return "/html/viz/linked-list.html"
    if "二叉树" in text or "tree" in text:
        return "/html/viz/binary-tree.html"
    if "排序" in text or "sort" in text:
        return "/html/viz/sorting.html"
    if "图" in text or "graph" in text or "bfs" in text or "dfs" in text:
        return "/html/viz/graph.html"
    return "/html/viz-studio.html"
