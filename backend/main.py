"""
FastAPI 应用入口。

启动：
    cd backend
    uvicorn main:app --reload --port 8000

健康检查：
    curl http://localhost:8000/api/health
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import build_router
from app.api.coach_workbench import build_coach_workbench_router
from app.api.student_business import build_student_business_router
from app.core.config import get_settings
from app.core.context import build_context


@asynccontextmanager
async def lifespan(app: FastAPI):
    ctx = build_context()
    app.state.ctx = ctx
    # Student business routes are mounted first so the compatibility
    # POST /api/exploration/plan persists profile/path/session data before
    # the legacy exploration route can match the same path.
    app.include_router(build_student_business_router(ctx))
    app.include_router(build_router(ctx))
    app.include_router(build_coach_workbench_router(ctx))
    yield
    await ctx.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="EduResource-Agent", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


app = create_app()
