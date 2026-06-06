import { Suspense } from "react";
import { getDirectoryPageData } from "@/lib/data/directory";
import DirectoryContent from "./directory-content";
import DirectorySkeleton from "./directory-skeleton";

export default async function DirectoryPage() {
  const data = await getDirectoryPageData();

  return (
    <Suspense fallback={<DirectorySkeleton />}>
      <DirectoryContent initialData={data} />
    </Suspense>
  );
}
