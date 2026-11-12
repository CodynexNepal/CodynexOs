"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { ShieldCheck } from "lucide-react";
import { loginSchema } from "@/schemas/forms.schema";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { CodyNexLogoMark } from "@/components/ui/CodyNexLogo";

interface LoginFormValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { login, isAuthenticating } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: yupResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    const res = await login(values.email, values.password);
    if (!res.ok && res.error) {
      setServerError(res.error);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <CodyNexLogoMark className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-bold text-ink">CodyNex OS</h1>
            <p className="text-xs text-ink-muted">CEO Command Center Authentication</p>
          </div>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {serverError && (
              <div
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
              >
                {serverError}
              </div>
            )}

            <Input
              label="CEO / Operator Email"
              type="email"
              placeholder="ceo@codynex.local"
              error={errors.email?.message}
              {...register("email")}
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••••••"
              error={errors.password?.message}
              {...register("password")}
            />

            <Button type="submit" variant="dark" className="w-full" loading={isAuthenticating}>
              Sign in to Command Center
            </Button>
          </form>

          <div className="mt-5 flex items-center gap-2 border-t border-surface-border pt-4 text-xs text-ink-muted">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#14532D] dark:text-brand" />
            <span>HttpOnly cookie + RBAC session. NPR 0 paid-AI lock enabled by default.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
