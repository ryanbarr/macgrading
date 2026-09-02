'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AuthUserDto, LoginResponseDto } from '@macgrading/shared';
import {
  AdminApiError,
  adminFetch,
  getAdminToken,
  setAdminToken,
} from '@/lib/admin-api';

/**
 * Auth gate for the internal admin section: dev email sign-in (requires the
 * API's AUTH_DEV_MODE locally) — the Google button activates once real
 * client IDs are configured. ADMIN role required past the gate.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    if (!getAdminToken()) {
      setChecking(false);
      return;
    }
    try {
      setUser(await adminFetch<AuthUserDto>('/auth/me'));
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        setAdminToken(null);
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await adminFetch<LoginResponseDto>('/auth/google', {
        method: 'POST',
        body: { idToken: email.trim() },
      });
      setAdminToken(result.accessToken);
      setUser(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  };

  const signOut = () => {
    setAdminToken(null);
    setUser(null);
  };

  if (checking) {
    return <main className="p-12 text-neutral-400">Checking session…</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-bold text-neutral-900">MAC Grading Admin</h1>
        <form onSubmit={signIn} className="flex flex-col gap-3">
          <input
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2"
            placeholder="you@macgrading.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-label="Email for dev sign-in"
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-700 px-4 py-2 font-semibold text-white hover:bg-neutral-800"
          >
            Dev sign-in
          </button>
        </form>
        <button
          disabled
          className="rounded-lg border border-neutral-300 px-4 py-2 text-neutral-400"
          title="Activates when Google client IDs are configured"
        >
          Sign in with Google (not configured)
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <p className="text-xs text-neutral-400">
          Dev sign-in requires AUTH_DEV_MODE on the API.
        </p>
      </main>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-3 px-6 text-center">
        <p className="text-neutral-900">
          Signed in as {user.email}, but admin access is required.
        </p>
        <button onClick={signOut} className="text-neutral-600 underline">
          Sign out
        </button>
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <nav className="flex gap-4 text-sm font-semibold text-neutral-700">
          <Link href="/admin" className="hover:underline">
            Admin
          </Link>
          <Link href="/admin/users" className="hover:underline">
            Users
          </Link>
          <Link href="/admin/grade-names" className="hover:underline">
            Grade names
          </Link>
          <Link href="/admin/certs" className="hover:underline">
            Certs
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>{user.email}</span>
          <button onClick={signOut} className="underline">
            Sign out
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
