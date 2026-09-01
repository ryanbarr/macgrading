'use client';

export default function CertError() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-neutral-900">Temporarily unavailable</h1>
      <p className="mt-2 text-neutral-500">
        We couldn’t reach the certification registry. Your cert is safe — try again
        in a minute.
      </p>
    </main>
  );
}
