"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { User, Mail, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import FormAlert from "@/components/ui/FormAlert";
import { signup } from "@/app/actions/auth";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);
    try {
      await signup({
        email: String(formData.get("email")),
        password: String(formData.get("password")),
        name: String(formData.get("name")),
      });
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });
      router.push("/canvas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-[var(--text,#eafcff)]/10 bg-[var(--panel-bg,rgba(15,25,35,0.85))] p-8 shadow-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-[var(--text,#eafcff)]">Sign up</h1>
      <form action={handleSubmit} data-testid="signup-form" className="flex flex-col gap-4">
        <Input name="name" placeholder="Name" label="Name" hideLabel icon={<User size={16} />} required />
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
        <Button type="submit" loading={submitting}>
          Sign up
        </Button>
        {error && <FormAlert>{error}</FormAlert>}
      </form>
      <p className="mt-6 text-center text-sm text-[var(--text,#eafcff)]/60">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--accent,#38e0ff)] hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
