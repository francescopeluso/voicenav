import React from "react";
import type { AgentUpdate } from "../../shared/types";

interface Props {
  updates: AgentUpdate[];
  transcription: string;
}

const STATUS: Record<string, { symbol: string; label: string }> = {
  thinking: { symbol: "\u2014", label: "Thinking" },
  executing: { symbol: "\u203A", label: "Executing" },
  step_complete: { symbol: "\u2713", label: "Done" },
  complete: { symbol: "\u2713", label: "Complete" },
  error: { symbol: "\u2717", label: "Error" },
  permission_request: { symbol: "!", label: "Permission" },
  user_message: { symbol: "\u203A", label: "You" },
};

export const StatusFeed: React.FC<Props> = ({ updates, transcription }) => {
  if (!transcription && updates.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#6B6B6B] text-xs tracking-wide px-8 text-center uppercase">
        Tap the microphone and speak a command
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {transcription && (
        <div className="fade-in border border-[#D4D0CC] p-3">
          <span className="text-[10px] tracking-widest uppercase text-[#6B6B6B] block mb-1">
            You said
          </span>
          <span className="text-sm text-[#1A1A1A]">
            &ldquo;{transcription}&rdquo;
          </span>
        </div>
      )}

      {updates.map((update, i) => {
        const cfg = STATUS[update.status] || STATUS.thinking;
        const isError = update.status === "error";
        const isUser = update.status === "user_message";
        const showSpeech = update.speech && update.status !== "step_complete";

        return (
          <div
            key={i}
            className={`fade-in p-3 border ${isError
                ? "border-[#1A1A1A] bg-[#F0EDEA]"
                : isUser
                  ? "border-transparent bg-[#EAEAEA]"
                  : "border-[#D4D0CC]"
              }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-[#1A1A1A]">
                {cfg.symbol}
              </span>
              <span className="text-[10px] tracking-widest uppercase text-[#6B6B6B]">
                {cfg.label}
                {update.step && update.total_steps
                  ? ` ${update.step}/${update.total_steps}`
                  : ""}
              </span>
              {update.action && (
                <span className="text-[10px] text-[#6B6B6B] ml-auto font-mono">
                  {update.action}
                </span>
              )}
            </div>
            {showSpeech && (
              <p className="text-sm text-[#1A1A1A] leading-relaxed">
                {update.speech}
              </p>
            )}
            {update.error && (
              <p className="text-xs text-[#1A1A1A] mt-1 font-mono">
                {update.error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};
