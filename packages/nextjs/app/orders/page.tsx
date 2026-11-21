import { Suspense } from "react";
import { RecruitClient } from "~~/components/RecruitClient";

export default function Page() {
  return (
    <Suspense fallback={<p>读取招聘单…</p>}>
      <RecruitClient />
    </Suspense>
  );
}
