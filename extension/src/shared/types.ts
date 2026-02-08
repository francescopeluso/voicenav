export interface VoiceCommand {
  text: string;
  timestamp: number;
}

export interface AgentUpdate {
  type?: string;
  status:
  | "thinking"
  | "permission_request"
  | "executing"
  | "step_complete"
  | "complete"
  | "error"
  | "user_message";
  step?: number;
  total_steps?: number;
  action?: string;
  params?: Record<string, string>;
  requires_action?: boolean;
  speech?: string;
  audio?: string;
  result?: Record<string, unknown>;
  error?: string;
  permissions?: string[];
}

export interface TranscriptionMessage {
  type: "transcription";
  text: string;
}

export interface PageContext {
  url: string;
  title: string;
  content: string;
  interactive: string;
}

export type WSMessage = AgentUpdate | TranscriptionMessage;
