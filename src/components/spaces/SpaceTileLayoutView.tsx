"use client";

import React, { useRef, useState } from "react";
import { Box, Typography } from "@mui/material";

import type {
  SpaceTileOption,
  TileExclusion,
  TileLayout,
} from "@/types/spaces.types";
import type { TileLayoutResult } from "@/lib/spaces/tiles";
import { formatFeetInches } from "@/lib/spaces/measurements";

interface SpaceTileLayoutViewProps {
  /** Room dimensions in inches (already resolved by the parent). */
  roomXIn: number;
  roomYIn: number;
  tile: SpaceTileOption;
  layout: TileLayout;
  result: TileLayoutResult;
  canEdit: boolean;
  selectedExclusionId: string | null;
  onSelectExclusion: (id: string | null) => void;
  /** Fired once on drag end with the new snapped position. */
  onMoveExclusion: (id: string, xIn: number, yIn: number) => void;
  /** Contrast skirting tile — draws a dark perimeter band when set. */
  skirtingTile?: SpaceTileOption | null;
  /** Skirting strip height, inches (band width). Default 4. */
  stripIn?: number;
}

interface DragState {
  id: string;
  startPointerX: number;
  startPointerY: number;
  startXIn: number;
  startYIn: number;
  currentXIn: number;
  currentYIn: number;
}

/**
 * To-scale 2D plan of one room with the tile grid laid over it. Cut edge
 * tiles render hatched, excluded (no-tile) zones grey out their cells.
 * Zones drag on desktop (pointer events, snapped to inches); selection is
 * tap-based so mobile can edit via the form in SpaceTilePanel.
 */
