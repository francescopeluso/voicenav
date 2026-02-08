import React from "react";

interface Props {
  isListening: boolean;
  isProcessing: boolean;
  onStart: () => void;
  onStop: () => void;
}

export const MicrophoneButton: React.FC<Props> = ({
  isListening,
  isProcessing,
  onStart,
  onStop,
}) => {
  const disabled = isProcessing;

  const handleClick = () => {
    if (disabled) return;
    isListening ? onStop() : onStart();
  };

  let bg = "bg-[#1A1A1A] hover:bg-[#333]";
  let label = "Speak";
  let icon = micIcon;

  if (isListening) {
    bg = "bg-[#1A1A1A]";
    label = "Listening";
    icon = stopIcon;
  } else if (isProcessing) {
    bg = "bg-[#999] cursor-not-allowed";
    label = "Working";
    icon = spinnerIcon;
  }

  return (
    <div className="flex flex-col items-center gap-1.5 py-3">
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`relative w-12 h-12 ${bg} flex items-center justify-center transition-colors`}
      >
        {isListening && (
          <div className="absolute inset-0 bg-[#1A1A1A] mic-pulse" />
        )}
        <span className="relative z-10">{icon}</span>
      </button>
      <span className="text-[10px] tracking-widest uppercase text-[#6B6B6B]">
        {label}
      </span>
    </div>
  );
};

const micIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAF8F5" strokeWidth="1.5">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
);

const stopIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#FAF8F5" stroke="none">
    <rect x="7" y="7" width="10" height="10" />
  </svg>
);

const spinnerIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FAF8F5" strokeWidth="1.5" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
