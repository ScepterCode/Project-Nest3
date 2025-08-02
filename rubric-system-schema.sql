-- Rubric System Database Schema
-- Run this in your Supabase SQL Editor

-- Create rubrics table
CREATE TABLE IF NOT EXISTS public.rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
    is_template BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
    total_points INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create rubric_criteria table
CREATE TABLE IF NOT EXISTS public.rubric_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id UUID NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    weight DECIMAL(5,2) DEFAULT 25.00, -- Percentage weight
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create rubric_levels table (performance levels for each criterion)
CREATE TABLE IF NOT EXISTS public.rubric_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criterion_id UUID NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    points INTEGER NOT NULL,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create rubric_quality_indicators table
CREATE TABLE IF NOT EXISTS public.rubric_quality_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_id UUID NOT NULL REFERENCES rubric_levels(id) ON DELETE CASCADE,
    indicator TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create rubric_templates table for predefined templates
CREATE TABLE IF NOT EXISTS public.rubric_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL, -- 'essay', 'lab_report', 'presentation', etc.
    template_data JSONB NOT NULL,
    is_public BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create rubric_assignments table to track rubric usage
CREATE TABLE IF NOT EXISTS public.rubric_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id UUID NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(rubric_id, assignment_id)
);

-- Enable RLS
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_quality_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Rubrics
CREATE POLICY "Teachers can manage their own rubrics" ON public.rubrics
    FOR ALL USING (auth.uid() = teacher_id);

CREATE POLICY "Students can view rubrics for their assignments" ON public.rubrics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.rubric_assignments ra
            JOIN public.assignments a ON ra.assignment_id = a.id
            JOIN public.classes c ON a.class_id = c.id
            JOIN public.enrollments e ON c.id = e.class_id
            WHERE ra.rubric_id = rubrics.id 
            AND e.student_id = auth.uid()
            AND e.status = 'active'
        )
    );

-- Rubric Criteria
CREATE POLICY "Users can access criteria for accessible rubrics" ON public.rubric_criteria
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.rubrics r
            WHERE r.id = rubric_criteria.rubric_id
            AND (
                r.teacher_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.rubric_assignments ra
                    JOIN public.assignments a ON ra.assignment_id = a.id
                    JOIN public.classes c ON a.class_id = c.id
                    JOIN public.enrollments e ON c.id = e.class_id
                    WHERE ra.rubric_id = r.id 
                    AND e.student_id = auth.uid()
                    AND e.status = 'active'
                )
            )
        )
    );

-- Rubric Levels
CREATE POLICY "Users can access levels for accessible criteria" ON public.rubric_levels
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.rubric_criteria rc
            JOIN public.rubrics r ON rc.rubric_id = r.id
            WHERE rc.id = rubric_levels.criterion_id
            AND (
                r.teacher_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.rubric_assignments ra
                    JOIN public.assignments a ON ra.assignment_id = a.id
                    JOIN public.classes c ON a.class_id = c.id
                    JOIN public.enrollments e ON c.id = e.class_id
                    WHERE ra.rubric_id = r.id 
                    AND e.student_id = auth.uid()
                    AND e.status = 'active'
                )
            )
        )
    );

-- Quality Indicators
CREATE POLICY "Users can access indicators for accessible levels" ON public.rubric_quality_indicators
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.rubric_levels rl
            JOIN public.rubric_criteria rc ON rl.criterion_id = rc.id
            JOIN public.rubrics r ON rc.rubric_id = r.id
            WHERE rl.id = rubric_quality_indicators.level_id
            AND (
                r.teacher_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.rubric_assignments ra
                    JOIN public.assignments a ON ra.assignment_id = a.id
                    JOIN public.classes c ON a.class_id = c.id
                    JOIN public.enrollments e ON c.id = e.class_id
                    WHERE ra.rubric_id = r.id 
                    AND e.student_id = auth.uid()
                    AND e.status = 'active'
                )
            )
        )
    );

-- Templates (public read, authenticated write)
CREATE POLICY "Anyone can view public templates" ON public.rubric_templates
    FOR SELECT USING (is_public = true OR created_by = auth.uid());

CREATE POLICY "Authenticated users can create templates" ON public.rubric_templates
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own templates" ON public.rubric_templates
    FOR UPDATE USING (created_by = auth.uid());

