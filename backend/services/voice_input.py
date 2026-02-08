import io
import logging
from openai import AsyncOpenAI
from config import settings

logger = logging.getLogger(__name__)

_client = None

def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def transcribe_audio(audio_data: bytes) -> str:
    try:
        audio_file = io.BytesIO(audio_data)
        audio_file.name = "recording.webm"
        response = await _get_client().audio.transcriptions.create(
            model=settings.whisper_model,
            file=audio_file,
            response_format="text",
        )
        text = response.strip()
        logger.info(f"Transcribed: {text}")
        return text
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise
