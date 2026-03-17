"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Stepper,
  Step,
  StepLabel,
  IconButton,
} from "@mui/material";
import {
  Close as CloseIcon,
  Description as RequestIcon,
  CheckCircle as ApproveIcon,
  ShoppingCart as POIcon,
} from "@mui/icons-material";

interface CreatePORedirectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreateRequest: () => void;
}

const steps = [
  { label: "Create Material Request", icon: <RequestIcon /> },
  { label: "Get Approval", icon: <ApproveIcon /> },
  { label: "Convert to PO", icon: <POIcon /> },
];

export default function CreatePORedirectDialog({
  open,
  onClose,
  onCreateRequest,
}: CreatePORedirectDialogProps) {
  return (
    <Dialog open={open} onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="h6" component="span">
          Create a Material Request First
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 3 }}>
          Purchase Orders are now created from approved Material Requests to
          ensure proper tracking and approval flow.
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Stepper activeStep={0} alternativeLabel>
            {steps.map((step) => (
              <Step key={step.label}>
                <StepLabel>{step.label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        <Typography variant="body2" color="text.secondary">
          After your material request is approved, you can convert it to a
          Purchase Order with one click from the Material Requests page.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={onCreateRequest}
          startIcon={<RequestIcon />}
        >
          Create Material Request
        </Button>
      </DialogActions>
    </Dialog>
  );
}