-- Rubric Assignments
CREATE POLICY "Teachers can manage rubric assignments for their assignments" ON public.rubric_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.assignments a
            WHERE a.id = rubric_assignments.assignment_id
            AND a.teacher_id = auth.uid()
        )
    );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rubrics_teacher_id ON public.rubrics(teacher_id);
CREATE INDEX IF NOT EXISTS idx_rubrics_class_id ON public.rubrics(class_id);
CREATE INDEX IF NOT EXISTS idx_rubric_criteria_rubric_id ON public.rubric_criteria(rubric_id);
CREATE INDEX IF NOT EXISTS idx_rubric_criteria_order ON public.rubric_criteria(rubric_id, order_index);
CREATE INDEX IF NOT EXISTS idx_rubric_levels_criterion_id ON public.rubric_levels(criterion_id);
CREATE INDEX IF NOT EXISTS idx_rubric_levels_order ON public.rubric_levels(criterion_id, order_index);
CREATE INDEX IF NOT EXISTS idx_rubric_quality_indicators_level_id ON public.rubric_quality_indicators(level_id);
CREATE INDEX IF NOT EXISTS idx_rubric_assignments_rubric_id ON public.rubric_assignments(rubric_id);
CREATE INDEX IF NOT EXISTS idx_rubric_assignments_assignment_id ON public.rubric_assignments(assignment_id);

-- Insert some default templates
INSERT INTO public.rubric_templates (name, description, category, template_data, is_public) VALUES
('Academic Essay Rubric', 'Standard rubric for evaluating academic essays', 'essay', '{
  "criteria": [
    {
      "name": "Content & Ideas",
      "description": "Quality and relevance of ideas presented",
      "weight": 40,
      "levels": [
        {"name": "Excellent", "description": "Ideas are original, well-developed, and highly relevant", "points": 4},
        {"name": "Good", "description": "Ideas are clear and mostly relevant", "points": 3},
        {"name": "Satisfactory", "description": "Ideas are basic but acceptable", "points": 2},
        {"name": "Needs Improvement", "description": "Ideas are unclear or irrelevant", "points": 1}
      ]
    },
    {
      "name": "Organization",
      "description": "Structure and flow of the writing",
      "weight": 30,
      "levels": [
        {"name": "Excellent", "description": "Clear structure with smooth transitions", "points": 4},
        {"name": "Good", "description": "Generally well organized", "points": 3},
        {"name": "Satisfactory", "description": "Basic organization present", "points": 2},
        {"name": "Needs Improvement", "description": "Poor or no clear organization", "points": 1}
      ]
    },
    {
      "name": "Grammar & Mechanics",
      "description": "Proper use of grammar, spelling, and punctuation",
      "weight": 30,
      "levels": [
        {"name": "Excellent", "description": "Virtually no errors", "points": 4},
        {"name": "Good", "description": "Few minor errors", "points": 3},
        {"name": "Satisfactory", "description": "Some errors but don''t interfere with meaning", "points": 2},
        {"name": "Needs Improvement", "description": "Many errors that interfere with understanding", "points": 1}
      ]
    }
  ]
}', true),

('Lab Report Rubric', 'Comprehensive rubric for evaluating laboratory reports', 'lab_report', '{
  "criteria": [
    {
      "name": "Hypothesis & Objectives",
      "description": "Clear statement of hypothesis and experimental objectives",
      "weight": 20,
      "levels": [
        {"name": "Excellent", "description": "Clear, testable hypothesis with well-defined objectives", "points": 4},
        {"name": "Good", "description": "Hypothesis present with mostly clear objectives", "points": 3},
        {"name": "Satisfactory", "description": "Basic hypothesis with unclear objectives", "points": 2},
        {"name": "Needs Improvement", "description": "No clear hypothesis or objectives", "points": 1}
      ]
    },
    {
      "name": "Methodology",
      "description": "Description of experimental procedures and methods",
      "weight": 25,
      "levels": [
        {"name": "Excellent", "description": "Detailed, clear methodology that could be replicated", "points": 4},
        {"name": "Good", "description": "Generally clear methodology with minor gaps", "points": 3},
        {"name": "Satisfactory", "description": "Basic methodology with some unclear steps", "points": 2},
        {"name": "Needs Improvement", "description": "Unclear or incomplete methodology", "points": 1}
      ]
    },
    {
      "name": "Data Analysis",
      "description": "Quality of data presentation and analysis",
      "weight": 30,
      "levels": [
        {"name": "Excellent", "description": "Thorough analysis with appropriate graphs and calculations", "points": 4},
        {"name": "Good", "description": "Good analysis with mostly appropriate presentation", "points": 3},
        {"name": "Satisfactory", "description": "Basic analysis with adequate presentation", "points": 2},
        {"name": "Needs Improvement", "description": "Poor or missing data analysis", "points": 1}
      ]
    },
    {
      "name": "Conclusions",
      "description": "Quality of conclusions and connection to hypothesis",
      "weight": 25,
      "levels": [
        {"name": "Excellent", "description": "Clear conclusions that directly address hypothesis", "points": 4},
        {"name": "Good", "description": "Generally good conclusions with minor gaps", "points": 3},
        {"name": "Satisfactory", "description": "Basic conclusions with some connection to hypothesis", "points": 2},
        {"name": "Needs Improvement", "description": "Unclear or missing conclusions", "points": 1}
      ]
    }
  ]
}', true),

