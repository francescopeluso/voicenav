const WS_URL = "ws://localhost:8000/ws";

export function createWebSocket(
  onMessage: (data: Record<string, unknown>) => void,
  onOpen?: () => void,
  onClose?: () => void,
  onError?: (err: Event) => void
): WebSocket {
  const ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[VoiceNav] WebSocket connected");
    onOpen?.();
  };

  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      console.error("[VoiceNav] Failed to parse message");
    }
  };

  ws.onclose = () => {
    console.log("[VoiceNav] WebSocket disconnected");
    onClose?.();
  };

  ws.onerror = (err) => {
    console.error("[VoiceNav] WebSocket error", err);
    onError?.(err);
  };

  return ws;
}

export function sendVoiceInput(
  ws: WebSocket,
  audioBase64: string,
  pageContext?: { url: string; title: string; content: string }
) {
  ws.send(
    JSON.stringify({
      type: "voice_input",
      audio: audioBase64,
      page_context: pageContext,
    })
  );
}

export function sendTextInput(
  ws: WebSocket,
  text: string,
  pageContext?: { url: string; title: string; content: string }
) {
  ws.send(
    JSON.stringify({ type: "text_input", text, page_context: pageContext })
  );
}

export function sendPermissionResponse(
  ws: WebSocket,
  granted: boolean,
  permissions: string[]
) {
  ws.send(
    JSON.stringify({ type: "permission_response", granted, permissions })
  );
}
