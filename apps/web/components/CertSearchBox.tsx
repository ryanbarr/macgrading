'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { searchDestination } from '@/lib/search';

export function CertSearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');

  return (
    <form
      className="flex w-full max-w-xl gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(searchDestination(value));
      }}
    >
      <input
        className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-lg text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
        placeholder="Enter a cert number or card name…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoFocus={autoFocus}
        aria-label="Search certifications"
      />
      <button
        type="submit"
        className="rounded-lg bg-neutral-700 px-6 py-3 text-lg font-semibold text-white hover:bg-neutral-800"
      >
        Look up
      </button>
    </form>
  );
}
