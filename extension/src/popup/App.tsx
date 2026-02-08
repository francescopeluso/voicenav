import React, { useState, useRef, useEffect, useCallback } from "react";
import type { AgentUpdate } from "../shared/types";
import {
  createWebSocket,
  sendVoiceInput,
  sendTextInput,
  sendPermissionResponse,
} from "../shared/api";
import { MicrophoneButton } from "./components/MicrophoneButton";
import { StatusFeed } from "./components/StatusFeed";
import { PermissionPrompt } from "./components/PermissionPrompt";

const isPopup = window.location.search !== "?tab=1";

async function getActiveTabId(): Promise<number | null> {
  if (typeof chrome === "undefined" || !chrome.tabs) return null;
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.id ?? null);
    });
  });
}

async function injectContentScript(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch {
    /* already injected or restricted page */
  }
}

async function queryPage(
  tabId: number
): Promise<{ url: string; title: string; content: string; interactive: string }> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "voicenav_get_page" },
      (res) => {
        if (chrome.runtime.lastError || !res)
          resolve({ url: "", title: "", content: "", interactive: "" });
        else resolve(res);
      }
    );
  });
}

async function execOnPage(
  tabId: number,
  action: string,
  params: Record<string, string>
): Promise<{ success: boolean; data?: string; error?: string }> {
  const maxRetries = 3;
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      return await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tabId,
          { type: "voicenav_action", action, params },
          (response) => {
            if (chrome.runtime.lastError) {
              const msg = chrome.runtime.lastError.message;
              if (
                msg &&
                (msg.includes("Receiving end does not exist") ||
                  msg.includes("Could not establish connection"))
              ) {
                // Return null to trigger retry
                resolve(null as any);
              } else {
                resolve({
                  success: false,
                  error: msg,
                });
              }
            } else {
              resolve(response || { success: false, error: "No response from page" });
            }
          }
        );
      }).then((res: any) => {
        if (res === null) throw new Error("Retry");
        return res;
      });
    } catch (e) {
      attempts++;
      if (attempts >= maxRetries) {
        return { success: false, error: "Connection failed after retries" };
      }
      await new Promise((r) => setTimeout(r, 1000)); // Wait 1s before retry
    }
  }
  return { success: false, error: "Connection failed" };
}

