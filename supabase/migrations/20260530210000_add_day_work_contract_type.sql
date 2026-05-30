-- Migration: Add 'day_work' value to the contract_type enum
-- Purpose: Enable a third kind of subcontract — a single-day, lump-sum job given
--          to an external concreting gang (see concreting_teams catalog).
--
-- IMPORTANT: This file adds the enum value ONLY. Postgres cannot use a newly
-- added enum value in the same transaction it was added, so the columns and the
-- CHECK constraint that reference 'day_work' live in the next migration
-- (20260530220000_day_work_subcontract_fields.sql), which runs after this commits.
-- (Same pattern as 20260108100000_add_2_5_work_day_unit.sql.)

ALTER TYPE "public"."contract_type" ADD VALUE IF NOT EXISTS 'day_work';
