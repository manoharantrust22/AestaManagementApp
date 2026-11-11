/**
 * Centralized permission utilities for role-based access control
 */

export type UserRole = "admin" | "office" | "site_engineer";

/**
 * Check if user has edit/delete permissions
 * All roles (admin, office, site_engineer) can edit most features
 */
export const hasEditPermission = (role: UserRole | string | undefined | null): boolean => {
  return role === "admin" || role === "office" || role === "site_engineer";
};

/**
 * Check if user has admin-level permissions (approve requests, convert to PO).
 * Admin and office both count, matching the Hub role map
 * (`WHO_ALLOWED_ROLES.admin` in src/lib/material-hub/nextAction.ts) and RLS.
 */
export const hasAdminPermission = (role: UserRole | string | undefined | null): boolean => {
  return role === "admin" || role === "office";
};

/**
 * Strict admin only: destructive or company-wide changes such as merging
 * materials, editing vendors from the assistant, managing users.
 */
export const isStrictAdmin = (role: UserRole | string | undefined | null): boolean => {
  return role === "admin";
};

/**
 * Who may approve, reject or fix items in the review queue (`review_flags`).
 * Anyone may raise a flag; only admin and office resolve it (maker/checker).
 */
export const canResolveReviewFlags = (role: UserRole | string | undefined | null): boolean => {
  return role === "admin" || role === "office";
};

/**
 * Site engineers must go through the Material Request flow; only admin/office
 * may create Purchase Orders directly. Mirrored by RLS on `purchase_orders` insert.
 */
export const canCreatePurchaseOrders = (role: UserRole | string | undefined | null): boolean => {
  return role === "admin" || role === "office";
};

/** Check if user can manage users (admin only). */
export const canManageUsers = (role: UserRole | string | undefined | null): boolean => {
  return role === "admin";
};

/** Check if user can manage sites (admin and office). */
export const canManageSites = (role: UserRole | string | undefined | null): boolean => {
  return role === "admin" || role === "office";
};

/** Check if user can manage construction phases (admin and office). */
export const canManageConstructionPhases = (role: UserRole | string | undefined | null): boolean => {
  return role === "admin" || role === "office";
};

/**
 * Check if user can perform mass upload operations.
 * Admin and office only, as the mass-upload pages and API routes already state.
 */
export const canPerformMassUpload = (role: UserRole | string | undefined | null): boolean => {
  return role === "admin" || role === "office";
};
