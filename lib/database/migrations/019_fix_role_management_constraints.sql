-- Fix Role Management Database Schema Constraints
-- This migration fixes regex constraints that were truncated in the previous migration
-- Requirements: 1.1, 7.1

-- Fix institution domains domain constraint
ALTER TABLE institution_domains DROP CONSTRAINT IF EXISTS chk_institution_domains_domain;
ALTER TABLE institution_domains ADD CONSTRAINT chk_institution_domains_domain 
  CHECK (domain ~ '^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$');

-- Fix permissions name constraint
ALTER TABLE permissions DROP CONSTRAINT IF EXISTS chk_permissions_name;
ALTER TABLE permissions ADD CONSTRAINT chk_permissions_name 
  CHECK (name ~ '^[a-z][a-z0-9_]*[a-z0-9]$');

-- Verify all constraints are properly applied
DO $$
BEGIN
  -- Check if all required constraints exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'chk_institution_domains_domain'
  ) THEN
    RAISE EXCEPTION 'Domain constraint not properly applied';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'chk_permissions_name'
  ) THEN
    RAISE EXCEPTION 'Permissions name constraint not properly applied';
  END IF;
  
  RAISE NOTICE 'All role management constraints successfully applied';
END $$;