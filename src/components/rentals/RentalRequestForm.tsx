"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useCreateRentalRequest } from "@/hooks/queries/useRentals";
import type { EstimateBasketItem } from "@/types/rental.types";

interface RequestItem {
  rental_item_id: string;
  rental_item_name: string;
  size_label: string | null;
  rental_item_size_id: string | null;
  quantity: number;
}

interface RentalRequestFormProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  prefillItems?: EstimateBasketItem[];
  onSuccess?: () => void;
}

export function RentalRequestForm({
  open,
  onClose,
  siteId,
  prefillItems = [],
  onSuccess,
}: RentalRequestFormProps) {
  const createRequest = useCreateRentalRequest();

  const [items, setItems] = useState<RequestItem[]>(() =>
    prefillItems.map((i) => ({
      rental_item_id: i.rental_item_id,
      rental_item_name: i.rental_item_name,
      size_label: i.size_label,
      rental_item_size_id: i.rental_item_size_id,
      quantity: i.quantity,
    }))
  );

  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [estimatedDays, setEstimatedDays] = useState(prefillItems[0]?.days ?? 25);
  const [notes, setNotes] = useState("");

  const updateItem = (idx: number, patch: Partial<RequestItem>) =>
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    await createRequest.mutateAsync({
      site_id: siteId,
      order_date: startDate,
      start_date: startDate,
      estimated_days: estimatedDays,
      notes,
      items: items.map((item) => ({
        rental_item_id: item.rental_item_id,
        quantity: item.quantity,
        daily_rate_default: 0,
        daily_rate_actual: 0,
        rate_type: "daily" as const,
        rental_item_size_id: item.rental_item_size_id,
        size_label_snapshot: item.size_label,
      })),
    });
    onSuccess?.();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Rental Request</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Submit a request for the engineer to create a Purchase Order.
        </Typography>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Items
        </Typography>
        <Stack spacing={1} sx={{ mb: 2 }}>
          {items.map((item, idx) => (
            <Box
              key={idx}
              sx={{
                display: "flex",
                gap: 1,
                alignItems: "center",
                p: 1,
                bgcolor: "action.hover",
                borderRadius: 1,
              }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={600}>
                  {item.rental_item_name}
                </Typography>
                {item.size_label && (
                  <Typography variant="caption" color="text.secondary">
                    {item.size_label}
                  </Typography>
                )}
              </Box>
              <TextField
                type="number"
                size="small"
                label="Qty"
                value={item.quantity}
                onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                inputProps={{ min: 1 }}
                sx={{ width: 80 }}
              />
              <IconButton size="small" color="error" onClick={() => removeItem(idx)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          {items.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
              No items added yet.
            </Typography>
          )}
        </Stack>

        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            label="Start date"
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Estimated days"
            type="number"
            size="small"
            value={estimatedDays}
            onChange={(e) => setEstimatedDays(Math.max(1, Number(e.target.value)))}
            inputProps={{ min: 1 }}
            sx={{ flex: 1 }}
          />
        </Stack>

        <TextField
          label="Notes (optional)"
          multiline
          rows={2}
          fullWidth
          size="small"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. For 2nd floor slab centering"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={items.length === 0 || createRequest.isPending}
          size="small"
        >
          Submit Request
        </Button>
      </DialogActions>
    </Dialog>
  );
}
