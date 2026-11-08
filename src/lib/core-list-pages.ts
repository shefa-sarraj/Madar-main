import { supabase } from "@/integrations/supabase/client";
import { readAll, readPage, searchOperand, type PageRequest } from "@/lib/pagination";
import { ADMISSION_STATUS, type StructureData } from "@/lib/students";
import type { EmployeeRow } from "@/lib/staff";

export type StudentListRow = {
  id: string;
  student_number: string;
  full_name: string;
  gender: string;
  status: string;
  phone: string | null;
  enrollment_date: string;
  is_demo: boolean;
  enrollments: {
    academic_year_id: string;
    grade_id: string;
    section_id: string | null;
    enrollment_status: string;
  }[];
  guardians: { is_primary: boolean; guardian: { full_name: string; phone: string } | null }[];
};

export async function fetchStudentPage(
  schoolId: string,
  request: PageRequest,
  filters: {
    search: string;
    status: string;
    gender: string;
    stageId: string;
    gradeId: string;
    sectionId: string;
    yearId: string;
  },
  grades: StructureData["grades"],
) {
  const needsEnrollment = [filters.stageId, filters.gradeId, filters.sectionId].some(
    (value) => value !== "all",
  );
  const search = searchOperand(filters.search);

  return readPage<StudentListRow>((from, to) => {
    let q = supabase
      .from("students")
      .select(
        `id,student_number,full_name,gender,status,phone,enrollment_date,is_demo,enrollments:student_enrollments(academic_year_id,grade_id,section_id,enrollment_status),guardians:student_guardians(is_primary,guardian:guardians(full_name,phone))${filters.search.trim() ? ",guardian_match:student_guardians(guardian:guardians!inner())" : ""}${needsEnrollment ? ",scope:student_enrollments!inner(academic_year_id,grade_id,section_id)" : ""}`,
        { count: "exact" },
      )
      .eq("school_id", schoolId);
    if (filters.status !== "all") q = q.filter("status", "eq", filters.status);
    if (filters.gender !== "all") q = q.filter("gender", "eq", filters.gender);
    if (needsEnrollment) {
      q = q.eq("scope.academic_year_id", filters.yearId);
      if (filters.stageId !== "all")
        q = q.in(
          "scope.grade_id",
          grades.filter((g) => g.stage_id === filters.stageId).map((g) => g.id),
        );
      if (filters.gradeId !== "all") q = q.eq("scope.grade_id", filters.gradeId);
      if (filters.sectionId !== "all") q = q.eq("scope.section_id", filters.sectionId);
    }
    if (filters.search.trim()) {
      q = q
        .eq("guardian_match.is_primary", true)
        .or(`full_name.ilike.${search},phone.ilike.${search}`, {
          referencedTable: "guardian_match.guardian",
        })
        .or(
          `full_name.ilike.${search},student_number.ilike.${search},phone.ilike.${search},guardian_match.not.is.null`,
        );
    }
    return q
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<StudentListRow[]>();
  }, request);
}

export async function fetchAdmissionsPage(
  schoolId: string,
  request: PageRequest,
  filters: { search: string; status: string; gradeFilter: string },
) {
  const page = await readPage((from, to) => {
    let q = supabase
      .from("admission_applications")
      .select("*", { count: "exact" })
      .eq("school_id", schoolId);
    if (filters.status !== "all") q = q.filter("status", "eq", filters.status);
    if (filters.gradeFilter !== "all") q = q.eq("requested_grade_id", filters.gradeFilter);
    if (filters.search.trim()) {
      for (const token of filters.search.trim().split(/\s+/)) {
        const term = searchOperand(token);
        q = q.or(
          [
            "application_number",
            "student_first_name",
            "student_last_name",
            "guardian_name",
            "guardian_phone",
          ]
            .map((column) => `${column}.ilike.${term}`)
            .join(","),
        );
      }
    }
    return q.order("submitted_at", { ascending: false }).order("id").range(from, to);
  }, request);
  return page;
}

export async function fetchAdmissionCounts(schoolId: string) {
  const counts = await Promise.all(
    Object.keys(ADMISSION_STATUS).map(async (status) => {
      const result = await supabase
        .from("admission_applications")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .filter("status", "eq", status);
      if (result.error) throw result.error;
      return [status, result.count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts);
}

export async function fetchStaffMetadata(schoolId: string) {
  const [departments, index] = await Promise.all([
    supabase.from("departments").select("*").eq("school_id", schoolId).order("name"),
    readAll((from, to) =>
      supabase
        .from("employees")
        .select("id,status,is_teacher,job_title")
        .eq("school_id", schoolId)
        .order("id")
        .range(from, to),
    ),
  ]);
  if (departments.error) throw departments.error;
  const active = index.filter((row) => row.status === "active");
  return {
    departments: departments.data ?? [],
    jobTitles: [...new Set(index.map((row) => row.job_title))].sort((a, b) =>
      a.localeCompare(b, "ar"),
    ),
    summary: {
      total: index.length,
      active: active.length,
      teachers: active.filter((row) => row.is_teacher).length,
      administrative: active.filter((row) => !row.is_teacher).length,
    },
  };
}

export async function fetchStaffPage(
  schoolId: string,
  request: PageRequest,
  filters: {
    search: string;
    department: string;
    jobTitle: string;
    employmentType: string;
    status: string;
  },
) {
  const departments = filters.search.trim()
    ? await supabase
        .from("departments")
        .select("id")
        .eq("school_id", schoolId)
        .ilike("name", `%${filters.search.trim().replace(/[\\%_]/g, "\\$&")}%`)
    : { data: [], error: null };
  if (departments.error) throw departments.error;
  const matches = (departments.data ?? []).map((row) => row.id);
  return readPage<EmployeeRow>((from, to) => {
    let q = supabase
      .from("employees")
      .select("*,department:departments(name)", { count: "exact" })
      .eq("school_id", schoolId);
    for (const [column, value] of [
      ["department_id", filters.department],
      ["job_title", filters.jobTitle],
      ["employment_type", filters.employmentType],
      ["status", filters.status],
    ])
      if (value !== "all") q = q.filter(column!, "eq", value);
    if (filters.search.trim()) {
      const term = searchOperand(filters.search);
      q = q.or(
        [
          ...["full_name", "employee_number", "national_id", "phone", "email", "job_title"].map(
            (column) => `${column}.ilike.${term}`,
          ),
          ...(matches.length ? [`department_id.in.(${matches.join(",")})`] : []),
        ].join(","),
      );
    }
    return q
      .order("full_name")
      .order("id")
      .range(from, to)
      .then((result) => ({
        ...result,
        data:
          result.data?.map(({ department, ...row }) => ({
            ...row,
            department_name: department?.name ?? null,
          })) ?? null,
      }));
  }, request);
}
