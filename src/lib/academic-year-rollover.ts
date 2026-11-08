import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { Year } from "@/lib/settings";

export type Placement = { enrollment_id: string; grade_id: string; section_id: string | null };
export type RolloverPreview = {
  year: Year;
  stages: { id: string; name: string }[];
  grades: { id: string; stage_id: string; name: string }[];
  sections: { id: string; grade_id: string; name: string; capacity: number | null }[];
  students: {
    id: string;
    student_id: string;
    full_name: string;
    student_number: string;
    grade_id: string;
    section_id: string | null;
  }[];
  version: string;
  completed_year_id: string | null;
};
type RolloverDatabase = Database & {
  public: {
    Functions: {
      settings_rollover_preview: {
        Args: { _school_id: string; _source_year_id: string };
        Returns: Json;
      };
      settings_rollover_year: {
        Args: {
          _school_id: string;
          _source_year_id: string;
          _request_id: string;
          _name: string;
          _start: string;
          _end: string;
          _version: string;
          _placements: Json;
        };
        Returns: string;
      };
    };
  };
};
const client = supabase as unknown as SupabaseClient<RolloverDatabase>;
export async function fetchRolloverPreview(schoolId: string, sourceYearId: string) {
  const { data, error } = await client.rpc("settings_rollover_preview", {
    _school_id: schoolId,
    _source_year_id: sourceYearId,
  });
  if (error) throw error;
  return data as unknown as RolloverPreview;
}
export async function rolloverYear(
  schoolId: string,
  preview: RolloverPreview,
  requestId: string,
  name: string,
  start: string,
  end: string,
  placements: Placement[],
) {
  const { data, error } = await client.rpc("settings_rollover_year", {
    _school_id: schoolId,
    _source_year_id: preview.year.id,
    _request_id: requestId,
    _name: name,
    _start: start,
    _end: end,
    _version: preview.version,
    _placements: placements,
  });
  if (error) throw error;
  return data;
}
export function rolloverError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (message.includes("already been rolled")) return "تم ترحيل هذه السنة سابقاً.";
  if (message.includes("Preview changed"))
    return "تغيرت البيانات. أغلق النافذة وأعد تحميل المعاينة.";
  if (message.includes("capacity")) return "عدد الطلاب يتجاوز سعة إحدى الشعب.";
  if (message.includes("dates already")) return "اسم السنة أو تواريخها تتعارض مع سنة موجودة.";
  if (message.includes("source year ends"))
    return "يجب أن تبدأ السنة الجديدة بعد نهاية السنة السابقة.";
  if (message.includes("owner or manager")) return "هذه العملية متاحة لمالك المدرسة أو مديرها فقط.";
  return "تعذر تنفيذ الترحيل. تحقق من البيانات والاتصال وتطبيق ترحيل قاعدة البيانات.";
}
