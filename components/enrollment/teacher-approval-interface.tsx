"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  TeacherRosterData,
  EnrollmentStatus,
  EnrollmentRequestStatus
} from "@/lib/types/enrollment"
import {
  Users,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  Mail,
  MoreVertical,
  UserMinus,
  UserPlus,
  FileText,
  Search
} from "lucide-react"
import { format } from "date-fns"

interface TeacherApprovalInterfaceProps {
  classId: string;
}

export default function TeacherApprovalInterface({ classId }: TeacherApprovalInterfaceProps) {
  const [rosterData, setRosterData] = useState<TeacherRosterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("roster")
  const [selectedRequests, setSelectedRequests] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [processingAction, setProcessingAction] = useState<string | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    fetchRosterData()
  }, [classId])

  const fetchRosterData = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/classes/${classId}/roster`)
      if (!response.ok) {
        throw new Error('Failed to fetch roster data')
      }

      const data = await response.json()
      setRosterData(data)
    } catch (err) {
      console.error('Error fetching roster data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load roster data')
    } finally {
      setLoading(false)
    }
  }

  const handleApproveRequest = async (requestId: string, notes?: string) => {
    try {
      setProcessingAction(requestId)
      
      const response = await fetch(`/api/enrollment-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to approve request')
      }

      await fetchRosterData()
      alert('Enrollment request approved successfully')
    } catch (err) {
      console.error('Error approving request:', err)
      alert(err instanceof Error ? err.message : 'Failed to approve request')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleDenyRequest = async (requestId: string) => {
    const reason = prompt('Please provide a reason for denying this enrollment request:')
    if (!reason) return

    try {
      setProcessingAction(requestId)
      
      const response = await fetch(`/api/enrollment-requests/${requestId}/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to deny request')
      }

      await fetchRosterData()
      alert('Enrollment request denied')
    } catch (err) {
      console.error('Error denying request:', err)
      alert(err instanceof Error ? err.message : 'Failed to deny request')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleBatchApprove = async () => {
    if (selectedRequests.length === 0) {
      alert('Please select requests to approve')
      return
    }

    if (!confirm(`Are you sure you want to approve ${selectedRequests.length} enrollment requests?`)) {
      return
    }

    try {
      setProcessingAction('batch')
      
      const response = await fetch(`/api/classes/${classId}/enrollment-requests/batch-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestIds: selectedRequests })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to batch approve requests')
      }

      const result = await response.json()
      await fetchRosterData()
      setSelectedRequests([])
      alert(`Batch approval completed: ${result.successful} successful, ${result.failed} failed`)
    } catch (err) {
      console.error('Error batch approving requests:', err)
      alert(err instanceof Error ? err.message : 'Failed to batch approve requests')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleRemoveStudent = async (studentId: string, studentName: string) => {
    const reason = prompt(`Please provide a reason for removing ${studentName} from the class:`)
    if (!reason) return

    if (!confirm(`Are you sure you want to remove ${studentName} from the class?`)) {
      return
    }

    try {
      setProcessingAction(studentId)
      
      const response = await fetch(`/api/classes/${classId}/students/${studentId}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to remove student')
      }

      await fetchRosterData()
      alert(`${studentName} has been removed from the class`)
    } catch (err) {
      console.error('Error removing student:', err)
      alert(err instanceof Error ? err.message : 'Failed to remove student')
    } finally {
      setProcessingAction(null)
    }
  }

  const handlePromoteFromWaitlist = async (waitlistEntryId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to promote ${studentName} from the waitlist?`)) {
      return
    }

    try {
      setProcessingAction(waitlistEntryId)
      
      const response = await fetch(`/api/waitlist/${waitlistEntryId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to promote student')
      }

      await fetchRosterData()
      alert(`${studentName} has been promoted from the waitlist`)
    } catch (err) {
      console.error('Error promoting student:', err)
      alert(err instanceof Error ? err.message : 'Failed to promote student')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleExportRoster = async (format: 'csv' | 'json' = 'csv') => {
    try {
      const response = await fetch(`/api/classes/${classId}/roster/export?format=${format}`)
      if (!response.ok) {
        throw new Error('Failed to export roster')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = `class-roster-${classId}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error exporting roster:', err)
      alert('Failed to export roster')
    }
  }

  const getStatusBadgeVariant = (status: EnrollmentStatus | EnrollmentRequestStatus) => {
    switch (status) {
      case EnrollmentStatus.ENROLLED:
      case EnrollmentRequestStatus.APPROVED:
        return "default"
      case EnrollmentStatus.PENDING:
      case EnrollmentRequestStatus.PENDING:
        return "secondary"
      case EnrollmentStatus.WAITLISTED:
        return "outline"
      case EnrollmentStatus.DROPPED:
      case EnrollmentStatus.WITHDRAWN:
      case EnrollmentRequestStatus.DENIED:
        return "destructive"
      default:
        return "secondary"
    }
  }

  const filteredEnrolledStudents = rosterData?.enrolledStudents.filter(({ student }) =>
    `${student.firstName} ${student.lastName} ${student.email} ${student.studentId || ''}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  ) || []

  const filteredPendingRequests = rosterData?.pendingRequests.filter(({ student }) =>
    `${student.firstName} ${student.lastName} ${student.email} ${student.studentId || ''}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  ) || []

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading roster data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!rosterData) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>No roster data available</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Class Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{rosterData.class.name}</span>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={() => handleExportRoster('csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportRoster('json')}>
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Capacity: {rosterData.class.currentEnrollment}/{rosterData.class.capacity} • 
            Waitlist: {rosterData.waitlistStudents.length} • 
            Pending: {rosterData.pendingRequests.length}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{rosterData.enrolledStudents.length}</div>
              <p className="text-sm text-muted-foreground">Enrolled</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{rosterData.pendingRequests.length}</div>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{rosterData.waitlistStudents.length}</div>
              <p className="text-sm text-muted-foreground">Waitlisted</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {rosterData.statistics.enrollmentRate.toFixed(1)}%
              </div>
              <p className="text-sm text-muted-foreground">Enrollment Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="flex items-center space-x-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search students..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="roster">Class Roster</TabsTrigger>
          <TabsTrigger value="pending">
            Pending Requests ({rosterData.pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="waitlist">
            Waitlist ({rosterData.waitlistStudents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enrolled Students ({rosterData.enrolledStudents.length})</CardTitle>
              <CardDescription>Students currently enrolled in your class</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Year/Major</TableHead>
                    <TableHead>Enrolled</TableHead>
                    <TableHead>Performance</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEnrolledStudents.map(({ enrollment, student, performance }) => (
                    <TableRow key={enrollment.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{student.firstName} {student.lastName}</div>
                          <div className="text-sm text-muted-foreground">{student.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>{student.studentId || 'N/A'}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{student.year || 'N/A'}</div>
                          <div className="text-muted-foreground">{student.major || 'N/A'}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {format(new Date(enrollment.enrolledAt), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {performance && (
                          <div className="text-sm">
                            <div>Attendance: {performance.attendance}%</div>
                            <div>Assignments: {performance.assignments}%</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              disabled={processingAction === student.id}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => window.open(`mailto:${student.email}`)}>
                              <Mail className="h-4 w-4 mr-2" />
                              Email Student
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleRemoveStudent(student.id, `${student.firstName} ${student.lastName}`)}
                              className="text-red-600"
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Remove from Class
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredEnrolledStudents.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'No students match your search' : 'No enrolled students'}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {rosterData.pendingRequests.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Batch Actions</CardTitle>
                    <CardDescription>Select multiple requests for batch processing</CardDescription>
                  </div>
                  <Button 
                    onClick={handleBatchApprove}
                    disabled={selectedRequests.length === 0 || processingAction === 'batch'}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Selected ({selectedRequests.length})
                  </Button>
                </div>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Pending Enrollment Requests</CardTitle>
              <CardDescription>Students waiting for approval to join your class</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedRequests.length === filteredPendingRequests.length && filteredPendingRequests.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedRequests(filteredPendingRequests.map(r => r.request.id))
                          } else {
                            setSelectedRequests([])
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Year/Major/GPA</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Justification</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPendingRequests.map(({ request, student, eligibility }) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedRequests.includes(request.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRequests([...selectedRequests, request.id])
                            } else {
                              setSelectedRequests(selectedRequests.filter(id => id !== request.id))
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{student.firstName} {student.lastName}</div>
                          <div className="text-sm text-muted-foreground">{student.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>{student.studentId || 'N/A'}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{student.year || 'N/A'}</div>
                          <div>{student.major || 'N/A'}</div>
                          {student.gpa && <div>GPA: {student.gpa}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {format(new Date(request.requestedAt), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm max-w-xs truncate">
                          {request.justification || 'No justification provided'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            onClick={() => handleApproveRequest(request.id)}
                            disabled={processingAction === request.id}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDenyRequest(request.id)}
                            disabled={processingAction === request.id}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Deny
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredPendingRequests.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'No pending requests match your search' : 'No pending enrollment requests'}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waitlist" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Waitlisted Students</CardTitle>
              <CardDescription>Students waiting for available spots in your class</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Position</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Year/Major</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Probability</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rosterData.waitlistStudents.map(({ entry, student }) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge variant="outline">#{entry.position}</Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{student.firstName} {student.lastName}</div>
                          <div className="text-sm text-muted-foreground">{student.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>{student.studentId || 'N/A'}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{student.year || 'N/A'}</div>
                          <div className="text-muted-foreground">{student.major || 'N/A'}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {format(new Date(entry.addedAt), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {Math.round(entry.estimatedProbability * 100)}%
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => handlePromoteFromWaitlist(entry.id, `${student.firstName} ${student.lastName}`)}
                          disabled={processingAction === entry.id || rosterData.class.currentEnrollment >= rosterData.class.capacity}
                        >
                          <UserPlus className="h-3 w-3 mr-1" />
                          Promote
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {rosterData.waitlistStudents.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No students on waitlist
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}