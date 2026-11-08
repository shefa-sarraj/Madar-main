import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AuthFrame } from "@/components/app/auth-frame";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تعيين كلمة مرور جديدة — مدار | Madar" },
      { name: "description", content: "تعيين كلمة مرور جديدة لحسابك في منصة مدار." },
      { property: "og:title", content: "تعيين كلمة مرور جديدة — مدار | Madar" },
      { property: "og:description", content: "تعيين كلمة مرور جديدة لحسابك في منصة مدار." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("كلمة المرور يجب أن تتكون من ٨ أحرف على الأقل.");
      return;
    }
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError("تعذّر تحديث كلمة المرور. قد يكون الرابط منتهي الصلاحية.");
      return;
    }

    toast.success("تم تحديث كلمة المرور");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <AuthFrame>
      <div className="madar-auth__heading">
        <h1 className="text-xl font-semibold text-foreground">تعيين كلمة مرور جديدة</h1>
        <p className="text-sm text-muted-foreground">
          {ready
            ? "اختر كلمة مرور قوية لحسابك."
            : "افتح هذه الصفحة من رابط إعادة التعيين المُرسل إلى بريدك الإلكتروني."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="madar-auth__form" aria-busy={submitting}>
        <FormField label="كلمة المرور الجديدة" required hint="٨ أحرف على الأقل">
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              required
              disabled={!ready}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </FormField>

        <FormField label="تأكيد كلمة المرور" required>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              required
              disabled={!ready}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          )}
        </FormField>

        {error ? (
          <p role="alert" className="madar-auth__error">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={submitting || !ready}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          حفظ كلمة المرور
        </Button>
      </form>
      <Link to="/" className="madar-auth__back">
        العودة لتسجيل الدخول
      </Link>
    </AuthFrame>
  );
}
