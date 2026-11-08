import { useRef, useState } from "react";
import { ClipboardCopy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/app/modal";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { assignSchoolAdministrator } from "@/lib/school-administration.functions";
import { createSchoolUser } from "@/lib/settings.functions";
import { generateTemporaryPassword } from "@/lib/temporary-password";
import { schoolAdministrationError } from "@/lib/school-administration";

export function SchoolAdministratorModal({
  schoolId,
  schoolName,
  onClose,
  onSaved,
}: {
  schoolId: string;
  schoolName: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState("existing");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"school_owner" | "school_manager">("school_owner");
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const lock = useRef(false);
  function close() {
    setPassword("");
    setRevealed(null);
    onClose();
  }
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "existing"
          ? await assignSchoolAdministrator({ data: { schoolId, email, role } })
          : await createSchoolUser({
              data: {
                schoolId,
                email,
                fullName: name,
                temporaryPassword: password,
                roles: [role],
                customRoles: [],
                sendEmail,
              },
            });
      if (result.error) throw new Error(result.error);
      if ("warning" in result && typeof result.warning === "string") toast.warning(result.warning);
      toast.success("تم تعيين مسؤول المدرسة");
      if (mode === "new") {
        setRevealed(password);
        setPassword("");
      } else close();
      await onSaved().catch(() => toast.warning("تم الحفظ؛ أعد تحميل قائمة المدارس"));
    } catch (e) {
      setError(schoolAdministrationError(e));
      lock.current = false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={`تعيين مسؤول: ${schoolName}`}
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      {revealed !== null ? (
        <div dir="rtl" className="space-y-4">
          <p>تم إنشاء المستخدم. تظهر كلمة المرور مرة واحدة فقط.</p>
          <p dir="ltr" className="break-all">
            {email}
          </p>
          <div className="flex gap-2 items-center">
            <code dir="ltr" className="min-w-0 flex-1 break-all select-all">
              {revealed}
            </code>
            <Button
              variant="outline"
              size="icon"
              title="نسخ كلمة المرور"
              onClick={() =>
                void navigator.clipboard
                  .writeText(revealed)
                  .then(() => toast.success("تم النسخ"))
                  .catch(() => toast.error("تعذر النسخ"))
              }
            >
              <ClipboardCopy className="size-4" />
            </Button>
          </div>
          <Button onClick={close}>إغلاق</Button>
        </div>
      ) : (
        <form
          dir="rtl"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <FormField label="الحساب">
              {(p) => (
                <select
                  {...p}
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setPassword("");
                  }}
                  className="h-10 w-full rounded-md border bg-background px-3"
                >
                  <option value="existing">تعيين مستخدم موجود</option>
                  <option value="new">إنشاء مستخدم جديد</option>
                </select>
              )}
            </FormField>
            <FormField label="البريد الإلكتروني" required>
              {(p) => (
                <Input
                  {...p}
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </FormField>
            {mode === "new" && (
              <>
                <FormField label="الاسم" required>
                  {(p) => (
                    <Input {...p} required value={name} onChange={(e) => setName(e.target.value)} />
                  )}
                </FormField>
                <FormField label="كلمة المرور المؤقتة" required>
                  {(p) => (
                    <div className="flex gap-2">
                      <Input
                        {...p}
                        required
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        title="توليد كلمة مرور"
                        onClick={() => setPassword(generateTemporaryPassword())}
                      >
                        <Sparkles className="size-4" />
                        توليد
                      </Button>
                    </div>
                  )}
                </FormField>
                <label className="flex gap-2 items-center text-sm">
                  <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
                  إرسال بريد إعادة تعيين كلمة المرور (اختياري)
                </label>
              </>
            )}
            <FormField label="الدور">
              {(p) => (
                <select
                  {...p}
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="h-10 w-full rounded-md border bg-background px-3"
                >
                  <option value="school_owner">مالك المدرسة</option>
                  <option value="school_manager">مدير المدرسة</option>
                </select>
              )}
            </FormField>
            {error && (
              <p role="alert" className="text-destructive break-words">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "جار التعيين..." : "تعيين المسؤول"}
            </Button>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
