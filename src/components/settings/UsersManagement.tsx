"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  SelectChangeEvent,
  CircularProgress,
  Typography,
} from "@mui/material";
import {
  PersonAdd as AddIcon,
  AlternateEmail as LoginEmailIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
  Fingerprint as TaskIdIcon,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/contexts/ToastContext";
import { copyText } from "@/lib/utils/copyText";
import { useSelectedCompany } from "@/contexts/CompanyContext";
import type { Database } from "@/types/database.types";

type User = Database["public"]["Tables"]["users"]["Row"];
type Site = Database["public"]["Tables"]["sites"]["Row"];
import dayjs from "dayjs";

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const supabase = createClient();
  const { showSuccess, showError } = useToast();
  const { selectedCompany } = useSelectedCompany();

  // "Change login email": only the email moves; the user id and data stay.
  const [emailTarget, setEmailTarget] = useState<User | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  const openChangeEmail = useCallback((user: User) => {
    setEmailTarget(user);
    setNewEmail("");
    setEmailError("");
  }, []);

  // The task id is users.id: the id Neram links in Admin > Team > Connected apps.
  const handleCopyTaskId = useCallback(
    async (user: User) => {
      const ok = await copyText(user.id);
      if (ok) showSuccess(`Task id for ${user.name} copied`);
      else showError(`Could not copy. Task id for ${user.name}: ${user.id}`, { duration: 15000 });
    },
    [showSuccess, showError]
  );

  const [formData, setFormData] = useState({
    email: "",
    name: "",
    phone: "",
    role: "site_engineer" as "admin" | "office" | "site_engineer",
    assigned_sites: [] as string[],
    status: "active" as "active" | "inactive" | "suspended",
    password: "",
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSites = async () => {
    const { data } = await supabase.from("sites").select("*").order("name");
    if (data) setSites(data);
  };

  useEffect(() => {
    fetchUsers();
    fetchSites();
  }, []);

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        name: user.name,
        phone: user.phone || "",
        role: user.role,
        assigned_sites: user.assigned_sites || [],
        status: user.status,
        password: "",
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: "",
        name: "",
        phone: "",
        role: "site_engineer",
        assigned_sites: [],
        status: "active",
        password: "",
      });
    }
    setOpenDialog(true);
    setError("");
    setSuccess("");
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingUser(null);
    setError("");
    setSuccess("");
  };

  const handleSiteChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    setFormData({
      ...formData,
      assigned_sites: typeof value === "string" ? value.split(",") : value,
    });
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      setError("");
      setSubmitting(true);

      if (!formData.email || !formData.name || !formData.role) {
        setError("Please fill in all required fields (Name, Email, and Role).");
        setSubmitting(false);
        return;
      }

      // Inviting: a password is optional (Google/Microsoft people need none).
      if (!editingUser && formData.password && formData.password.length < 6) {
        setError("A password must be at least 6 characters, or leave it empty.");
        setSubmitting(false);
        return;
      }

      const userData = {
        email: formData.email,
        name: formData.name,
        phone: formData.phone || null,
        role: formData.role,
        assigned_sites:
          formData.assigned_sites.length > 0 ? formData.assigned_sites : null,
        status: formData.status,
        password: formData.password || undefined,
      };

      if (editingUser) {
        // Update existing user via API
        const response = await fetch("/api/admin/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingUser.id, ...userData }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to update user");
        }

        setSuccess("User updated successfully!");
      } else {
        // Invite: account + profile + company membership, server side.
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...userData, company_id: selectedCompany?.id ?? null }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Could not invite this person");
        }

        setSuccess(
          formData.password
            ? `Invited. ${formData.email} can sign in with Google, Microsoft or the password you set.`
            : `Invited. ${formData.email} can now tap "Continue with Google" (or Microsoft for a Neram work account).`
        );
      }

      await fetchUsers();
      setTimeout(() => {
        handleCloseDialog();
      }, 1500);
    } catch (err: any) {
      // Display user-friendly error message
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!emailTarget) return;
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailSaving(true);
    setEmailError("");
    try {
      const res = await fetch("/api/admin/users/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: emailTarget.id, email }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        setEmailError(result.error || "Could not change the login email.");
        return;
      }
      showSuccess(`${emailTarget.name} now signs in with ${email}`);
      setEmailTarget(null);
      await fetchUsers();
    } catch {
      setEmailError("Could not reach the server. Please try again.");
    } finally {
      setEmailSaving(false);
    }
  };

  const columns = useMemo<MRT_ColumnDef<User>[]>(
    () => [
      {
        id: "mrt-row-actions",
        header: "Actions",
        size: 150,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Tooltip title="Edit">
              <IconButton
                size="small"
                onClick={() => handleOpenDialog(row.original)}
              >
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Change login email">
              <IconButton
                size="small"
                aria-label={`Change login email for ${row.original.name}`}
                onClick={() => openChangeEmail(row.original)}
              >
                <LoginEmailIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Copy task id">
              <IconButton
                size="small"
                aria-label={`Copy task id for ${row.original.name}`}
                onClick={() => handleCopyTaskId(row.original)}
              >
                <TaskIdIcon />
              </IconButton>
            </Tooltip>
          </Box>
        ),
        columnDefType: "display",
        enableSorting: false,
        enableColumnFilter: false,
      },
      {
        accessorKey: "name",
        header: "Name",
        size: 180,
      },
      {
        accessorKey: "email",
        header: "Email",
        size: 200,
      },
      {
        accessorKey: "phone",
        header: "Phone",
        size: 130,
        Cell: ({ cell }) => cell.getValue<string>() || "-",
      },
      {
        accessorKey: "role",
        header: "Role",
        size: 130,
        filterVariant: "select",
        filterSelectOptions: [
          { value: "admin", label: "ADMIN" },
          { value: "office", label: "OFFICE" },
          { value: "site_engineer", label: "SITE ENGINEER" },
        ],
        Cell: ({ cell }) => {
          const role = cell.getValue<string>();
          const colorMap: Record<string, any> = {
            admin: "error",
            office: "primary",
            site_engineer: "secondary",
          };
          return (
            <Chip
              label={role.replace("_", " ").toUpperCase()}
              size="small"
              color={colorMap[role] || "default"}
            />
          );
        },
      },
      {
        accessorKey: "assigned_sites",
        header: "Assigned Sites",
        size: 200,
        Cell: ({ row, cell }) => {
          const role = row.original.role;
          const siteIds = cell.getValue<string[]>();

          // Admins always have access to all sites
          if (role === "admin") {
            return (
              <Chip
                label="All Sites"
                size="small"
                color="success"
                variant="outlined"
              />
            );
          }

          // For non-admins, show assigned sites
          if (!siteIds || siteIds.length === 0) {
            return (
              <Chip
                label="All Sites"
                size="small"
                color="info"
                variant="outlined"
              />
            );
          }

          // Show site names
          const siteNames = siteIds
            .map((id) => sites.find((s) => s.id === id)?.name)
            .filter(Boolean);

          if (siteNames.length <= 2) {
            return (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {siteNames.map((name, idx) => (
                  <Chip key={idx} label={name} size="small" variant="outlined" />
                ))}
              </Box>
            );
          }

          return (
            <Tooltip title={siteNames.join(", ")}>
              <Chip
                label={`${siteNames.length} sites`}
                size="small"
                variant="outlined"
              />
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 100,
        filterVariant: "select",
        filterSelectOptions: [
          { value: "active", label: "ACTIVE" },
          { value: "inactive", label: "INACTIVE" },
          { value: "suspended", label: "SUSPENDED" },
        ],
        Cell: ({ cell }) => (
          <Chip
            label={cell.getValue<string>().toUpperCase()}
            size="small"
            color={cell.getValue<string>() === "active" ? "success" : "default"}
          />
        ),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        size: 120,
        Cell: ({ cell }) =>
          dayjs(cell.getValue<string>()).format("DD MMM YYYY"),
      },
    ],
    [sites, handleCopyTaskId, openChangeEmail]
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Box />
        <Box sx={{ display: "flex", gap: 2 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchUsers}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Invite person
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={users}
        isLoading={loading}
        pageSize={10}
      />

      {/* Add/Edit User Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{editingUser ? "Edit User" : "Invite person"}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Name"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                required
                autoComplete="off"
                helperText={
                  editingUser
                    ? "To change it, use Change login email on their row."
                    : "Their Gmail, or their Neram work email for Microsoft."
                }
                disabled={!!editingUser}
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Phone"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Role</InputLabel>
                <Select
                  value={formData.role}
                  label="Role"
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as any })
                  }
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="office">Office Employee</MenuItem>
                  <MenuItem value="site_engineer">Site Engineer</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {!editingUser && (
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Password (optional)"
                  type="password"
                  autoComplete="new-password"
                  helperText="Leave empty if they will use Continue with Google"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                />
              </Grid>
            )}

            {editingUser && (
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  label="Status"
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as any })
                  }
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                Inactive: they are signed out on their next page load (within 5 minutes). Nothing is deleted.
              </Typography>
            </Grid>
            )}

            {/* Site Assignment Section */}
            {formData.role === "admin" ? (
              <Grid size={{ xs: 12 }}>
                <Alert severity="info" sx={{ mt: 1 }}>
                  <strong>Admin Access:</strong> Admins automatically have access to all sites. No site assignment needed.
                </Alert>
              </Grid>
            ) : (
              <Grid size={{ xs: 12 }}>
                <FormControl fullWidth>
                  <InputLabel>Assigned Sites</InputLabel>
                  <Select
                    multiple
                    value={formData.assigned_sites}
                    onChange={handleSiteChange}
                    input={<OutlinedInput label="Assigned Sites" />}
                    renderValue={(selected) => {
                      if (selected.length === 0) return "All sites (no restriction)";
                      const selectedNames = selected
                        .map((id) => sites.find((s) => s.id === id)?.name)
                        .filter(Boolean);
                      return selectedNames.join(", ");
                    }}
                  >
                    {sites.map((site) => (
                      <MenuItem key={site.id} value={site.id}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Chip
                            size="small"
                            label={formData.assigned_sites.includes(site.id) ? "Selected" : ""}
                            color={formData.assigned_sites.includes(site.id) ? "primary" : "default"}
                            sx={{
                              minWidth: 70,
                              visibility: formData.assigned_sites.includes(site.id) ? "visible" : "hidden"
                            }}
                          />
                          {site.name}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  {formData.assigned_sites.length === 0
                    ? "Leave empty to grant access to all sites. Select specific sites to restrict access."
                    : `User will only have access to ${formData.assigned_sites.length} selected site(s).`}
                </Typography>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {submitting ? "Saving..." : editingUser ? "Update User" : "Invite"}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Change login email */}
      <Dialog
        open={!!emailTarget}
        onClose={() => !emailSaving && setEmailTarget(null)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="change-email-title"
      >
        <DialogTitle id="change-email-title">Change login email</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {emailTarget?.name} signs in with{" "}
            <Box component="span" sx={{ fontWeight: 600, wordBreak: "break-all" }}>
              {emailTarget?.email}
            </Box>{" "}
            today.
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            They will sign in with the new email from now on. Their data stays the same.
          </Alert>
          {emailError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {emailError}
            </Alert>
          )}
          <TextField
            fullWidth
            autoFocus
            label="New login email"
            type="email"
            autoComplete="off"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setEmailError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleChangeEmail();
            }}
            helperText="Their Gmail for Google, or their Neram work email for Microsoft."
            disabled={emailSaving}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailTarget(null)} disabled={emailSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleChangeEmail}
            disabled={emailSaving || !newEmail.trim()}
            startIcon={emailSaving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {emailSaving ? "Changing..." : "Change email"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
