'use client';

import Link from 'next/link';

const SECTIONS = [
  {
    href: '/admin/users',
    title: 'Users',
    blurb: 'The sign-in allowlist — add teammates, change roles, deactivate.',
  },
  {
    href: '/admin/grade-names',
    title: 'Grade names',
    blurb: 'Configure the name for each grade value (renames never rewrite minted certs).',
  },
  {
    href: '/admin/certs',
    title: 'Certs',
    blurb: 'Search any certification and void mistakes (numbers are never reused).',
  },
];

export default function AdminHome() {
  return (
    <main className="grid gap-4 sm:grid-cols-3">
      {SECTIONS.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className="rounded-lg border border-neutral-300 bg-white p-4 hover:border-neutral-500"
        >
          <h2 className="font-bold text-neutral-900">{section.title}</h2>
          <p className="mt-1 text-sm text-neutral-500">{section.blurb}</p>
        </Link>
      ))}
    </main>
  );
}
