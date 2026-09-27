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
    <div className="elevated w-full max-w-sm animate-rise rounded-3xl border border-fg/10 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-8 backdrop-blur-xl [animation-delay:80ms]">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Sign up</h1>
      <p className="mb-6 mt-1 text-sm text-fg/55">Create an account to start your canvas.</p>
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
      <p className="mt-6 text-center text-sm text-fg/55">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
