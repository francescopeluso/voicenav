from pydantic import BaseModel
from typing import Optional


class WSMessage(BaseModel):
    type: str
    audio: Optional[str] = None
    text: Optional[str] = None
    granted: Optional[bool] = None


class ExecutionStep(BaseModel):
    action: str
    params: dict = {}
    permission_required: Optional[str] = None
    speech: str = ""


class ExecutionPlan(BaseModel):
    intent: str
    steps: list[ExecutionStep]
    final_speech: str = ""


class AgentUpdate(BaseModel):
    type: str = "update"
    status: str
    step: Optional[int] = None
    total_steps: Optional[int] = None
    action: Optional[str] = None
    speech: Optional[str] = None
    audio: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    permissions: Optional[list[str]] = None
