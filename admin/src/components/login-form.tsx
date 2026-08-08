'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert, Button, Field, inputClass } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

export function LoginForm({
  next,
  initialError,
  labels,
}: {
  next: string;
  initialError?: string;
  labels: {
    email: string;
    password: string;
    submit: string;
    pending: string;
    failed: string;
  };
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // 認証エラーの詳細は出さない（アカウントの存在有無を推測されないため）
      setError(labels.failed);
      setPending(false);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <Field label={labels.email} required>
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
      </Field>

      <Field label={labels.password} required>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder="••••••••"
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? labels.pending : labels.submit}
      </Button>
    </form>
  );
}
