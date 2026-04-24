-- ================================================
-- Phase onboarding — first-login welcome modal tracking
--
-- tenants.onboarding_completed (boolean, from migration 011) is used
-- by the persistent OnboardingWizard checklist bar — it flips true
-- once the admin has created a project + agent + client.
--
-- This is a different concept: a one-shot Welcome Modal shown
-- exactly once to a new tenant admin on first login, explaining
-- what the platform does (pipeline, projects, agents, settings).
-- The user can dismiss it at any step; once dismissed or finished,
-- it never shows again.
--
-- Storing a TIMESTAMPTZ instead of a boolean lets us answer
-- "when did this tenant actually see the modal" in support cases,
-- and leaves room for a future "relaunch welcome tour" if we add
-- new top-level features.
--
-- Idempotent.
-- ================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS welcome_modal_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN tenants.welcome_modal_seen_at IS
  'Timestamp when the tenant admin first dismissed or finished the Welcome Modal. NULL = never shown. Used by WelcomeModal.tsx to decide whether to display on login.';
