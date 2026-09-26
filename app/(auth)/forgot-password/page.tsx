"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import FormAlert from "@/components/ui/FormAlert";
import { requestPasswordReset } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);
    try {
      const result = await requestPasswordReset(String(formData.get("email")));
      setResetUrl(result.resetUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a reset link.");
    } finally {
      setSubmitting(false);
    }
  }

  if (resetUrl) {
    return (
      <div className="elevated w-full max-w-sm animate-rise rounded-3xl border border-fg/10 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-8 backdrop-blur-xl [animation-delay:80ms]">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-fg">Check your email</h1>
        <p className="text-sm text-fg/65">
          If an account exists for that email, a password reset link has been generated.
        </p>
        <div className="mt-4 rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-fg">
          <p className="mb-1 font-medium">Dev mode — no email provider is configured:</p>
          <Link href={resetUrl} className="break-all text-accent underline">
            {resetUrl}
          </Link>
        </div>
        <p className="mt-6 text-center text-sm text-fg/55">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="elevated w-full max-w-sm animate-rise rounded-3xl border border-fg/10 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-8 backdrop-blur-xl [animation-delay:80ms]">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-fg">Forgot password</h1>
      <p className="mb-6 text-sm text-fg/55">
        Enter your email and we&apos;ll generate a reset link.
      </p>
      <form action={handleSubmit} data-testid="forgot-password-form" className="flex flex-col gap-4">
        <Input name="email" type="email" placeholder="you@example.com" label="Email" icon={<Mail size={16} />} required />
        <Button type="submit" loading={submitting}>
          Send reset link
        </Button>
        {error && <FormAlert>{error}</FormAlert>}
      </form>
      <p className="mt-6 text-center text-sm text-fg/55">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
