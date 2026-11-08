import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, MailCheck, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthFrame } from "@/components/app/auth-frame";
export const Route = createFileRoute("/register-school")({ ssr: false, component: RegisterSchool });
function RegisterSchool() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [role, setRole] = useState("school_owner");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name, school_name: school, manager_request: true, requested_role: role },
      },
    });
    setBusy(false);
    setPassword("");
    if (error) {
      setMessage("تعذر إرسال الطلب. تحقق من الاتصال وحاول مرة أخرى.");
      return;
    }
    setDone(true);
    setMessage(
      "تم إرسال الطلب. تحقق من بريدك الإلكتروني لتأكيد الحساب ثم سجل الدخول لمتابعة الطلب.",
    );
  }
  return (
    <AuthFrame wide>
      <div className="madar-auth__heading">
        <h1>طلب إدارة مدرسة</h1>
        {!done ? <p>أدخل بيانات المدرسة ومسؤول الحساب لإرسال الطلب.</p> : null}
      </div>
      {!done && (
        <form onSubmit={submit} className="madar-auth__form madar-auth__request" aria-busy={busy}>
          <FormField label="اسم المدرسة" required>
            {(p) => (
              <Input
                {...p}
                required
                maxLength={200}
                value={school}
                onChange={(e) => setSchool(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="الاسم الكامل" required>
            {(p) => (
              <Input
                {...p}
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="البريد الإلكتروني" required>
            {(p) => (
              <Input
                {...p}
                required
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="كلمة المرور" required>
            {(p) => (
              <Input
                {...p}
                required
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </FormField>
          <div className="madar-auth__full space-y-2">
            <label htmlFor="school-request-role">الدور المطلوب</label>
            <select
              id="school-request-role"
              aria-label="الدور المطلوب"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-10 border rounded-md bg-background px-3"
            >
              <option value="school_owner">مالك المدرسة</option>
              <option value="school_manager">مدير المدرسة</option>
            </select>
          </div>
          <Button type="submit" disabled={busy} className="madar-auth__full">
            {busy ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="size-4" />
            )}
            إرسال الطلب
          </Button>
        </form>
      )}
      {done ? (
        <span className="madar-auth__success-icon">
          <MailCheck aria-hidden="true" />
        </span>
      ) : null}
      {message && (
        <p role="status" className="madar-auth__message">
          {message}
        </p>
      )}
      <Link to="/" className="madar-auth__back">
        تسجيل الدخول
      </Link>
    </AuthFrame>
  );
}
