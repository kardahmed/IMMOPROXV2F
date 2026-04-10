-- ================================================
-- Add per-tenant maintenance mode
-- ================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_settings' AND column_name = 'maintenance_mode'
  ) THEN
    ALTER TABLE tenant_settings ADD COLUMN maintenance_mode BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_settings' AND column_name = 'maintenance_message'
  ) THEN
    ALTER TABLE tenant_settings ADD COLUMN maintenance_message TEXT DEFAULT '';
  END IF;
END $$;
