"""FastAPI application — file-based storage, no database needed."""

import sys, os
if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.routes import projects, datasets, training, models, ws

app = FastAPI(title=settings.APP_NAME, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", *settings.cors_origin_list],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def user_query_param_middleware(request: Request, call_next):
    """If ?user= is present and X-User header is default/missing, inject it into the request scope."""
    user = request.query_params.get("user")
    x_user = request.headers.get("X-User", "")
    if user and (not x_user or x_user == "dev"):
        scope_headers = list(request.scope.get("headers", []))
        scope_headers = [(k, v) for k, v in scope_headers if k != b"x-user"]
        scope_headers.append((b"x-user", user.encode()))
        request.scope["headers"] = scope_headers
        # Force re-parse of cached headers property
        request.__dict__.pop("_headers", None)
    response = await call_next(request)
    return response

# Serve uploaded files
storage_dir = Path(settings.STORAGE_ROOT).resolve()
storage_dir.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(storage_dir)), name="storage")

app.include_router(projects.router)
app.include_router(datasets.router)
app.include_router(training.router)
app.include_router(models.router)
app.include_router(ws.router)


@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
