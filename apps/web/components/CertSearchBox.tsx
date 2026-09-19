'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { searchDestination } from '@/lib/search';

export function CertSearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');

  return (
    <form
      className="flex w-full max-w-xl items-center gap-1.5 rounded-full border border-line bg-white p-1.5 shadow-[0_10px_24px_-18px_rgba(17,17,20,0.5)] focus-within:border-ink"
      action="/catalog"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(searchDestination(value));
      }}
    >
      <input
        className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-[15px] text-ink placeholder:text-sm placeholder:text-muted focus:outline-none"
        placeholder="Cert # or card name"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoFocus={autoFocus}
        aria-label="Search certifications"
      />
      <button
        type="submit"
        className="flex-none rounded-full bg-ink px-4 py-2.5 text-[15px] font-bold text-white transition hover:bg-neutral-800"
      >
        Look up
      </button>
    </form>
  );
}
