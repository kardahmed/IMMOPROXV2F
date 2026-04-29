// Database type re-exported from the auto-generated file. The previous
// hand-curated shape drifted out of sync with the live schema (missing
// migration 028 columns on `tasks`, missing `welcome_modal_seen_at` /
// `plan` on `tenants`, no whatsapp_* tables, etc.) and was breaking
// the production build on Hostinger.
//
// All hand-curated UNION TYPES (PipelineStage, ClientSource, etc.)
// stay below — they are used as labels/badges throughout the UI.
import type { Database } from './database.generated'

export type { Database }


// Enums
export type UserRole = 'super_admin' | 'admin' | 'agent'
export type UserStatus = 'active' | 'inactive'
export type ProjectStatus = 'active' | 'inactive' | 'archived'
export type UnitType = 'apartment' | 'local' | 'villa' | 'parking'
export type UnitSubtype = 'F2' | 'F3' | 'F4' | 'F5' | 'F6'
export type UnitStatus = 'available' | 'reserved' | 'sold' | 'blocked'
export type PipelineStage = 'accueil' | 'visite_a_gerer' | 'visite_confirmee' | 'visite_terminee' | 'negociation' | 'reservation' | 'vente' | 'relancement' | 'perdue'
export type ClientSource = 'facebook_ads' | 'google_ads' | 'instagram_ads' | 'appel_entrant' | 'reception' | 'bouche_a_oreille' | 'reference_client' | 'site_web' | 'portail_immobilier' | 'autre'
export type ClientType = 'individual' | 'company'
export type InterestLevel = 'low' | 'medium' | 'high'
export type PaymentMethod = 'comptant' | 'credit' | 'lpp' | 'aadl' | 'mixte'
export type VisitType = 'on_site' | 'office' | 'virtual'
export type VisitStatus = 'planned' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled'
export type DepositMethod = 'cash' | 'bank_transfer' | 'cheque'
export type ReservationStatus = 'active' | 'expired' | 'cancelled' | 'converted'
export type FinancingMode = 'comptant' | 'credit' | 'mixte'
export type DiscountType = 'percentage' | 'fixed'
// Aligned with the generated DB enum which now includes 'sale' and
// 'reservation' (extended via Studio post-001). Without those two
// members, .eq('status', 'sale') returns no rows + TypeScript loses
// the safety net on legacy rows.
export type SaleStatus = 'active' | 'cancelled' | 'sale' | 'reservation'
export type PaymentStatus = 'pending' | 'paid' | 'late'
export type ChargeType = 'notaire' | 'agence' | 'promotion' | 'enregistrement' | 'autre'
export type HistoryType = 'stage_change' | 'visit_planned' | 'visit_confirmed' | 'visit_completed' | 'call' | 'whatsapp_call' | 'whatsapp_message' | 'sms' | 'email' | 'reservation' | 'sale' | 'payment' | 'document' | 'note' | 'ai_task'
export type TaskType = 'ai_generated' | 'manual'
export type TaskStatus = 'pending' | 'done' | 'ignored'
export type DocType = 'contrat_vente' | 'echeancier' | 'bon_reservation' | 'cin' | 'autre'
export type GoalMetric = 'sales_count' | 'reservations_count' | 'visits_count' | 'revenue' | 'new_clients' | 'conversion_rate'
export type GoalPeriod = 'monthly' | 'quarterly' | 'yearly'
export type GoalStatus = 'in_progress' | 'achieved' | 'exceeded' | 'not_achieved'

// Raccourcis Row
export type Tenant = Database['public']['Tables']['tenants']['Row']
export type User = Database['public']['Tables']['users']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type Unit = Database['public']['Tables']['units']['Row']
export type Client = Database['public']['Tables']['clients']['Row']
export type Visit = Database['public']['Tables']['visits']['Row']
export type Reservation = Database['public']['Tables']['reservations']['Row']
export type Sale = Database['public']['Tables']['sales']['Row']
export type PaymentSchedule = Database['public']['Tables']['payment_schedules']['Row']
export type Charge = Database['public']['Tables']['charges']['Row']
export type SaleAmenity = Database['public']['Tables']['sale_amenities']['Row']
export type History = Database['public']['Tables']['history']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type Document = Database['public']['Tables']['documents']['Row']
export type AgentGoal = Database['public']['Tables']['agent_goals']['Row']
export type TenantSettings = Database['public']['Tables']['tenant_settings']['Row']
export type DocumentTemplate = Database['public']['Tables']['document_templates']['Row']
