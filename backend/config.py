from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    elevenlabs_api_key: str = ""

    backend_host: str = "localhost"
    backend_port: int = 8000
    cors_origins: list = ["chrome-extension://*", "http://localhost:*"]

    elevenlabs_voice: str = "Rachel"
    whisper_model: str = "whisper-1"
    gpt_model: str = "gpt-4o"

    web_agent_enabled: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
