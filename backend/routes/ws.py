"""WebSocket routes for real-time training progress."""

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError
import redis.asyncio as aioredis

from ..config import settings
from ..services.auth_service import decode_token

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/training/{job_id}")
async def training_progress_ws(
    websocket: WebSocket,
    job_id: str,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time training progress updates."""
    # Verify JWT
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=4001)
            return
    except (JWTError, KeyError):
        await websocket.close(code=4001)
        return

    await websocket.accept()

    redis_url = settings.CELERY_BROKER_URL
    redis_conn = aioredis.from_url(redis_url)
    pubsub = redis_conn.pubsub()
    await pubsub.subscribe(f"training:progress:{job_id}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                await websocket.send_json(data)
                if data.get("type") in ("completed", "error"):
                    break
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"training:progress:{job_id}")
        await redis_conn.close()
