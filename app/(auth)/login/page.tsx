"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Mail, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import FormAlert from "@/components/ui/FormAlert";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password.");
        setSubmitting(false);
        return;
      }
      router.push("/canvas");
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-8 shadow-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-[var(--text,#eafcff)]">Log in</h1>
      <form action={handleSubmit} data-testid="login-form" className="flex flex-col gap-4">
        <Input
          name="email"
          type="email"
          placeholder="Email"
          label="Email"
          hideLabel
          icon={<Mail size={16} />}
          required
        />
        <Input
          name="password"
          type="password"
          placeholder="Password"
          label="Password"
          hideLabel
          icon={<Lock size={16} />}
          required
        />
        <Link href="/forgot-password" className="self-end text-xs text-[var(--accent,#38e0ff)] hover:underline">
          Forgot password?
        </Link>
        <Button type="submit" loading={submitting}>
          Log in
        </Button>
        {error && <FormAlert>{error}</FormAlert>}
      </form>
      <p className="mt-6 text-center text-sm text-[var(--text,#eafcff)]/60">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-[var(--accent,#38e0ff)] hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
