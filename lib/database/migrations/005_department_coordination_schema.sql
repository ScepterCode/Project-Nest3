-- Department Coordination Schema Migration
-- This migration adds tables to support department-level enrollment coordination

-- Enrollment balancing operations tracking
CREATE TABLE enrollment_balancing_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) NOT NULL,
  from_section_id UUID REFERENCES classes(id) NOT NULL,
  to_section_id UUID REFERENCES classes(id) NOT NULL,
  type VARCHAR NOT NULL CHECK (type IN ('redistribute', 'swap', 'move')),
  student_ids UUID[] NOT NULL,
  reason TEXT NOT NULL,
  estimated_impact TEXT,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'failed')),
  created_by UUID REFERENCES users(id) NOT NULL,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  completed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

-- Section planning recommendations
CREATE TABLE section_planning_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) NOT NULL,
  course_code VARCHAR NOT NULL,
  course_name VARCHAR NOT NULL,
  current_sections INTEGER NOT NULL,
  recommended_sections INTEGER NOT NULL,
  capacity_per_section INTEGER NOT NULL,
  priority VARCHAR NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  estimated_cost DECIMAL(10,2),
  feasibility_score INTEGER CHECK (feasibility_score >= 0 AND feasibility_score <= 100),
  reasoning TEXT[],
  feasibility_factors JSONB DEFAULT '[]',
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'implemented', 'rejected')),
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Prerequisite chain analysis results
CREATE TABLE prerequisite_chain_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) NOT NULL,
  chain_id VARCHAR NOT NULL,
  course_sequence JSONB NOT NULL, -- Array of course objects in prerequisite order
  total_length INTEGER NOT NULL,
  bottlenecks JSONB DEFAULT '[]', -- Array of bottleneck objects
  recommendations TEXT[],
  analysis_date TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Prerequisite validation violations
CREATE TABLE prerequisite_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES enrollments(id) NOT NULL,
  student_id UUID REFERENCES users(id) NOT NULL,
  course_id UUID REFERENCES classes(id) NOT NULL,
  missing_prerequisite VARCHAR NOT NULL,
  severity VARCHAR NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  recommended_action TEXT,
  status VARCHAR DEFAULT 'open' CHECK (status IN ('open', 'waived', 'resolved', 'dismissed')),
  detected_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT
);

-- Department coordination settings
CREATE TABLE department_coordination_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) NOT NULL UNIQUE,
  auto_balancing_enabled BOOLEAN DEFAULT FALSE,
  target_utilization_rate INTEGER DEFAULT 85 CHECK (target_utilization_rate > 0 AND target_utilization_rate <= 100),
  prerequisite_enforcement_level VARCHAR DEFAULT 'strict' CHECK (prerequisite_enforcement_level IN ('strict', 'moderate', 'flexible')),
  capacity_planning_horizon INTEGER DEFAULT 2, -- Number of semesters to plan ahead
  notification_preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Capacity planning projections
CREATE TABLE capacity_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) NOT NULL,
  course_code VARCHAR NOT NULL,
  term_id VARCHAR NOT NULL, -- Future term identifier
  projected_enrollment INTEGER NOT NULL,
  projected_sections INTEGER NOT NULL,
  confidence_level DECIMAL(3,2) CHECK (confidence_level >= 0 AND confidence_level <= 1),
  projection_method VARCHAR NOT NULL, -- 'historical', 'trend', 'manual'
  base_data JSONB DEFAULT '{}', -- Historical data used for projection
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Resource requirements tracking
CREATE TABLE resource_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_plan_id UUID REFERENCES section_planning_recommendations(id) NOT NULL,
  resource_type VARCHAR NOT NULL CHECK (resource_type IN ('instructor', 'classroom', 'equipment', 'budget')),
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  availability_status VARCHAR NOT NULL CHECK (availability_status IN ('available', 'limited', 'unavailable')),
  alternative_solutions TEXT[],
  estimated_cost DECIMAL(10,2),
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_balancing_operations_department ON enrollment_balancing_operations(department_id);
CREATE INDEX idx_balancing_operations_status ON enrollment_balancing_operations(status);
CREATE INDEX idx_balancing_operations_created_at ON enrollment_balancing_operations(created_at);

CREATE INDEX idx_section_planning_department ON section_planning_recommendations(department_id);
CREATE INDEX idx_section_planning_priority ON section_planning_recommendations(priority);
CREATE INDEX idx_section_planning_status ON section_planning_recommendations(status);

CREATE INDEX idx_prerequisite_chains_department ON prerequisite_chain_analysis(department_id);
CREATE INDEX idx_prerequisite_chains_analysis_date ON prerequisite_chain_analysis(analysis_date);

