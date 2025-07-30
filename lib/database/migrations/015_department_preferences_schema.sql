-- Department preferences table for storing department-specific UI and workflow preferences
CREATE TABLE department_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE NOT NULL,
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(department_id)
);

-- Create indexes for better performance
CREATE INDEX idx_department_preferences_department_id ON department_preferences(department_id);
CREATE INDEX idx_department_preferences_updated_at ON department_preferences(updated_at);

-- Add RLS policies for multi-tenant security
ALTER TABLE department_preferences ENABLE ROW LEVEL SECURITY;

-- Policy for department admins and institution admins to manage preferences
CREATE POLICY department_preferences_access ON department_preferences
  FOR ALL
  USING (
    department_id IN (
      SELECT d.id 
      FROM departments d
      JOIN user_departments ud ON d.id = ud.department_id
      WHERE ud.user_id = auth.uid()
      AND ud.role IN ('department_admin', 'institution_admin')
    )
  );

-- Policy for users to read preferences of their department
CREATE POLICY department_preferences_read ON department_preferences
  FOR SELECT
  USING (
    department_id IN (
      SELECT ud.department_id 
      FROM user_departments ud
      WHERE ud.user_id = auth.uid()
    )
  );

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_department_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER department_preferences_updated_at_trigger
  BEFORE UPDATE ON department_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_department_preferences_updated_at();

-- Add comments for documentation
COMMENT ON TABLE department_preferences IS 'Stores department-specific preferences for UI layout, notifications, and workflow settings';
COMMENT ON COLUMN department_preferences.department_id IS 'Reference to the department these preferences belong to';
COMMENT ON COLUMN department_preferences.preferences IS 'JSON object containing all preference settings';