"use client";

import type { HubFileUpload } from "./types";

/** The hub takes JPEG/PNG/WebP up to 3 MB; we send JPEG and stay under it. */
export const HUB_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
const START_EDGE = 2048;
const MIN_EDGE = 640;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not a photo we can read."));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Resizes a photo on the phone to a JPEG of at most 3 MB: start at 2048 px on
 * the long edge and step quality, then size, down until it fits.
 */
export async function photoForHub(file: Blob, name = "photo.jpg"): Promise<HubFileUpload> {
  const img = await loadImage(file);
  let edge = Math.min(START_EDGE, Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This phone could not prepare the photo.");

  while (edge >= MIN_EDGE) {
    const scale = edge / Math.max(img.naturalWidth, img.naturalHeight);
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.fillStyle = "#fff"; // transparent PNGs become white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.75, 0.6]) {
      const blob = await toBlob(canvas, q);
      if (blob && blob.size <= HUB_PHOTO_MAX_BYTES) {
        const base = name.replace(/\.[^.]+$/, "") || "photo";
        return { name: `${base}.jpg`, type: "image/jpeg", data: await blobToBase64(blob) };
      }
    }
    edge = Math.round(edge * 0.75);
  }
  throw new Error("The photo is too large even after shrinking it. Try another one.");
}
