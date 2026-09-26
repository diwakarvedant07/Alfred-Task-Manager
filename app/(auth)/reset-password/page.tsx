"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import Button, { buttonClassName } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import FormAlert from "@/components/ui/FormAlert";
import { resetPassword } from "@/app/actions/auth";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const password = String(formData.get("password"));
    const confirmPassword = String(formData.get("confirmPassword"));
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("This reset link is missing its token.");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="elevated w-full max-w-sm animate-rise rounded-3xl border border-fg/10 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-8 backdrop-blur-xl [animation-delay:80ms]">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-fg">Password updated</h1>
        <p className="mb-6 text-sm text-fg/65">
          Your password has been reset. You can log in with your new password now.
        </p>
        <Link href="/login" className={buttonClassName("primary", "w-full")}>
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="elevated w-full max-w-sm animate-rise rounded-3xl border border-fg/10 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-8 backdrop-blur-xl [animation-delay:80ms]">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-fg">Reset password</h1>
      <form action={handleSubmit} data-testid="reset-password-form" className="flex flex-col gap-4">
        <Input name="password" type="password" placeholder="New password" label="New password" icon={<Lock size={16} />} required />
        <Input
          name="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          label="Confirm new password"
          icon={<Lock size={16} />}
          required
        />
        <Button type="submit" loading={submitting}>
          Reset password
        </Button>
        {error && <FormAlert>{error}</FormAlert>}
      </form>
    </div>
  );
}
