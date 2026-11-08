import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared presentation only; each route retains its own authentication flow. */
export function AuthFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main dir="rtl" className="madar-auth">
      <section className={cn("madar-auth__card", wide && "madar-auth__card--wide")}>
        <img
          src="/images/madar-logo-official.webp"
          width="1920"
          height="640"
          alt="مدار | Madar — منصة إدارة العمليات المدرسية"
          className="madar-auth__logo"
        />
        {children}
      </section>
    </main>
  );
}
