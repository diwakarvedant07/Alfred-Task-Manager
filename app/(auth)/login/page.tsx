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
    <div className="elevated w-full max-w-sm animate-rise rounded-3xl border border-fg/10 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-8 backdrop-blur-xl [animation-delay:80ms]">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Log in</h1>
      <p className="mb-6 mt-1 text-sm text-fg/55">Welcome back — pick up where you left off.</p>
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
        <Link href="/forgot-password" className="self-end text-xs font-medium text-accent hover:underline">
          Forgot password?
        </Link>
        <Button type="submit" loading={submitting}>
          Log in
        </Button>
        {error && <FormAlert>{error}</FormAlert>}
      </form>
      <p className="mt-6 text-center text-sm text-fg/55">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
