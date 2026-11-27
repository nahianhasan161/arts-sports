"use client";

import { Suspense } from "react";
import ReportView from "@/components/admin/reports/ReportView";

/** The owner's business report (sales, profit, spendings, suppliers). The offline app re-exports this page. */
export default function ReportsPage() {
  return (
    <Suspense>
      <ReportView />
    </Suspense>
  );
}
