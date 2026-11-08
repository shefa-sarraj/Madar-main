import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";

import { AuthFrame } from "@/components/app/auth-frame";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "استعادة كلمة المرور — مدار | Madar" },
      { name: "description", content: "إرسال رابط إعادة تعيين كلمة المرور لحسابك في منصة مدار." },
      { property: "og:title", content: "استعادة كلمة المرور — مدار | Madar" },
      {
        property: "og:description",
        content: "إرسال رابط إعادة تعيين كلمة المرور لحسابك في منصة مدار.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);

    if (resetError) {
      setError("تعذّر إرسال الرابط حالياً. يرجى المحاولة مرة أخرى.");
      return;
    }
    setSent(true);
  }

  return (
    <AuthFrame>
      {sent ? (
        <div className="madar-auth__confirmation space-y-4" role="status">
          <span className="madar-auth__success-icon">
            <MailCheck aria-hidden="true" />
          </span>
          <h1 className="text-lg font-semibold text-foreground">تحقق من بريدك الإلكتروني</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            إذا كان هذا البريد مسجلاً لدينا، فسيصلك رابط لإعادة تعيين كلمة المرور خلال دقائق.
          </p>
          <Link to="/" className="madar-auth__back">
            العودة لتسجيل الدخول
          </Link>
        </div>
      ) : (
        <>
          <div className="madar-auth__heading">
            <h1 className="text-xl font-semibold text-foreground">استعادة كلمة المرور</h1>
            <p className="text-sm text-muted-foreground">
              أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="madar-auth__form" aria-busy={submitting}>
            <FormField label="البريد الإلكتروني" required>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  dir="ltr"
                  className="text-start"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@school.edu"
                />
              )}
            </FormField>

            {error ? (
              <p role="alert" className="madar-auth__error">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              إرسال الرابط
            </Button>

            <Link to="/" className="madar-auth__back">
              العودة لتسجيل الدخول
            </Link>
          </form>
        </>
      )}
    </AuthFrame>
  );
}
