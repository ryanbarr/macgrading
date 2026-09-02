'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TeamUserDto } from '@macgrading/shared';
import { adminFetch } from '@/lib/admin-api';

export default function AdminUsers() {
  const [users, setUsers] = useState<TeamUserDto[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'TEAM_MEMBER' | 'ADMIN'>('TEAM_MEMBER');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setUsers(await adminFetch<TeamUserDto[]>('/users'));
  }, []);

  useEffect(() => {
    load().catch((err) => setError(String(err instanceof Error ? err.message : err)));
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-neutral-900">Users</h1>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() =>
            adminFetch('/users', { method: 'POST', body: { email, role } }),
          ).then(() => setEmail(''));
        }}
      >
        <input
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2"
          placeholder="teammate@macgrading.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label="New user email"
        />
        <select
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2"
          value={role}
          onChange={(event) => setRole(event.target.value as 'TEAM_MEMBER' | 'ADMIN')}
          aria-label="New user role"
        >
          <option value="TEAM_MEMBER">Team member</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-neutral-700 px-4 py-2 font-semibold text-white hover:bg-neutral-800"
        >
          Add user
        </button>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-neutral-500">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-neutral-200">
                <td className="py-2 pr-4 text-neutral-900">{user.email}</td>
                <td className="py-2 pr-4 text-neutral-600">{user.name}</td>
                <td className="py-2 pr-4">{user.role}</td>
                <td className="py-2 pr-4">
                  {user.isActive ? 'Active' : (
                    <span className="text-neutral-400">Deactivated</span>
                  )}
                </td>
                <td className="flex gap-3 py-2 text-neutral-700">
                  <button
                    className="underline"
                    onClick={() =>
                      void run(() =>
                        adminFetch(`/users/${user.id}`, {
                          method: 'PATCH',
                          body: { isActive: !user.isActive },
                        }),
                      )
                    }
                  >
                    {user.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button
                    className="underline"
                    onClick={() =>
                      void run(() =>
                        adminFetch(`/users/${user.id}`, {
                          method: 'PATCH',
                          body: {
                            role: user.role === 'ADMIN' ? 'TEAM_MEMBER' : 'ADMIN',
                          },
                        }),
                      )
                    }
                  >
                    Make {user.role === 'ADMIN' ? 'team member' : 'admin'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
