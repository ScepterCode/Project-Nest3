import { NextRequest, NextResponse } from 'next/server';
import { DepartmentEnrollmentCoordinator } from '@/lib/services/department-enrollment-coordinator';
import { EnrollmentBalancingService } from '@/lib/services/enrollment-balancing';
import { SectionPlanningService } from '@/lib/services/section-planning';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const departmentId = params.id;
    const { searchParams } = new URL(request.url);
    const dataType = searchParams.get('type');

    const coordinator = new DepartmentEnrollmentCoordinator();

    switch (dataType) {
      case 'sections':
        const sections = await coordinator.getDepartmentSections(departmentId);
        return NextResponse.json({ sections });

      case 'recommendations':
        const recommendations = await coordinator.getEnrollmentBalancingRecommendations(departmentId);
        return NextResponse.json({ recommendations });

      case 'prerequisites':
        const prerequisites = await coordinator.getPrerequisiteCoordination(departmentId);
        return NextResponse.json({ prerequisites });

      case 'capacity':
        const suggestions = await coordinator.getCapacityManagementSuggestions(departmentId);
        return NextResponse.json({ suggestions });

      case 'prerequisite-chains':
        const chains = await coordinator.analyzePrerequisiteChains(departmentId);
        return NextResponse.json({ chains });

      case 'prerequisite-validation':
        const validationResults = await coordinator.validatePrerequisiteEnforcement(departmentId);
        return NextResponse.json({ validationResults });

      default:
        // Return all coordination data
        const [sectionsData, recommendationsData, prerequisitesData, suggestionsData] = await Promise.all([
          coordinator.getDepartmentSections(departmentId),
          coordinator.getEnrollmentBalancingRecommendations(departmentId),
          coordinator.getPrerequisiteCoordination(departmentId),
          coordinator.getCapacityManagementSuggestions(departmentId)
        ]);

        return NextResponse.json({
          sections: sectionsData,
          recommendations: recommendationsData,
          prerequisites: prerequisitesData,
          suggestions: suggestionsData
        });
    }
  } catch (error) {
    console.error('Department coordination API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch department coordination data' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const departmentId = params.id;
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case 'generate-balancing-plan':
        const balancingService = new EnrollmentBalancingService();
        const plan = await balancingService.generateBalancingPlan(
          data.sectionIds,
          data.targetUtilization
        );
        return NextResponse.json({ plan });

      case 'execute-balancing-operation':
        const balancingServiceExec = new EnrollmentBalancingService();
        const success = await balancingServiceExec.executeBalancingOperation(data.operationId);
        return NextResponse.json({ success });

      case 'generate-section-plans':
        const planningService = new SectionPlanningService();
        const plans = await planningService.generateSectionPlans(departmentId);
        return NextResponse.json({ plans });

      case 'optimize-section-plan':
        const planningServiceOpt = new SectionPlanningService();
        const optimizationResult = await planningServiceOpt.optimizeSectionPlan(
          data.plan,
          data.constraints
        );
        return NextResponse.json({ optimizationResult });

      case 'generate-implementation-timeline':
        const planningServiceTimeline = new SectionPlanningService();
        const timeline = await planningServiceTimeline.generateImplementationTimeline(data.plans);
        return NextResponse.json({ timeline });

      default:
        return NextResponse.json(
          { error: 'Invalid action specified' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Department coordination POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process department coordination request' },
      { status: 500 }
    );
  }
}