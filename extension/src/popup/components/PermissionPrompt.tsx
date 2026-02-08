import React from "react";

interface Props {
  permissions: string[];
  onGrant: () => void;
  onDeny: () => void;
}

const LABELS: Record<string, string> = {
  read: "Read page content",
  navigate: "Navigate to another page",
  interact: "Click and type on page",
};

export const PermissionPrompt: React.FC<Props> = ({
  permissions,
  onGrant,
  onDeny,
}) => {
  return (
    <div className="mx-4 my-2 p-4 border border-[#1A1A1A] bg-[#F0EDEA] fade-in">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-mono">!</span>
        <span className="text-[10px] tracking-widest uppercase text-[#1A1A1A] font-medium">
          Permission Required
        </span>
      </div>
      <ul className="text-xs text-[#1A1A1A] mb-4 space-y-1.5">
        {permissions.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <span className="w-1 h-1 bg-[#1A1A1A]" />
            {LABELS[p] || p}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          onClick={onDeny}
          className="flex-1 px-3 py-2 text-[10px] tracking-widest uppercase border border-[#D4D0CC] text-[#6B6B6B] hover:bg-[#F0EDEA] transition-colors"
        >
          Deny
        </button>
        <button
          onClick={onGrant}
          className="flex-1 px-3 py-2 text-[10px] tracking-widest uppercase bg-[#1A1A1A] text-[#FAF8F5] hover:bg-[#333] transition-colors font-medium"
        >
          Allow
        </button>
      </div>
    </div>
  );
};
