/**
 * "Find product image" picker (Phase 4 — online product images). Searches the
 * web for a product image (via /api/material-image/search), shows tappable
 * thumbnails, and on pick re-hosts the chosen image into Supabase (via
 * /api/material-image/rehost) — returning the stable Supabase URL.
 *
 * Always offers a paste-a-URL fallback, so it works even before an image-search
 * API key is configured (the search section then shows a "not set up" note).
 *
 * Reused by the ingest preview (per new material) and the catalog bulk-fill.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Search as SearchIcon } from "@mui/icons-material";

interface ImageResult {
  url: string;
  thumbnail: string;
  title: string;
}

interface ImageSearchPickerProps {
  open: boolean;
  onClose: () => void;
  /** Prefilled query, e.g. "Dr. Fixit Dr. Fixit LW+ 5L can". */
  defaultQuery: string;
  /** Receives the re-hosted Supabase public URL after a successful pick. */
  onPicked: (publicUrl: string) => void;
  /** When set, the re-host route also stamps materials.image_url directly. */
  materialId?: string;
}

export default function ImageSearchPicker({
  open,
  onClose,
  defaultQuery,
  onPicked,
  materialId,
}: ImageSearchPickerProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");
  const [rehostingUrl, setRehostingUrl] = useState<string | null>(null);
  const [rehostError, setRehostError] = useState<string | null>(null);

  // Reset + auto-search whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setQuery(defaultQuery);
    setResults([]);
    setConfigured(null);
    setSearchError(null);
    setPasteUrl("");
    setRehostingUrl(null);
    setRehostError(null);
    void runSearch(defaultQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultQuery]);

  const runSearch = async (q: string) => {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/material-image/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      setConfigured(data.configured !== false);
      setResults(Array.isArray(data.results) ? data.results : []);
      if (data.error) setSearchError(data.error);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setConfigured(true);
    } finally {
      setSearching(false);
    }
  };

  const rehost = async (imageUrl: string) => {
    setRehostingUrl(imageUrl);
    setRehostError(null);
    try {
      const res = await fetch("/api/material-image/rehost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, materialId }),
      });
      const data = await res.json();
      if (!res.ok || !data.publicUrl) {
        throw new Error(data.error ?? "Could not save that image");
      }
      onPicked(data.publicUrl);
      onClose();
    } catch (err) {
      setRehostError(err instanceof Error ? err.message : "Could not save that image");
    } finally {
      setRehostingUrl(null);
    }
  };

  const busy = rehostingUrl !== null;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Find product image</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              label="Search the web"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch(query);
              }}
              disabled={busy}
            />
            <Button
              variant="outlined"
              startIcon={searching ? <CircularProgress size={16} /> : <SearchIcon />}
              onClick={() => void runSearch(query)}
              disabled={searching || busy}
            >
              Search
            </Button>
          </Stack>

          {configured === false ? (
            <Alert severity="info">
              In-app image search isn&apos;t set up yet. Paste an image URL below, or add a
              BRAVE_SEARCH_API_KEY (or GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID) to enable search.
            </Alert>
          ) : null}
          {searchError ? <Alert severity="warning">{searchError}</Alert> : null}

          {results.length > 0 ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 1,
              }}
            >
              {results.map((r) => {
                const isRehosting = rehostingUrl === r.url;
                return (
                  <Box
                    key={r.url}
                    onClick={() => !busy && void rehost(r.url)}
                    title={r.title}
                    sx={{
                      position: "relative",
                      cursor: busy ? "default" : "pointer",
                      borderRadius: 1,
                      overflow: "hidden",
                      border: "1px solid",
                      borderColor: "divider",
                      aspectRatio: "1 / 1",
                      bgcolor: "action.hover",
                      opacity: busy && !isRehosting ? 0.5 : 1,
                      "&:hover": { borderColor: busy ? "divider" : "primary.main" },
                    }}
                  >
                    <Box
                      component="img"
                      src={r.thumbnail || r.url}
                      alt={r.title}
                      loading="lazy"
                      sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {isRehosting ? (
                      <Box
                        sx={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          bgcolor: "rgba(0,0,0,0.45)",
                        }}
                      >
                        <CircularProgress size={22} sx={{ color: "#fff" }} />
                      </Box>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          ) : !searching && configured !== false ? (
            <Typography variant="caption" color="text.secondary">
              No results — refine the search, or paste a URL below.
            </Typography>
          ) : null}

          <Divider>or paste an image URL</Divider>

          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              placeholder="https://…/product.jpg"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              disabled={busy}
            />
            <Button
              variant="contained"
              onClick={() => void rehost(pasteUrl.trim())}
              disabled={busy || !pasteUrl.trim()}
            >
              {rehostingUrl === pasteUrl.trim() ? "Saving…" : "Use"}
            </Button>
          </Stack>

          {rehostError ? <Alert severity="error">{rehostError}</Alert> : null}

          <Typography variant="caption" color="text.secondary">
            The image is copied into your own storage so it always loads — the original link can
            change or go away.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
