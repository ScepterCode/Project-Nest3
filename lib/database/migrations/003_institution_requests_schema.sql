-- Institution Requests Schema Migration
-- This migration adds the institution_requests table for handling new institution requests

-- Create institution_requests table
CREATE TABLE IF NOT EXISTS institution_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  domain VARCHAR,
  type VARCHAR DEFAULT 'other',
  contact_email VARCHAR,
  description TEXT,
  requested_by UUID NOT NULL,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'under_review')),
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_institution_requests_requester FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_institution_requests_reviewer FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_institution_requests_status ON institution_requests(status);
CREATE INDEX IF NOT EXISTS idx_institution_requests_requested_by ON institution_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_institution_requests_created_at ON institution_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_institution_requests_name ON institution_requests(name);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_institution_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_institution_requests_updated_at
  BEFORE UPDATE ON institution_requests
  FOR EACH ROW EXECUTE FUNCTION update_institution_requests_updated_at();

-- Add RLS (Row Level Security) policies
ALTER TABLE institution_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own requests
CREATE POLICY "Users can view own institution requests" ON institution_requests
  FOR SELECT USING (requested_by = auth.uid());

-- Policy: Users can create their own requests
CREATE POLICY "Users can create institution requests" ON institution_requests
  FOR INSERT WITH CHECK (requested_by = auth.uid());

-- Policy: Users can update their own pending requests
CREATE POLICY "Users can update own pending requests" ON institution_requests
  FOR UPDATE USING (requested_by = auth.uid() AND status = 'pending');

-- Policy: Admins can view all requests (will be refined based on role system)
CREATE POLICY "Admins can view all institution requests" ON institution_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('system_admin', 'institution_admin')
    )
  );

-- Policy: Admins can update any request
CREATE POLICY "Admins can update institution requests" ON institution_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('system_admin', 'institution_admin')
    )
  );