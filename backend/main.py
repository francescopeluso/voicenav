import base64
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from services.voice_input import transcribe_audio
from services.agent import VoiceAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="VoiceNav Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    logger.info("WebSocket client connected")

    agent = VoiceAgent()
    pending_command: str | None = None
    pending_page_context: dict | None = None

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            if msg["type"] == "voice_input":
                audio_bytes = base64.b64decode(msg["audio"])
                page_context = msg.get("page_context")
                try:
                    text = await transcribe_audio(audio_bytes)
                except Exception as e:
                    await ws.send_json(
                        {
                            "type": "update",
                            "status": "error",
                            "error": f"Transcription failed: {e}",
                        }
                    )
                    continue

                await ws.send_json({"type": "transcription", "text": text})
                pending_command = text
                pending_page_context = page_context
                async for update in agent.start_command(text, page_context):
                    await ws.send_json(update)
                    if update.get("status") == "permission_request":
                        break

            elif msg["type"] == "text_input":
                text = msg.get("text", "")
                page_context = msg.get("page_context")
                if not text:
                    continue
                await ws.send_json({"type": "transcription", "text": text})
                pending_command = text
                pending_page_context = page_context
                async for update in agent.start_command(text, page_context):
                    await ws.send_json(update)
                    if update.get("status") == "permission_request":
                        break

            elif msg["type"] == "action_completed":
                result = msg.get("result", {})
                page_context = msg.get("page_context")
                async for update in agent.action_completed(result, page_context):
                    await ws.send_json(update)

            elif msg["type"] == "permission_response":
                if msg.get("granted") and pending_command:
                    for perm in msg.get("permissions", []):
                        agent.grant_permission(perm)
                    async for update in agent.resume_after_permission(
                        pending_command, pending_page_context
                    ):
                        await ws.send_json(update)
                        if update.get("status") == "permission_request":
                            break
                else:
                    await ws.send_json(
                        {
                            "type": "update",
                            "status": "complete",
                            "speech": "Okay, I won't do that.",
                        }
                    )
                    pending_command = None
                    pending_page_context = None

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await ws.send_json(
                {"type": "update", "status": "error", "error": str(e)}
            )
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=True,
    )
