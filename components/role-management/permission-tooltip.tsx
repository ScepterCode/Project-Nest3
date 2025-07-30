"use client"

import { ReactNode } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { 
  HelpCircle, 
  Lock, 
  Unlock, 
  Info,
  Shield,
  Users,
  BarChart3,
  Settings
} from "lucide-react"
import { Permission, PermissionCategory, PermissionScope, UserRole } from "@/lib/types/role-management"

interface PermissionTooltipProps {
  permission: string
  children?: ReactNode
  showIcon?: boolean
  variant?: "default" | "inline" | "badge"
  className?: string
}

interface PermissionExplanation {
  title: string
  description: string
  examples: string[]
  requiredRoles: UserRole[]
  scope: string
  category: PermissionCategory
}

// Permission explanations database
const PERMISSION_EXPLANATIONS: Record<string, PermissionExplanation> = {
  'content.create': {
    title: 'Create Content',
    description: 'Ability to create new educational content, assignments, and materials',
    examples: [
      'Create new assignments and quizzes',
      'Upload course materials and resources',
      'Design interactive learning activities'
    ],
    requiredRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Department level',
    category: PermissionCategory.CONTENT
  },
  'content.read': {
    title: 'View Content',
    description: 'Access to view and consume educational content and materials',
    examples: [
      'View assignments and course materials',
      'Access shared resources',
      'Read announcements and updates'
    ],
    requiredRoles: [UserRole.STUDENT, UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Personal access',
    category: PermissionCategory.CONTENT
  },
  'content.update': {
    title: 'Edit Content',
    description: 'Modify and update existing content that you own or have permission to edit',
    examples: [
      'Edit your own assignments and materials',
      'Update course descriptions',
      'Modify shared resources you created'
    ],
    requiredRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Own content only',
    category: PermissionCategory.CONTENT
  },
  'content.delete': {
    title: 'Delete Content',
    description: 'Remove content and materials from the system',
    examples: [
      'Delete outdated assignments',
      'Remove obsolete course materials',
      'Clean up unused resources'
    ],
    requiredRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Own content only',
    category: PermissionCategory.CONTENT
  },
  'content.manage': {
    title: 'Manage All Content',
    description: 'Full administrative control over content within your scope',
    examples: [
      'Manage all department content',
      'Approve or reject content submissions',
      'Set content policies and guidelines'
    ],
    requiredRoles: [UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Department level',
    category: PermissionCategory.CONTENT
  },
  'class.create': {
    title: 'Create Classes',
    description: 'Set up new classes and course sections',
    examples: [
      'Create new course sections',
      'Set up class schedules and enrollment',
      'Configure class settings and policies'
    ],
    requiredRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Department level',
    category: PermissionCategory.CONTENT
  },
  'class.manage': {
    title: 'Manage Classes',
    description: 'Administrative control over class operations and settings',
    examples: [
      'Modify class enrollment limits',
      'Manage class rosters and waitlists',
      'Configure class-wide policies'
    ],
    requiredRoles: [UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Department level',
    category: PermissionCategory.CONTENT
  },
  'enrollment.create': {
    title: 'Enroll in Classes',
    description: 'Join classes and course sections as a student',
    examples: [
      'Register for available classes',
      'Join waitlists for full classes',
      'Request enrollment in restricted classes'
    ],
    requiredRoles: [UserRole.STUDENT],
    scope: 'Personal enrollment',
    category: PermissionCategory.CONTENT
  },
  'enrollment.approve': {
    title: 'Approve Enrollments',
    description: 'Review and approve student enrollment requests',
    examples: [
      'Approve waitlist requests',
      'Grant access to restricted classes',
      'Override enrollment limits'
    ],
    requiredRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Classes you manage',
    category: PermissionCategory.CONTENT
  },
  'user.read': {
    title: 'View User Information',
    description: 'Access basic information about other users in your scope',
    examples: [
      'View student profiles in your classes',
      'See department member information',
      'Access user contact details'
    ],
    requiredRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Department level',
    category: PermissionCategory.USER_MANAGEMENT
  },
  'user.manage': {
    title: 'Manage Users',
    description: 'Administrative control over user accounts and settings',
    examples: [
      'Create and modify user accounts',
      'Reset user passwords',
      'Manage user access and permissions'
    ],
    requiredRoles: [UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN],
    scope: 'Institution level',
    category: PermissionCategory.USER_MANAGEMENT
  },
  'role.assign': {
    title: 'Assign Roles',
    description: 'Grant roles and permissions to other users',
    examples: [
      'Promote users to teacher status',
      'Assign administrative roles',
      'Grant temporary elevated permissions'
    ],
    requiredRoles: [UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN],
    scope: 'Institution level',
    category: PermissionCategory.USER_MANAGEMENT
  },
  'role.approve': {
    title: 'Approve Role Requests',
    description: 'Review and approve requests for role changes',
    examples: [
      'Approve teacher role requests',
      'Review admin role applications',
      'Process role upgrade requests'
    ],
    requiredRoles: [UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN],
    scope: 'Institution level',
    category: PermissionCategory.USER_MANAGEMENT
  },
  'role.audit': {
    title: 'View Role Audit Logs',
    description: 'Access logs of role changes and assignments',
    examples: [
      'Review role change history',
      'Monitor permission assignments',
      'Track administrative actions'
    ],
    requiredRoles: [UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN],
    scope: 'Institution level',
    category: PermissionCategory.USER_MANAGEMENT
  },
  'analytics.read': {
    title: 'View Analytics',
    description: 'Access reports and analytics data',
    examples: [
      'View class performance metrics',
      'See enrollment statistics',
      'Access usage reports'
    ],
    requiredRoles: [UserRole.TEACHER, UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Department level',
    category: PermissionCategory.ANALYTICS
  },
  'analytics.export': {
    title: 'Export Analytics Data',
    description: 'Download and export analytics reports',
    examples: [
      'Export enrollment reports',
      'Download performance data',
      'Generate custom analytics reports'
    ],
    requiredRoles: [UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN],
    scope: 'Institution level',
    category: PermissionCategory.ANALYTICS
  },
  'system.configure': {
    title: 'System Configuration',
    description: 'Modify system-wide settings and configurations',
    examples: [
      'Configure global system settings',
      'Manage system integrations',
      'Set platform-wide policies'
    ],
    requiredRoles: [UserRole.SYSTEM_ADMIN],
    scope: 'System level',
    category: PermissionCategory.SYSTEM
  },
  'institution.manage': {
    title: 'Manage Institution',
    description: 'Administrative control over institution settings',
    examples: [
      'Configure institution policies',
      'Manage institution branding',
      'Set enrollment rules and limits'
    ],
    requiredRoles: [UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN],
    scope: 'Institution level',
    category: PermissionCategory.USER_MANAGEMENT
  },
  'department.manage': {
    title: 'Manage Department',
    description: 'Administrative control over department operations',
    examples: [
      'Configure department settings',
      'Manage department users',
      'Set department-specific policies'
    ],
    requiredRoles: [UserRole.DEPARTMENT_ADMIN, UserRole.INSTITUTION_ADMIN],
    scope: 'Department level',
    category: PermissionCategory.USER_MANAGEMENT
  }
}

export function PermissionTooltip({ 
  permission, 
  children, 
  showIcon = true, 
  variant = "default",
  className 
}: PermissionTooltipProps) {
  const explanation = PERMISSION_EXPLANATIONS[permission]
  
  if (!explanation) {
    return children || <span className={className}>{permission}</span>
  }

  const getCategoryIcon = (category: PermissionCategory) => {
    switch (category) {
      case PermissionCategory.CONTENT:
        return <Shield className="h-4 w-4" />
      case PermissionCategory.USER_MANAGEMENT:
        return <Users className="h-4 w-4" />
      case PermissionCategory.ANALYTICS:
        return <BarChart3 className="h-4 w-4" />
      case PermissionCategory.SYSTEM:
        return <Settings className="h-4 w-4" />
      default:
        return <Info className="h-4 w-4" />
    }
  }

  const getRoleDisplayName = (role: UserRole): string => {
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const TooltipContentComponent = () => (
    <TooltipContent className="max-w-sm p-4" side="top">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center space-x-2">
          {getCategoryIcon(explanation.category)}
          <h4 className="font-semibold text-sm">{explanation.title}</h4>
        </div>
        
        {/* Description */}
        <p className="text-xs text-muted-foreground">
          {explanation.description}
        </p>
        
        {/* Examples */}
        <div>
          <h5 className="font-medium text-xs mb-1">Examples:</h5>
          <ul className="text-xs text-muted-foreground space-y-1">
            {explanation.examples.slice(0, 3).map((example, index) => (
              <li key={index} className="flex items-start">
                <span className="mr-1">•</span>
                <span>{example}</span>
              </li>
            ))}
          </ul>
        </div>
        
        {/* Scope and Roles */}
        <div className="pt-2 border-t border-border">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Scope:</span>
            <span className="font-medium">{explanation.scope}</span>
          </div>
          <div className="mt-1">
            <span className="text-xs text-muted-foreground">Required roles:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {explanation.requiredRoles.map((role) => (
                <Badge key={role} variant="secondary" className="text-xs px-1 py-0">
                  {getRoleDisplayName(role)}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </TooltipContent>
  )

  if (variant === "badge") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`cursor-help ${className}`}>
              {showIcon && <HelpCircle className="h-3 w-3 mr-1" />}
              {explanation.title}
            </Badge>
          </TooltipTrigger>
          <TooltipContentComponent />
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (variant === "inline") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center cursor-help underline decoration-dotted ${className}`}>
              {children || explanation.title}
              {showIcon && <HelpCircle className="h-3 w-3 ml-1" />}
            </span>
          </TooltipTrigger>
          <TooltipContentComponent />
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`cursor-help ${className}`}>
            {children || (
              <div className="flex items-center">
                {showIcon && <HelpCircle className="h-4 w-4 mr-2" />}
                <span>{explanation.title}</span>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContentComponent />
      </Tooltip>
    </TooltipProvider>
  )
}

// Convenience component for permission access indicators
interface PermissionAccessIndicatorProps {
  hasPermission: boolean
  permission: string
  className?: string
}

export function PermissionAccessIndicator({ 
  hasPermission, 
  permission, 
  className 
}: PermissionAccessIndicatorProps) {
  const explanation = PERMISSION_EXPLANATIONS[permission]
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`inline-flex items-center ${className}`}>
            {hasPermission ? (
              <Unlock className="h-4 w-4 text-green-600" />
            ) : (
              <Lock className="h-4 w-4 text-red-600" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-2">
            <div className="font-medium text-sm">
              {explanation?.title || permission}
            </div>
            <div className="text-xs">
              {hasPermission ? (
                <span className="text-green-600">✓ You have this permission</span>
              ) : (
                <span className="text-red-600">✗ Permission required</span>
              )}
            </div>
            {explanation && (
              <div className="text-xs text-muted-foreground">
                {explanation.description}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}