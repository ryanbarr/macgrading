import Link from 'next/link';

export function SiteNav({ showSearch = true }: { showSearch?: boolean }) {
  return (
    <nav className="flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2 text-[15px] font-black tracking-tight text-ink">
        <span className="h-[18px] w-[18px] rounded-md bg-grade" />
        MAC Grading
      </Link>
      {showSearch && (
        <Link
          href="/"
          aria-label="Look up another cert"
          className="grid h-[38px] w-[38px] place-items-center rounded-full border border-line text-ink hover:bg-tile"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[17px] w-[17px]">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </Link>
      )}
    </nav>
  );
}
