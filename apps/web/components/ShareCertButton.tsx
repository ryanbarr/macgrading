'use client';

import { useState } from 'react';

export function ShareCertButton({
  url,
  title,
}: {
  url: string;
  title: string;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // cancelled or unsupported payload — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing sensible left to do
    }
  };

  return (
    <button
      onClick={() => void share()}
      className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-[15px] font-bold text-white transition hover:bg-neutral-800"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-[18px] w-[18px]"
      >
        <path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" />
      </svg>
      {copied ? 'Link copied!' : 'Share this cert'}
    </button>
  );
}
