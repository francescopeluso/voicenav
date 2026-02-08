import base64
import logging
import httpx
from config import settings

logger = logging.getLogger(__name__)

VOICE_IDS = {
    "Rachel": "21m00Tcm4TlvDq8ikWAM",
}

EMOTION_SETTINGS = {
    "neutral": {"stability": 0.7, "similarity_boost": 0.75},
    "success": {"stability": 0.5, "similarity_boost": 0.8},
    "error": {"stability": 0.8, "similarity_boost": 0.6},
}


class VoiceSynthesizer:
    def __init__(self):
        self.api_key = settings.elevenlabs_api_key
        self.voice_id = VOICE_IDS.get(settings.elevenlabs_voice, VOICE_IDS["Rachel"])

    async def speak(self, text: str, emotion: str = "neutral") -> str:
        if not self.api_key:
            logger.warning("No ElevenLabs API key, skipping TTS")
            return ""

        voice_settings = EMOTION_SETTINGS.get(emotion, EMOTION_SETTINGS["neutral"])

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}",
                    headers={
                        "xi-api-key": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": text,
                        "model_id": "eleven_turbo_v2_5",
                        "voice_settings": voice_settings,
                    },
                    timeout=30.0,
                )
                response.raise_for_status()
                return base64.b64encode(response.content).decode("utf-8")
        except Exception as e:
            logger.error(f"TTS failed: {e}")
            return ""


synthesizer = VoiceSynthesizer()
