"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { 
  Shield, 
  User, 
  Clock, 
  AlertCircle, 
  Info,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import { UserRole, UserRoleAssignment, Permission } from "@/lib/types/role-management"
import { PermissionChecker } from "@/lib/services/permission-checker"
import { useSupabase } from "@/components/session-provider"

interface UserRoleProfileSectionProps {
  userId: string
  className?: string
}

export function UserRoleProfileSection({ userId, className }: UserRoleProfileSectionProps) {
  const supabase = useSupabase()
  const [roles, setRoles] = useState<UserRoleAssignment[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAllPermissions, setShowAllPermissions] = useState(false)

  useEffect(() => {
    fetchUserRolesAndPermissions()
  }, [userId])

  const fetchUserRolesAndPermissions = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Fetch user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_role_assignments')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')

      if (rolesError) throw rolesError

      const userRoles: UserRoleAssignment[] = (rolesData || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        role: row.role as UserRole,
        status: row.status,
        assignedBy: row.assigned_by,
        assignedAt: new Date(row.assigned_at),
        expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
        departmentId: row.department_id,
        institutionId: row.institution_id,
        isTemporary: row.is_temporary,
        metadata: row.metadata || {},
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      }))

      setRoles(userRoles)

      // Fetch user permissions using PermissionChecker
      const permissionChecker = new PermissionChecker({
        cacheEnabled: true,
        cacheTtl: 300,
        bulkCheckLimit: 100
      })

      const userPermissions = await permissionChecker.getUserPermissions(userId)
      setPermissions(userPermissions)

    } catch (err) {
      console.error('Error fetching user roles and permissions:', err)
      setError(err instanceof Error ? err.message : 'Failed to load role information')
    } finally {
      setIsLoading(false)
    }
  }

  const getRoleDisplayName = (role: UserRole): string => {
    const roleNames = {
      [UserRole.STUDENT]: 'Student',
      [UserRole.TEACHER]: 'Teacher',
      [UserRole.DEPARTMENT_ADMIN]: 'Department Admin',
      [UserRole.INSTITUTION_ADMIN]: 'Institution Admin',
      [UserRole.SYSTEM_ADMIN]: 'System Admin'
    }
    return roleNames[role] || role
  }

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case UserRole.SYSTEM_ADMIN:
        return "destructive"
      case UserRole.INSTITUTION_ADMIN:
        return "default"
      case UserRole.DEPARTMENT_ADMIN:
        return "secondary"
      case UserRole.TEACHER:
        return "outline"
      case UserRole.STUDENT:
        return "secondary"
      default:
        return "outline"
    }
  }

  const isRoleExpiringSoon = (role: UserRoleAssignment): boolean => {
    if (!role.expiresAt) return false
    const now = new Date()
    const daysUntilExpiry = Math.ceil((role.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0
  }

  const isRoleExpired = (role: UserRoleAssignment): boolean => {
    if (!role.expiresAt) return false
    return role.expiresAt < new Date()
  }

  const formatExpirationDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const groupPermissionsByCategory = (permissions: Permission[]) => {
    return permissions.reduce((groups, permission) => {
      const category = permission.category
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(permission)
      return groups
    }, {} as Record<string, Permission[]>)
  }

  const getCategoryDisplayName = (category: string): string => {
    const categoryNames = {
      'content': 'Content Management',
      'user_management': 'User Management',
      'analytics': 'Analytics',
      'system': 'System Administration'
    }
    return categoryNames[category as keyof typeof categoryNames] || category
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2">Loading role information...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center text-red-600">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>Error: {error}</span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2"
            onClick={fetchUserRolesAndPermissions}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const permissionGroups = groupPermissionsByCategory(permissions)
  const displayedPermissions = showAllPermissions ? permissions : permissions.slice(0, 6)

  return (
    <div className={className}>
      {/* Current Roles Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            Current Roles
          </CardTitle>
          <CardDescription>
            Your active roles and their status within the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No active roles assigned</p>
            </div>
          ) : (
            <div className="space-y-3">
              {roles.map((role) => (
                <div key={role.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Badge variant={getRoleBadgeVariant(role.role)}>
                      {getRoleDisplayName(role.role)}
                    </Badge>
                    {role.isTemporary && (
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        Temporary
                      </Badge>
                    )}
                    {isRoleExpiringSoon(role) && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Expires Soon
                      </Badge>
                    )}
                    {isRoleExpired(role) && (
                      <Badge variant="destructive" className="text-xs">
                        Expired
                      </Badge>
                    )}
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <div>Assigned: {formatExpirationDate(role.assignedAt)}</div>
                    {role.expiresAt && (
                      <div>Expires: {formatExpirationDate(role.expiresAt)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permissions Section */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Info className="h-5 w-5 mr-2" />
            Your Permissions
          </CardTitle>
          <CardDescription>
            What you can do based on your current roles
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permissions.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <p>No permissions available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(permissionGroups).map(([category, categoryPermissions]) => (
                <div key={category}>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">
                    {getCategoryDisplayName(category)}
                  </h4>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {categoryPermissions.slice(0, showAllPermissions ? undefined : 3).map((permission) => (
                      <Badge key={permission.id} variant="outline" className="text-xs">
                        {permission.description}
                      </Badge>
                    ))}
                    {!showAllPermissions && categoryPermissions.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{categoryPermissions.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              
              {permissions.length > 6 && (
                <>
                  <Separator />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllPermissions(!showAllPermissions)}
                    className="w-full"
                  >
                    {showAllPermissions ? (
                      <>
                        <ChevronUp className="h-4 w-4 mr-2" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4 mr-2" />
                        Show All Permissions ({permissions.length})
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}