import { redirect } from "next/navigation";

// Holidays are now managed inside Attendance (mark / plan / edit / revoke).
// Keep this route so old links and bookmarks land on the right page.
export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string }>;
}) {
  const { contractId } = await searchParams;
  redirect(contractId ? `/site/attendance?contractId=${encodeURIComponent(contractId)}` : "/site/attendance");
}