export default function SpaceTileLayoutView({
  roomXIn,
  roomYIn,
  tile,
  layout,
  result,
  canEdit,
  selectedExclusionId,
  onSelectExclusion,
  onMoveExclusion,
  skirtingTile = null,
  stripIn = 4,
}: SpaceTileLayoutViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const exclusions = layout.exclusions ?? [];
  const patternId = `tile-img-${tile.id}`;

  /** px → inches conversion using the rendered scale. */
  const pxToIn = (px: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return (px / rect.width) * roomXIn;
  };

  const handlePointerDown = (e: React.PointerEvent, ex: TileExclusion) => {
    onSelectExclusion(ex.id);
    if (!canEdit) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({
      id: ex.id,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startXIn: ex.x_in,
      startYIn: ex.y_in,
      currentXIn: ex.x_in,
      currentYIn: ex.y_in,
    });
  };

  const handlePointerMove = (e: React.PointerEvent, ex: TileExclusion) => {
    if (!drag || drag.id !== ex.id) return;
    const dx = pxToIn(e.clientX - drag.startPointerX);
    const dy = pxToIn(e.clientY - drag.startPointerY);
    setDrag({
      ...drag,
      currentXIn: clamp(Math.round(drag.startXIn + dx), 0, roomXIn - ex.w_in),
      currentYIn: clamp(Math.round(drag.startYIn + dy), 0, roomYIn - ex.h_in),
    });
  };

  const handlePointerUp = (ex: TileExclusion) => {
    if (!drag || drag.id !== ex.id) return;
    if (drag.currentXIn !== ex.x_in || drag.currentYIn !== ex.y_in) {
      onMoveExclusion(ex.id, drag.currentXIn, drag.currentYIn);
    }
    setDrag(null);
  };

  const exclusionPos = (ex: TileExclusion) =>
    drag?.id === ex.id
      ? { x: drag.currentXIn, y: drag.currentYIn }
      : { x: ex.x_in, y: ex.y_in };

  return (
    <Box>
      <Box
        component="svg"
        ref={svgRef}
        viewBox={`0 0 ${roomXIn} ${roomYIn}`}
        sx={{
          width: "100%",
          maxHeight: 420,
          display: "block",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.paper",
          touchAction: "none",
        }}
        onClick={() => onSelectExclusion(null)}
      >
        {tile.photo && (
          <defs>
            <pattern
              id={patternId}
              width={tile.tile_width_in}
              height={tile.tile_height_in}
              patternUnits="userSpaceOnUse"
            >
              <image
                href={tile.photo.url}
                width={tile.tile_width_in}
                height={tile.tile_height_in}
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          </defs>
        )}

        {/* Tile cells — image fill when a photo exists, neutral otherwise. */}
        {result.cells.map((cell) => (
          <rect
            key={`${cell.col}-${cell.row}`}
            x={cell.x_in}
            y={cell.y_in}
            width={cell.w_in}
            height={cell.h_in}
            fill={
              cell.kind === "excluded"
                ? "#9e9e9e"
                : tile.photo
                  ? `url(#${patternId})`
                  : "#f2ede4"
            }
            fillOpacity={cell.kind === "excluded" ? 0.35 : 1}
            stroke="#00000055"
            strokeWidth={roomXIn / 400}
          />
        ))}

        {/* Dark skirting band around the perimeter (contrast tile). */}
        {skirtingTile &&
          (() => {
            const b = Math.min(stripIn, roomXIn / 2, roomYIn / 2);
            const skirtId = `skirt-img-${skirtingTile.id}`;
            const fill = skirtingTile.photo ? `url(#${skirtId})` : "#37474f";
            return (
              <g pointerEvents="none">
                {skirtingTile.photo && (
                  <defs>
                    <pattern
                      id={skirtId}
                      width={skirtingTile.tile_width_in}
                      height={skirtingTile.tile_height_in}
                      patternUnits="userSpaceOnUse"
                    >
                      <image
                        href={skirtingTile.photo.url}
                        width={skirtingTile.tile_width_in}
                        height={skirtingTile.tile_height_in}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </pattern>
                  </defs>
                )}
                <rect x={0} y={0} width={roomXIn} height={b} fill={fill} fillOpacity={0.85} />
                <rect x={0} y={roomYIn - b} width={roomXIn} height={b} fill={fill} fillOpacity={0.85} />
                <rect x={0} y={0} width={b} height={roomYIn} fill={fill} fillOpacity={0.85} />
                <rect x={roomXIn - b} y={0} width={b} height={roomYIn} fill={fill} fillOpacity={0.85} />
              </g>
            );
          })()}

        {/* Cut tiles get a subtle diagonal marker. */}
        {result.cells
          .filter((c) => c.kind === "cut")
          .map((cell) => (
            <line
              key={`cut-${cell.col}-${cell.row}`}
              x1={cell.x_in}
              y1={cell.y_in}
              x2={cell.x_in + cell.w_in}
              y2={cell.y_in + cell.h_in}
              stroke="#00000033"
              strokeWidth={roomXIn / 400}
            />
          ))}

        {/* No-tile zones. */}
        {exclusions.map((ex) => {
          const pos = exclusionPos(ex);
          const selected = selectedExclusionId === ex.id;
          return (
            <g key={ex.id}>
              <rect
                x={pos.x}
                y={pos.y}
                width={ex.w_in}
                height={ex.h_in}
                fill="#d32f2f"
                fillOpacity={selected ? 0.3 : 0.18}
                stroke="#d32f2f"
                strokeWidth={roomXIn / (selected ? 150 : 300)}
                style={{ cursor: canEdit ? "move" : "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectExclusion(ex.id);
                }}
                onPointerDown={(e) => handlePointerDown(e, ex)}
                onPointerMove={(e) => handlePointerMove(e, ex)}
                onPointerUp={() => handlePointerUp(ex)}
              />
              <text
                x={pos.x + ex.w_in / 2}
                y={pos.y + ex.h_in / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#b71c1c"
                fontSize={Math.min(ex.w_in, ex.h_in) / 4}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {ex.label || "No tile"}
              </text>
            </g>
          );
        })}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {formatFeetInches(roomXIn)} × {formatFeetInches(roomYIn)} · tile{" "}
        {formatFeetInches(tile.tile_width_in)} ×{" "}
        {formatFeetInches(tile.tile_height_in)} · grid {result.cols}×{result.rows}
        {skirtingTile && " · dark skirting band"}
        {canEdit && exclusions.length > 0 && " · drag a zone to move it"}
      </Typography>
    </Box>
  );
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), Math.max(min, max));