('Presentation Rubric', 'Rubric for evaluating student presentations', 'presentation', '{
  "criteria": [
    {
      "name": "Content Knowledge",
      "description": "Demonstrates understanding of the topic",
      "weight": 35,
      "levels": [
        {"name": "Excellent", "description": "Demonstrates deep understanding with accurate information", "points": 4},
        {"name": "Good", "description": "Shows good understanding with mostly accurate information", "points": 3},
        {"name": "Satisfactory", "description": "Basic understanding with some inaccuracies", "points": 2},
        {"name": "Needs Improvement", "description": "Limited understanding with significant inaccuracies", "points": 1}
      ]
    },
    {
      "name": "Organization & Structure",
      "description": "Logical flow and clear structure of presentation",
      "weight": 25,
      "levels": [
        {"name": "Excellent", "description": "Clear introduction, body, and conclusion with smooth transitions", "points": 4},
        {"name": "Good", "description": "Generally well organized with most transitions working", "points": 3},
        {"name": "Satisfactory", "description": "Basic organization with some unclear transitions", "points": 2},
        {"name": "Needs Improvement", "description": "Poor organization with confusing structure", "points": 1}
      ]
    },
    {
      "name": "Delivery & Communication",
      "description": "Speaking skills, eye contact, and audience engagement",
      "weight": 25,
      "levels": [
        {"name": "Excellent", "description": "Confident delivery with excellent eye contact and engagement", "points": 4},
        {"name": "Good", "description": "Good delivery with adequate eye contact", "points": 3},
        {"name": "Satisfactory", "description": "Basic delivery with limited eye contact", "points": 2},
        {"name": "Needs Improvement", "description": "Poor delivery with little audience engagement", "points": 1}
      ]
    },
    {
      "name": "Visual Aids",
      "description": "Quality and effectiveness of visual materials",
      "weight": 15,
      "levels": [
        {"name": "Excellent", "description": "Professional, clear visuals that enhance presentation", "points": 4},
        {"name": "Good", "description": "Good visuals that support the presentation", "points": 3},
        {"name": "Satisfactory", "description": "Basic visuals with some relevance", "points": 2},
        {"name": "Needs Improvement", "description": "Poor or irrelevant visual aids", "points": 1}
      ]
    }
  ]
}', true);

-- Create function to update rubric total points
CREATE OR REPLACE FUNCTION update_rubric_total_points()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.rubrics 
    SET total_points = (
        SELECT COALESCE(SUM(
            (SELECT MAX(points) FROM public.rubric_levels WHERE criterion_id = rc.id)
        ), 0)
        FROM public.rubric_criteria rc 
        WHERE rc.rubric_id = COALESCE(NEW.rubric_id, OLD.rubric_id)
    ),
    updated_at = NOW()
    WHERE id = COALESCE(NEW.rubric_id, OLD.rubric_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update total points
CREATE TRIGGER update_rubric_points_on_criteria_change
    AFTER INSERT OR UPDATE OR DELETE ON public.rubric_criteria
    FOR EACH ROW EXECUTE FUNCTION update_rubric_total_points();

CREATE TRIGGER update_rubric_points_on_level_change
    AFTER INSERT OR UPDATE OR DELETE ON public.rubric_levels
    FOR EACH ROW EXECUTE FUNCTION update_rubric_total_points();

-- Force schema refresh
NOTIFY pgrst, 'reload schema';

SELECT 'Rubric system schema created successfully!' as status;