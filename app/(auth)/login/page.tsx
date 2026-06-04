"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogIn, Mail } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ui/toast";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { signIn, resetPassword, authError, clearAuthError } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (!authError) {
      return;
    }

    toast({
      title: "Could not sign in",
      description: authError,
      variant: "error",
    });
    clearAuthError();
  }, [authError, clearAuthError, toast]);

  async function onSubmit(values: LoginForm) {
    setError("");

    try {
      await signIn(values.email, values.password);
      toast({
        title: "Signed in successfully",
        description: "Your account and permissions are ready.",
        variant: "success",
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Sign in failed.");
    }
  }

  async function handleReset() {
    const email = getValues("email");
    setError("");

    if (!email) {
      const message = "Enter your email first, then request a reset link.";
      setError(message);
      toast({ title: "Email required", description: message, variant: "error" });
      return;
    }

    try {
      await resetPassword(email);
      toast({
        title: "Password reset sent",
        description: "Check your inbox for the Firebase password reset link.",
        variant: "success",
      });
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : "Password reset could not be sent for that email.";
      setError(message);
      toast({ title: "Reset failed", description: message, variant: "error" });
    }
  }

  return (
    <section className="grid w-full max-w-5xl overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm md:grid-cols-[1.1fr_0.9fr]">
      <div className="flex min-h-[560px] flex-col justify-between bg-emerald-800 p-8 text-white">
        <div>
          <div className="relative h-28 w-72 overflow-hidden rounded-md bg-white">
            <Image src="/desh-logo.jpg" alt="Desh Chemists Ltd" fill sizes="288px" className="object-cover object-left" priority />
          </div>
          <h1 className="mt-8 max-w-sm text-3xl font-semibold leading-tight">
            PharmPOS for Desh Chemists Ltd
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-emerald-50">
            Shared-stock pharmacy management, retail sales, wholesale documents, traceability, and reports.
          </p>
        </div>
        <p className="text-sm text-lime-100">Quality Medicine, Better Life</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col justify-center p-8">
        <p className="text-sm font-semibold uppercase text-lime-700">Secure access</p>
        <h2 className="mt-2 text-2xl font-semibold text-emerald-950">Sign in</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Use the email/password account created by the owner or system administrator.
        </p>

        <label className="mt-8 text-sm font-medium text-emerald-950" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="mt-2 h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          {...register("email")}
        />
        {errors.email ? <p className="mt-1 text-xs text-red-600">{errors.email.message}</p> : null}

        <label className="mt-5 text-sm font-medium text-emerald-950" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="mt-2 h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          {...register("password")}
        />
        {errors.password ? <p className="mt-1 text-xs text-red-600">{errors.password.message}</p> : null}

        {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 flex h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {isSubmitting ? "Checking account and permissions..." : "Sign in"}
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="mt-3 flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-900/15 px-4 text-sm font-medium text-emerald-950 hover:bg-emerald-50"
        >
          <Mail className="h-4 w-4" />
          Send reset link
        </button>
      </form>
    </section>
  );
}
