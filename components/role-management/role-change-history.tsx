"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { 
  History, 
  ChevronDown, 
  ChevronUp, 
  Calendar,
  User,
  ArrowRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw
} from "lucide-react"
import { UserRole, RoleAuditLog, AuditAction } from "@/lib/types/role-management"
import { useSupabase } from "@/components/session-provider"

interface RoleChangeHistoryProps {
  userId: string
  className?: string
}

interface RoleHistoryEntry {
  id: string
  action: AuditAction
  oldRole?: UserRole
  newRole?: UserRole
  changedBy: string
  changedByName?: string
  reason?: string
  timestamp: Date
  status: 'completed' | 'pending' | 'failed'
  metadata?: Record<string, any>
}

export function RoleChangeHistory({ userId, className }: RoleChangeHistoryProps) {
  const supabase = useSupabase()
  const [history, setHistory] = useState<RoleHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchRoleHistory()
  }, [userId])

  const fetchRoleHistory = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Fetch role audit logs
      const { data: auditData, error: auditError } = await supabase
        .from('role_audit_log')
        .select(`
          *,
          changed_by_user:users!role_audit_log_changed_by_fkey(first_name, last_name)
        `)
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })

      if (auditError) throw auditError

      // Also fetch role requests for pending/denied status
      const { data: requestsData, error: requestsError } = await supabase
        .from('role_requests')
        .select(`
          *,
          reviewed_by_user:users!role_requests_reviewed_by_fkey(first_name, last_name)
        `)
        .eq('user_id', userId)
        .order('requested_at', { ascending: false })

      if (requestsError) throw requestsError

      // Combine and format the data
      const auditEntries: RoleHistoryEntry[] = (auditData || []).map(entry => ({
        id: entry.id,
        action: entry.action as AuditAction,
        oldRole: entry.old_role as UserRole,
        newRole: entry.new_role as UserRole,
        changedBy: entry.changed_by,
        changedByName: entry.changed_by_user 
          ? `${entry.changed_by_user.first_name} ${entry.changed_by_user.last_name}`.trim()
          : 'System',
        reason: entry.reason,
        timestamp: new Date(entry.timestamp),
        status: 'completed',
        metadata: entry.metadata || {}
      }))

      const requestEntries: RoleHistoryEntry[] = (requestsData || [])
        .filter(request => request.status !== 'approved') // Approved requests are already in audit log
        .map(request => ({
          id: `request-${request.id}`,
          action: request.status === 'pending' ? AuditAction.REQUESTED : 
                  request.status === 'denied' ? AuditAction.DENIED : AuditAction.REQUESTED,
          oldRole: request.current_role as UserRole,
          newRole: request.requested_role as UserRole,
          changedBy: request.status === 'denied' && request.reviewed_by ? request.reviewed_by : request.user_id,
          changedByName: request.status === 'denied' && request.reviewed_by_user
            ? `${request.reviewed_by_user.first_name} ${request.reviewed_by_user.last_name}`.trim()
            : 'You',
          reason: request.status === 'denied' ? request.review_notes : request.justification,
          timestamp: request.status === 'denied' && request.reviewed_at 
            ? new Date(request.reviewed_at) 
            : new Date(request.requested_at),
          status: request.status === 'pending' ? 'pending' : 
                  request.status === 'denied' ? 'failed' : 'completed',
          metadata: { requestId: request.id, justification: request.justification }
        }))

      // Combine and sort all entries
      const allEntries = [...auditEntries, ...requestEntries]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      setHistory(allEntries)

    } catch (err) {
      console.error('Error fetching role history:', err)
      setError(err instanceof Error ? err.message : 'Failed to load role history')
    } finally {
      setIsLoading(false)
    }
  }

  const getRoleDisplayName = (role?: UserRole): string => {
    if (!role) return 'Unknown'
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const getActionDisplayName = (action: AuditAction): string => {
    switch (action) {
      case AuditAction.ASSIGNED:
        return 'Role Assigned'
      case AuditAction.REVOKED:
        return 'Role Revoked'
      case AuditAction.CHANGED:
        return 'Role Changed'
      case AuditAction.EXPIRED:
        return 'Role Expired'
      case AuditAction.REQUESTED:
        return 'Role Requested'
      case AuditAction.APPROVED:
        return 'Request Approved'
      case AuditAction.DENIED:
        return 'Request Denied'
      default:
        return action
    }
  }

  const getActionIcon = (action: AuditAction, status: string) => {
    if (status === 'pending') {
      return <Clock className="h-4 w-4 text-yellow-600" />
    }
    if (status === 'failed') {
      return <XCircle className="h-4 w-4 text-red-600" />
    }

    switch (action) {
      case AuditAction.ASSIGNED:
      case AuditAction.APPROVED:
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case AuditAction.REVOKED:
      case AuditAction.DENIED:
        return <XCircle className="h-4 w-4 text-red-600" />
      case AuditAction.CHANGED:
        return <ArrowRight className="h-4 w-4 text-blue-600" />
      case AuditAction.EXPIRED:
        return <AlertCircle className="h-4 w-4 text-orange-600" />
      case AuditAction.REQUESTED:
        return <Clock className="h-4 w-4 text-blue-600" />
      default:
        return <History className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>
      case 'failed':
        return <Badge variant="destructive">Denied</Badge>
      case 'completed':
        return <Badge variant="default">Completed</Badge>
      default:
        return null
    }
  }

  const formatTimestamp = (date: Date): string => {
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    }
  }

  const toggleExpanded = (entryId: string) => {
    const newExpanded = new Set(expandedEntries)
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId)
    } else {
      newExpanded.add(entryId)
    }
    setExpandedEntries(newExpanded)
  }

  const displayedHistory = showAll ? history : history.slice(0, 5)

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Loading role history...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
            <p className="text-red-600 mb-4">Error: {error}</p>
            <Button variant="outline" onClick={fetchRoleHistory}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <History className="h-5 w-5 mr-2" />
          Role Change History
        </CardTitle>
        <CardDescription>
          Track your role assignments, changes, and requests over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No role history available</p>
            <p className="text-sm">Role changes and requests will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedHistory.map((entry, index) => (
              <div key={entry.id} className="relative">
                {/* Timeline line */}
                {index < displayedHistory.length - 1 && (
                  <div className="absolute left-6 top-12 w-px h-8 bg-border" />
                )}
                
                <div className="flex items-start space-x-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-1">
                    {getActionIcon(entry.action, entry.status)}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium text-sm">
                          {getActionDisplayName(entry.action)}
                        </h4>
                        {getStatusBadge(entry.status)}
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatTimestamp(entry.timestamp)}
                      </div>
                    </div>
                    
                    {/* Role change display */}
                    <div className="mt-1 flex items-center space-x-2 text-sm">
                      {entry.oldRole && (
                        <>
                          <Badge variant="outline" className="text-xs">
                            {getRoleDisplayName(entry.oldRole)}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </>
                      )}
                      {entry.newRole && (
                        <Badge variant="secondary" className="text-xs">
                          {getRoleDisplayName(entry.newRole)}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Changed by */}
                    <div className="mt-1 flex items-center text-xs text-muted-foreground">
                      <User className="h-3 w-3 mr-1" />
                      {entry.changedByName || 'System'}
                    </div>
                    
                    {/* Reason (expandable) */}
                    {entry.reason && (
                      <div className="mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => toggleExpanded(entry.id)}
                        >
                          {expandedEntries.has(entry.id) ? (
                            <>
                              <ChevronUp className="h-3 w-3 mr-1" />
                              Hide details
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3 mr-1" />
                              Show details
                            </>
                          )}
                        </Button>
                        
                        {expandedEntries.has(entry.id) && (
                          <div className="mt-2 p-3 bg-muted rounded-md">
                            <p className="text-xs text-muted-foreground">
                              <strong>Reason:</strong> {entry.reason}
                            </p>
                            {entry.metadata?.justification && entry.metadata.justification !== entry.reason && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <strong>Original request:</strong> {entry.metadata.justification}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {index < displayedHistory.length - 1 && (
                  <Separator className="mt-4" />
                )}
              </div>
            ))}
            
            {/* Show more/less button */}
            {history.length > 5 && (
              <div className="text-center pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-2" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Show All ({history.length} entries)
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}