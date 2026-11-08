import { useState } from "react";
import madarMark from "@/assets/madar-mark.png.asset.json";
import madarLogo from "@/assets/madar-logo-full.png.asset.json";
import { cn } from "@/lib/utils";

export function MadarMark({ className }: { className?: string }) {
  return (
    <img
      src={madarMark.url}
      onError={(event) => {
        if (!event.currentTarget.src.endsWith("/favicon.png"))
          event.currentTarget.src = "/favicon.png";
      }}
      alt="شعار مدار"
      className={cn("object-contain", className)}
    />
  );
}

export function MadarLogo({ className }: { className?: string }) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable)
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <img src="/favicon.png" alt="" className="h-full max-h-12 w-auto object-contain" />
        <span className="text-xl font-semibold">مدار | Madar</span>
      </div>
    );
  return (
    <img
      src={madarLogo.url}
      onError={() => setUnavailable(true)}
      alt="مدار | Madar — منصة إدارة العمليات المدرسية"
      className={cn("object-contain", className)}
    />
  );
}
