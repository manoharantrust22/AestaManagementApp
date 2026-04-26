import { useCallback, useState } from "react";
import type { InspectEntity, InspectTabKey } from "@/components/common/InspectPane/types";

function entityKey(e: InspectEntity): string {
  if (e.kind === "daily-date") return `d:${e.siteId}:${e.date}`;
  return `w:${e.siteId}:${e.laborerId}:${e.weekStart}`;
}

function entitiesEqual(a: InspectEntity | null, b: InspectEntity | null): boolean {
  if (!a || !b) return a === b;
  return entityKey(a) === entityKey(b);
}

export function useInspectPane() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [currentEntity, setCurrentEntity] = useState<InspectEntity | null>(null);
  const [activeTab, setActiveTab] = useState<InspectTabKey>("attendance");

  const open = useCallback((entity: InspectEntity) => {
    setIsOpen((wasOpen) => {
      // If clicking same entity while open and not pinned → close.
      if (wasOpen && entitiesEqual(currentEntity, entity) && !isPinned) {
        return false;
      }
      return true;
    });
    setCurrentEntity((prev) => {
      // Reset tab when switching to a different entity
      if (!entitiesEqual(prev, entity)) {
        setActiveTab("attendance");
      }
      return entity;
    });
  }, [currentEntity, isPinned]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const togglePin = useCallback(() => {
    setIsPinned((prev) => !prev);
  }, []);

  return {
    isOpen,
    isPinned,
    currentEntity,
    activeTab,
    open,
    close,
    togglePin,
    setActiveTab,
  };
}
