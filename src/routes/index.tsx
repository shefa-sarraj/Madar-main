import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  GraduationCap,
  Loader2,
  LogIn,
  LockKeyhole,
  Mail,
  School,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — مدار | Madar" },
      {
        name: "description",
        content: "تسجيل الدخول إلى منصة مدار لإدارة العمليات الإدارية والمالية للمدارس.",
      },
      { property: "og:title", content: "تسجيل الدخول — مدار | Madar" },
      {
        property: "og:description",
        content: "تسجيل الدخول إلى منصة مدار لإدارة العمليات الإدارية والمالية للمدارس.",
      },
    ],
  }),
  component: LoginPage,
});

async function loginDestination(userId: string) {
  const { data, error } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (error) throw error;
  return data ? "/platform" : "/dashboard";
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (data.session) window.location.replace(await loginDestination(data.session.user.id));
      })
      .catch(() => setError("تعذر التحقق من صلاحيات الحساب. أعد المحاولة."));
  }, []);
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);

    if (signInError) {
      setError("بيانات الدخول غير صحيحة. يرجى التأكد من البريد الإلكتروني وكلمة المرور.");
      return;
    }

    toast.success("تم تسجيل الدخول بنجاح");
    try {
      window.location.replace(await loginDestination(data.user!.id));
    } catch {
      setError("تعذر التحقق من صلاحيات الحساب. أعد المحاولة.");
    }
  }

  return (
    <main className="madar-login" dir="rtl">
      <section className="madar-login__form-panel" aria-labelledby="login-title">
        <div className="madar-login__card">
          <img
            src="/images/madar-logo-official.webp"
            alt="مدار | Madar — منصة إدارة العمليات المدرسية"
            width="1920"
            height="640"
            className="madar-login__logo"
            fetchPriority="high"
          />

          <div className="madar-login__heading">
            <h1 id="login-title">تسجيل الدخول</h1>
            <p>أدخل بيانات حسابك للوصول إلى لوحة إدارة المدرسة.</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="madar-login__form"
            aria-busy={submitting}
            aria-describedby={error ? "login-error" : undefined}
          >
            <FormField label="البريد الإلكتروني" required>
              {(props) => (
                <div className="madar-login__input-wrap">
                  <Mail aria-hidden="true" className="madar-login__input-icon" />
                  <Input
                    {...props}
                    type="email"
                    dir="ltr"
                    className="madar-login__input text-start"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@school.edu"
                  />
                </div>
              )}
            </FormField>

            <FormField label="كلمة المرور" required>
              {(props) => (
                <div className="madar-login__input-wrap">
                  <LockKeyhole aria-hidden="true" className="madar-login__input-icon" />
                  <Input
                    {...props}
                    type="password"
                    dir="ltr"
                    className="madar-login__input"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              )}
            </FormField>

            {error ? (
              <p id="login-error" role="alert" className="madar-login__error">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="madar-login__submit" disabled={submitting}>
              {submitting ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <LogIn aria-hidden="true" />
              )}
              {submitting ? "جارٍ تسجيل الدخول…" : "دخول"}
            </Button>

            <div className="madar-login__links">
              <Link to="/forgot-password">نسيت كلمة المرور؟</Link>
              <Link to="/register-school">
                <School aria-hidden="true" />
                طلب إدارة مدرسة
              </Link>
            </div>
          </form>
        </div>
      </section>

      <aside className="madar-login__hero" aria-labelledby="login-value-title">
        <div className="madar-login__arch" aria-hidden="true" />
        <div className="madar-login__hero-top">
          <img
            src="/images/madar-logo-official.webp"
            alt="مدار | Madar"
            width="1920"
            height="640"
            className="madar-login__hero-logo"
          />

          <div className="madar-login__value">
            <span className="madar-login__gold-rule" aria-hidden="true" />
            <h2 id="login-value-title">
              منصة متكاملة لإدارة العمليات
              <br />
              <span>الإدارية والمالية</span> للمدارس الخاصة
            </h2>
            <p>
              سجل الطلاب، التسجيل والقبول، الأقساط والمدفوعات، المصروفات، الموظفون، الحضور، المخزون
              والأصول — ضمن نظام واحد منظم ومحكم الصلاحيات.
            </p>
          </div>
        </div>

        <div className="madar-login__hero-bottom">
          <ul className="madar-login__features" aria-label="عمليات المدرسة في منصة واحدة">
            {[
              { icon: GraduationCap, label: "الطلاب", detail: "والتسجيل والقبول" },
              { icon: CreditCard, label: "الأقساط", detail: "والمدفوعات" },
              { icon: CalendarDays, label: "الحضور", detail: "والغياب" },
              { icon: Users, label: "الموظفون", detail: "والصلاحيات" },
              { icon: BarChart3, label: "التقارير", detail: "والتحليلات" },
            ].map(({ icon: Icon, label, detail }) => (
              <li key={label}>
                <Icon aria-hidden="true" />
                <span>
                  {label}
                  <br />
                  {detail}
                </span>
              </li>
            ))}
          </ul>
          <p className="madar-login__security">
            <ShieldCheck aria-hidden="true" />
            جميع البيانات محمية بصلاحيات على مستوى المدرسة والدور الوظيفي.
          </p>
        </div>
      </aside>
    </main>
  );
}
