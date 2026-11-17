"use client";

import { useEffect, useState } from "react";
import { IconButton, Tooltip } from "@mui/material";
import AddTaskIcon from "@mui/icons-material/AddTask";
import { useSelectedSite } from "@/contexts/SiteContext";
import { buildTaskPage } from "@/lib/tasks/pageLink";
import type { TaskPage } from "@/types/task.types";
import TaskCreateDialog from "./TaskCreateDialog";

const OPEN_EVENT = "aesta:new-task-from-page";

/** Opens "New task" with the current page attached (AppBar button, profile menu). */
export function openNewTaskFromPage() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** The page's own heading, else the tab title (see buildTaskPage). */
function currentHeading(): string | null {
  const el = document.querySelector("main h1, main h2, main h3, main h4, main h5");
  return el?.textContent ?? null;
}

/** Mounted once in MainLayout: listens for the open event and shows the dialog. */
export default function NewTaskFromPage() {
  const { selectedSite } = useSelectedSite();
  const [page, setPage] = useState<TaskPage | null>(null);

  useEffect(() => {
    const open = () => {
      setPage(
        buildTaskPage({
          href: window.location.href,
          heading: currentHeading(),
          documentTitle: document.title,
          site: selectedSite ? { id: selectedSite.id, name: selectedSite.name } : null,
        }),
      );
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [selectedSite]);

  return <TaskCreateDialog open={!!page} page={page} onClose={() => setPage(null)} />;
}

/** The AppBar button. 44px target, visible focus ring. */
export function NewTaskFromPageButton() {
  return (
    <Tooltip title="New task from this page">
      <IconButton
        aria-label="New task from this page"
        onClick={openNewTaskFromPage}
        sx={{
          width: 44,
          height: 44,
          "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
        }}
      >
        <AddTaskIcon />
      </IconButton>
    </Tooltip>
  );
}