export const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [updates, setUpdates] = useState<AgentUpdate[]>([]);
  const [transcription, setTranscription] = useState("");
  const [pendingPermissions, setPendingPermissions] = useState<
    string[] | null
  >(null);
  const [textInput, setTextInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const tabIdRef = useRef<number | null>(null);

  const executeAndReport = useCallback(
    async (action: string, params: Record<string, string>) => {
      if (!tabIdRef.current || !wsRef.current) return;

      const result = await execOnPage(tabIdRef.current, action, params);

      setUpdates((prev) => [
        ...prev,
        {
          status: result.success ? "step_complete" : "error",
          action,
          speech: result.data || undefined,
          error: result.error || undefined,
        } as AgentUpdate,
      ]);

      const newCtx = await queryPage(tabIdRef.current);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "action_completed",
            result,
            page_context: newCtx,
          })
        );
      }
    },
    []
  );

  useEffect(() => {
    (async () => {
      const id = await getActiveTabId();
      if (id) {
        tabIdRef.current = id;
        await injectContentScript(id);
      }
    })();
  }, []);

  // Re-inject content script when tab updates (navigation/reload)
  useEffect(() => {
    const handleTabUpdate = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (
        tabId === tabIdRef.current &&
        changeInfo.status === "complete" &&
        tab.url &&
        !tab.url.startsWith("chrome://")
      ) {
        injectContentScript(tabId).then(() => {
          console.log("[VoiceNav] Re-injected content script after navigation");
        });
      }
    };

    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener(handleTabUpdate);
      return () => {
        chrome.tabs.onUpdated.removeListener(handleTabUpdate);
      };
    }
  }, []);

  useEffect(() => {
    const ws = createWebSocket(
      handleMessage,
      () => setConnected(true),
      () => {
        setConnected(false);
        setTimeout(connectWS, 3000);
      }
    );
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  const connectWS = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = createWebSocket(
      handleMessage,
      () => setConnected(true),
      () => {
        setConnected(false);
        setTimeout(connectWS, 3000);
      }
    );
    wsRef.current = ws;
  };

  const handleMessage = useCallback(
    (data: Record<string, unknown>) => {
      if (data.type === "transcription") {
        const text = data.text as string;
        setTranscription(text);
        // Add to history permanently
        setUpdates((prev) => [
          ...prev,
          { status: "user_message", speech: text } as AgentUpdate,
        ]);
        return;
      }

      const update = data as unknown as AgentUpdate;

      if (
        update.requires_action &&
        update.action &&
        update.params &&
        tabIdRef.current
      ) {
        executeAndReport(update.action, update.params);
      }

      if (update.status === "permission_request") {
        setPendingPermissions(update.permissions || []);
        setIsProcessing(false);
      }

      if (update.status === "complete" || update.status === "error") {
        setIsProcessing(false);
      }

      if (update.audio) playAudio(update.audio);

      setUpdates((prev) => [...prev, update]);
    },
    [executeAndReport]
  );

  useEffect(() => {
    if (feedRef.current)
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [updates]);

  const playAudio = (b64: string) => {
    if (!b64) return;
    try {
      new Audio(`data:audio/mpeg;base64,${b64}`).play().catch(() => { });
    } catch { }
  };

  const fetchPageContext = async () => {
    if (!tabIdRef.current)
      return { url: "", title: "", content: "", interactive: "" };

    const pageData = await queryPage(tabIdRef.current);

    let screenshot = "";
    try {
      // Capture visible tab as JPEG (compressed)
      const dataUrl = await chrome.tabs.captureVisibleTab({
        format: "jpeg",
        quality: 60,
      });
      screenshot = dataUrl.split(",")[1]; // Remove data:image/jpeg;base64, prefix
    } catch (e) {
      console.error("[VoiceNav] Screenshot failed:", e);
    }

    return { ...pageData, screenshot };
  };

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        processVoiceInput(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsListening(true);
      // setUpdates([]); // Keep history
      setTranscription("");
      setPendingPermissions(null);
    } catch (err) {
      console.error("[VoiceNav] Mic access failed:", err);
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === "recording")
      mediaRecorderRef.current.stop();
    setIsListening(false);
    setIsProcessing(true);
  };

  const processVoiceInput = async (blob: Blob) => {
    const ctx = await fetchPageContext();
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendVoiceInput(wsRef.current, base64, ctx);
      }
    };
    reader.readAsDataURL(blob);
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || !wsRef.current) return;
    const ctx = await fetchPageContext();

    // Local echo removed - wait for backend transcription event to avoid duplicates

    setTranscription("");
    setPendingPermissions(null);
    setIsProcessing(true);
    sendTextInput(wsRef.current, textInput.trim(), ctx);
    setTextInput("");
  };

  const handleGrant = () => {
    if (wsRef.current && pendingPermissions) {
      sendPermissionResponse(wsRef.current, true, pendingPermissions);
      setPendingPermissions(null);
      setIsProcessing(true);
    }
  };

  const handleDeny = () => {
    if (wsRef.current && pendingPermissions) {
      sendPermissionResponse(wsRef.current, false, pendingPermissions);
      setPendingPermissions(null);
    }
  };

  return (
    <div
      className={`flex flex-col bg-[#FAF8F5] h-screen`}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#D4D0CC]">
        <span className="text-[10px] tracking-[0.3em] uppercase font-medium text-[#1A1A1A]">
          VoiceNav
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 ${connected ? "bg-[#1A1A1A]" : "bg-[#D4D0CC]"}`}
          />
          <span className="text-[10px] text-[#6B6B6B]">
            {connected ? "Connected" : "Offline"}
          </span>
        </div>
      </header>

      <div ref={feedRef} className="flex-1 overflow-y-auto">
        <StatusFeed updates={updates} transcription={transcription} />
      </div>

      {pendingPermissions && (
        <PermissionPrompt
          permissions={pendingPermissions}
          onGrant={handleGrant}
          onDeny={handleDeny}
        />
      )}

      <div className="border-t border-[#D4D0CC]">
        <form onSubmit={handleTextSubmit} className="flex gap-2 px-4 pt-3">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type a command..."
            disabled={isProcessing}
            className="flex-1 bg-[#F0EDEA] text-sm text-[#1A1A1A] px-3 py-2 border border-[#D4D0CC] focus:border-[#1A1A1A] focus:outline-none disabled:opacity-50 placeholder-[#6B6B6B]"
          />
          <button
            type="submit"
            disabled={isProcessing || !textInput.trim()}
            className="px-4 py-2 bg-[#1A1A1A] text-[#FAF8F5] text-[10px] tracking-widest uppercase font-medium hover:bg-[#333] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
        <MicrophoneButton
          isListening={isListening}
          isProcessing={isProcessing}
          onStart={startListening}
          onStop={stopListening}
        />
      </div>
    </div>
  );
};
