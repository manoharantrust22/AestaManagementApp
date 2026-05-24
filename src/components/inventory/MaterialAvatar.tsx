"use client";

/**
 * Category-themed CSS-gradient tile that stands in for a product photo when
 * `imageUrl` is null. When `imageUrl` is provided, renders that instead.
 *
 * Mirrors `MaterialAvatar` + `MAT_VISUAL` config in
 * docs/MaterialHub_Redesign/proto-inventory.jsx.
 */

import { Box } from "@mui/material";

interface VisualConfig {
  gradient: string;
  pattern: string;
  initial: string;
}

function categoryConfig(category: string | null | undefined): VisualConfig {
  const cat = (category ?? "").toLowerCase();
  if (cat.includes("cement"))
    return {
      gradient: "linear-gradient(135deg, #e2dfd6 0%, #a8a39a 100%)",
      pattern:
        "repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(0,0,0,.05) 14px, rgba(0,0,0,.05) 15px)",
      initial: "C",
    };
  if (cat.includes("aggregate") || cat.includes("sand") || cat.includes("jelly"))
    return {
      gradient: "linear-gradient(135deg, #e6d4a8 0%, #b89a6b 100%)",
      pattern:
        "radial-gradient(circle at 25% 25%, rgba(0,0,0,.18) 1px, transparent 2px), radial-gradient(circle at 75% 75%, rgba(0,0,0,.18) 1px, transparent 2px)",
      initial: "A",
    };
  if (cat.includes("brick"))
    return {
      gradient: "linear-gradient(135deg, #d2745a 0%, #9a3f25 100%)",
      pattern:
        "repeating-linear-gradient(0deg, transparent, transparent 12px, rgba(0,0,0,.18) 12px, rgba(0,0,0,.18) 13px), repeating-linear-gradient(90deg, transparent, transparent 24px, rgba(0,0,0,.18) 24px, rgba(0,0,0,.18) 25px)",
      initial: "B",
    };
  if (cat.includes("steel") || cat.includes("tmt") || cat.includes("rod"))
    return {
      gradient: "linear-gradient(135deg, #6b7280 0%, #2d3540 100%)",
      pattern:
        "repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(255,255,255,.08) 6px, rgba(255,255,255,.08) 7px)",
      initial: "S",
    };
  if (cat.includes("timber") || cat.includes("wood") || cat.includes("plywood"))
    return {
      gradient: "linear-gradient(135deg, #b07a4a 0%, #5d3a1c 100%)",
      pattern:
        "repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(0,0,0,.1) 4px, rgba(0,0,0,.1) 5px), repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(0,0,0,.18) 28px, rgba(0,0,0,.18) 30px)",
      initial: "T",
    };
  if (cat.includes("electric") || cat.includes("wire") || cat.includes("light"))
    return {
      gradient: "linear-gradient(135deg, #4299e1 0%, #2b4d8c 100%)",
      pattern:
        "radial-gradient(circle at 25% 25%, rgba(255,255,255,.18) 1.5px, transparent 2px), radial-gradient(circle at 75% 75%, rgba(255,255,255,.18) 1.5px, transparent 2px)",
      initial: "E",
    };
  // Default (gray)
  return {
    gradient: "linear-gradient(135deg, #cbd5e1 0%, #64748b 100%)",
    pattern:
      "repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(0,0,0,.05) 12px, rgba(0,0,0,.05) 13px)",
    initial: "M",
  };
}

export interface MaterialAvatarProps {
  category: string | null | undefined;
  materialName: string;
  imageUrl?: string | null;
  height?: number;
  /** Optional badge overlay (LOW / EMPTY) */
  badge?: { label: string; tone: "warn" | "danger" } | null;
}

export default function MaterialAvatar({
  category,
  materialName,
  imageUrl,
  height = 140,
  badge,
}: MaterialAvatarProps) {
  const config = categoryConfig(category);

  return (
    <Box
      sx={{
        position: "relative",
        height,
        width: "100%",
        overflow: "hidden",
        background: imageUrl ? "#000" : config.gradient,
      }}
    >
      {imageUrl ? (
        <Box
          component="img"
          src={imageUrl}
          alt={materialName}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <>
          {/* Pattern overlay */}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: config.pattern,
              backgroundSize: "12px 12px",
            }}
          />
          {/* Centered initial */}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: height * 0.42,
              fontWeight: 800,
              color: "rgba(255,255,255,.35)",
              fontFamily: "Inter, system-ui, sans-serif",
              letterSpacing: "-2px",
              pointerEvents: "none",
            }}
          >
            {config.initial}
          </Box>
          {/* Material-name watermark */}
          <Box
            sx={{
              position: "absolute",
              bottom: 8,
              left: 10,
              right: 10,
              fontSize: 10.5,
              fontFamily: '"JetBrains Mono", monospace',
              color: "rgba(255,255,255,.55)",
              fontWeight: 600,
              letterSpacing: "0.3px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {materialName}
          </Box>
        </>
      )}

      {badge && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "3px 8px",
            background: badge.tone === "danger" ? "#ef4444" : "rgba(15,23,42,.7)",
            color: "#fff",
            borderRadius: "5px",
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          {badge.label}
        </Box>
      )}
    </Box>
  );
}
