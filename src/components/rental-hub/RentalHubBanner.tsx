"use client";

import { Alert, Button, Box } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Link from "next/link";

interface RentalHubBannerProps {
  variant?: "full" | "chip";
  href?: string;
}

export default function RentalHubBanner({
  variant = "full",
  href = "/site/rentals/v2",
}: RentalHubBannerProps) {
  if (variant === "chip") {
    return (
      <Box sx={{ mb: 1.5 }}>
        <Button
          component={Link}
          href={href}
          size="small"
          variant="outlined"
          endIcon={<ArrowForwardIcon fontSize="small" />}
          sx={{ textTransform: "none", fontWeight: 500 }}
        >
          Try the new Rental Hub (beta)
        </Button>
      </Box>
    );
  }

  return (
    <Alert
      severity="info"
      sx={{ mb: 2, alignItems: "center" }}
      action={
        <Button
          component={Link}
          href={href}
          size="small"
          variant="contained"
          endIcon={<ArrowForwardIcon fontSize="small" />}
          sx={{ textTransform: "none", whiteSpace: "nowrap" }}
        >
          Try v2
        </Button>
      }
    >
      We&rsquo;re testing a redesigned Rental Hub &mdash; every rental on one
      surface with a live cost meter and a 5&#8209;stage pipeline.
    </Alert>
  );
}
