<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Student class placement lives only in student_enrollments (one active/pending per student per year); never store current class on students — keeps academic history.
- Admission→student conversion runs in the convert_admission_application SQL function — atomic and idempotent.
- Student-module audit logging is done by DB triggers (audit_student_module), not client code — can't be skipped.
- Student documents live in private bucket student-documents at path {school_id}/{student_id}/file — storage RLS checks the school folder.
