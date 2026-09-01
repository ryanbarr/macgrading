import Link from 'next/link';

export default function CertNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-neutral-900">No cert found</h1>
      <p className="mt-2 text-neutral-500">
        Check the number on your slab — it should be nine digits, possibly starting
        with a P.
      </p>
      <Link href="/" className="mt-6 text-neutral-700 underline">
        Search again
      </Link>
    </main>
  );
}
