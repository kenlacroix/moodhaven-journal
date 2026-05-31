// Toolbar icon components (TB prefix to avoid collision with FloatingToolbar icons)

export function TBBoldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
    </svg>
  );
}

export function TBItalicIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 4h4m-2 0l-4 16m0 0h4" />
    </svg>
  );
}

export function TBUnderlineIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v7a5 5 0 0010 0V4M5 21h14" />
    </svg>
  );
}

export function TBStrikeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 12H7m10-4a4 4 0 00-4-4H9a4 4 0 000 8m2 8a4 4 0 004-4" />
    </svg>
  );
}

export function TBBulletListIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h9m-9 5.25h9m-9 5.25h9M4.5 6.75h.007v.008H4.5V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM4.5 12h.007v.008H4.5V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H4.5v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

export function TBOrderedListIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h9m-9 5.25h9m-9 5.25h9" />
      <text x="3" y="8.5" fontSize="6" fill="currentColor" fontFamily="sans-serif">1</text>
      <text x="3" y="14" fontSize="6" fill="currentColor" fontFamily="sans-serif">2</text>
      <text x="3" y="19.5" fontSize="6" fill="currentColor" fontFamily="sans-serif">3</text>
    </svg>
  );
}

export function TBLinkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

export function TBEmojiIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function TBHeading2Icon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v12M4 12h7M11 6v12" />
      <text x="15" y="19" fontSize="10" fill="currentColor" stroke="none" fontWeight="bold" fontFamily="sans-serif">2</text>
    </svg>
  );
}

export function TBHeading3Icon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v12M4 12h7M11 6v12" />
      <text x="15" y="19" fontSize="10" fill="currentColor" stroke="none" fontWeight="bold" fontFamily="sans-serif">3</text>
    </svg>
  );
}

export function TBBlockquoteIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z" />
    </svg>
  );
}

export function TBTaskListIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="4" height="4" rx="0.5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.25 7l0.75 0.75L6.5 6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 7h10" />
      <rect x="3" y="14" width="4" height="4" rx="0.5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 16h10" />
    </svg>
  );
}

export function TBMicIcon({ isRecording }: { isRecording?: boolean }) {
  return (
    <svg className="w-4 h-4" fill={isRecording ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}
