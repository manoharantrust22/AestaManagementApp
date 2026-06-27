"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import HolidaysContent from "./holidays-content";

// HolidaysContent reads ?contractId= via useSearchParams (workspace scope), which
// requires a Suspense boundary above it.
export default function HolidaysPage() {
  return (
    <Suspense fallback={null}>
      <HolidaysContent />
    </Suspense>
  );
}