CREATE INDEX idx_prerequisite_violations_student ON prerequisite_violations(student_id);
CREATE INDEX idx_prerequisite_violations_course ON prerequisite_violations(course_id);
CREATE INDEX idx_prerequisite_violations_status ON prerequisite_violations(status);
CREATE INDEX idx_prerequisite_violations_severity ON prerequisite_violations(severity);

CREATE INDEX idx_capacity_projections_department ON capacity_projections(department_id);
CREATE INDEX idx_capacity_projections_course ON capacity_projections(course_code);
CREATE INDEX idx_capacity_projections_term ON capacity_projections(term_id);

CREATE INDEX idx_resource_requirements_plan ON resource_requirements(section_plan_id);
CREATE INDEX idx_resource_requirements_type ON resource_requirements(resource_type);

-- Functions for automated coordination tasks

-- Function to calculate section utilization variance
CREATE OR REPLACE FUNCTION calculate_section_utilization_variance(dept_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  utilization_rates DECIMAL[];
  avg_utilization DECIMAL;
  variance DECIMAL := 0;
  rate DECIMAL;
BEGIN
  -- Get utilization rates for all sections in department
  SELECT ARRAY_AGG(
    CASE 
      WHEN capacity > 0 THEN (current_enrollment::DECIMAL / capacity) * 100
      ELSE 0
    END
  ) INTO utilization_rates
  FROM classes
  WHERE department_id = dept_id AND capacity > 0;

  -- Calculate average
  SELECT AVG(unnest) INTO avg_utilization FROM unnest(utilization_rates);

  -- Calculate variance
  FOREACH rate IN ARRAY utilization_rates
  LOOP
    variance := variance + POWER(rate - avg_utilization, 2);
  END LOOP;

  RETURN SQRT(variance / array_length(utilization_rates, 1));
END;
$$ LANGUAGE plpgsql;

-- Function to identify prerequisite bottlenecks
CREATE OR REPLACE FUNCTION identify_prerequisite_bottlenecks(dept_id UUID)
RETURNS TABLE(
  course_id UUID,
  course_name VARCHAR,
  bottleneck_type VARCHAR,
  severity VARCHAR,
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    CASE 
      WHEN c.current_enrollment < 20 THEN 'low_enrollment'
      WHEN array_length(prereq_array.prerequisites, 1) > 3 THEN 'excessive_prerequisites'
      ELSE 'other'
    END as bottleneck_type,
    CASE 
      WHEN c.current_enrollment < 10 THEN 'high'
      WHEN c.current_enrollment < 20 THEN 'medium'
      ELSE 'low'
    END as severity,
    CASE 
      WHEN c.current_enrollment < 20 THEN 'Low enrollment may limit students for dependent courses'
      WHEN array_length(prereq_array.prerequisites, 1) > 3 THEN 'Excessive prerequisites may be blocking enrollment'
      ELSE 'No significant bottleneck detected'
    END as description
  FROM classes c
  LEFT JOIN (
    SELECT 
      class_id,
      ARRAY_AGG(requirement) as prerequisites
    FROM class_prerequisites
    GROUP BY class_id
  ) prereq_array ON c.id = prereq_array.class_id
  WHERE c.department_id = dept_id
  AND (c.current_enrollment < 20 OR array_length(prereq_array.prerequisites, 1) > 3);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update coordination settings timestamp
CREATE OR REPLACE FUNCTION update_coordination_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_coordination_settings_timestamp
  BEFORE UPDATE ON department_coordination_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_coordination_settings_timestamp();

-- Trigger to update section planning recommendations timestamp
CREATE OR REPLACE FUNCTION update_section_planning_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_section_planning_timestamp
  BEFORE UPDATE ON section_planning_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION update_section_planning_timestamp();

-- Insert default coordination settings for existing departments
INSERT INTO department_coordination_settings (department_id)
SELECT id FROM departments
WHERE id NOT IN (SELECT department_id FROM department_coordination_settings);

COMMENT ON TABLE enrollment_balancing_operations IS 'Tracks enrollment balancing operations between sections';
COMMENT ON TABLE section_planning_recommendations IS 'Stores section planning recommendations and their status';
COMMENT ON TABLE prerequisite_chain_analysis IS 'Results of prerequisite chain analysis for course sequences';
COMMENT ON TABLE prerequisite_violations IS 'Tracks prerequisite requirement violations';
COMMENT ON TABLE department_coordination_settings IS 'Department-specific coordination settings and preferences';
COMMENT ON TABLE capacity_projections IS 'Future enrollment and capacity projections';
COMMENT ON TABLE resource_requirements IS 'Resource requirements for section planning recommendations';