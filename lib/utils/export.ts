// Utility functions for exporting data

export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    alert('No data to export')
    return
  }

  // Get headers from the first object
  const headers = Object.keys(data[0])
  
  // Create CSV content
  const csvContent = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(header => {
        const value = row[header]
        // Handle values that might contain commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      }).join(',')
    )
  ].join('\n')

  // Create and download the file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${filename}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

export function exportAnalyticsData(analytics: any, students: any[], classes: any[]) {
  const timestamp = new Date().toISOString().split('T')[0]
  
  // Export overview data
  const overviewData = [{
    'Total Classes': analytics.totalClasses,
    'Total Students': analytics.totalStudents,
    'Total Assignments': analytics.totalAssignments,
    'Average Grade': `${analytics.averageGrade}%`,
    'Submission Rate': `${analytics.submissionRate}%`,
    'Export Date': new Date().toLocaleDateString()
  }]
  
  exportToCSV(overviewData, `analytics-overview-${timestamp}`)
  
  // Export student data if available
  if (students && students.length > 0) {
    const studentData = students.map(student => ({
      'Student Name': student.name,
      'Email': student.email,
      'Overall Average': `${Math.round(student.overall_average)}%`,
      'Assignments Completed': student.completed_assignments,
      'Total Assignments': student.total_assignments,
      'Completion Rate': `${Math.round((student.completed_assignments / student.total_assignments) * 100)}%`,
      'At Risk': student.at_risk ? 'Yes' : 'No',
      'Classes Enrolled': student.classes.length
    }))
    
    exportToCSV(studentData, `student-performance-${timestamp}`)
  }
  
  // Export class data if available
  if (classes && classes.length > 0) {
    const classData = classes.map(cls => ({
      'Class Name': cls.name,
      'Student Count': cls.student_count,
      'Assignment Count': cls.assignment_count,
      'Average Grade': `${cls.average_grade}%`,
      'Submission Rate': `${cls.submission_rate}%`
    }))
    
    exportToCSV(classData, `class-analytics-${timestamp}`)
  }
}

export function exportReportsData(stats: any, userActivity: any[], platformUsage: any[]) {
  const timestamp = new Date().toISOString().split('T')[0]
  
  // Export institution stats
  const statsData = [{
    'Total Users': stats.totalUsers,
    'Total Teachers': stats.totalTeachers,
    'Total Students': stats.totalStudents,
    'Total Admins': stats.totalAdmins,
    'Total Classes': stats.totalClasses,
    'Total Assignments': stats.totalAssignments,
    'Total Submissions': stats.totalSubmissions,
    'Export Date': new Date().toLocaleDateString()
  }]
  
  exportToCSV(statsData, `institution-stats-${timestamp}`)
  
  // Export user activity if available
  if (userActivity && userActivity.length > 0) {
    const activityData = userActivity.map(user => ({
      'User Name': user.name,
      'Role': user.role,
      'Last Active': user.lastActive,
      'Total Sessions': user.totalSessions,
      'Average Session Time': user.avgSessionTime
    }))
    
    exportToCSV(activityData, `user-activity-${timestamp}`)
  }
  
  // Export platform usage if available
  if (platformUsage && platformUsage.length > 0) {
    const usageData = platformUsage.map(usage => ({
      'Date': usage.date,
      'Active Users': usage.activeUsers,
      'New Users': usage.newUsers,
      'Assignments Created': usage.assignments,
      'Submissions': usage.submissions
    }))
    
    exportToCSV(usageData, `platform-usage-${timestamp}`)
  }
}

export function exportGradeData(
  overallStats: any, 
  gradeDistribution: any[], 
  assignments: any[], 
  performanceTrends: any[]
) {
  const timestamp = new Date().toISOString().split('T')[0]
  
  // Export overall stats
  const statsData = [{
    'Total Assignments': overallStats.totalAssignments,
    'Total Students': overallStats.totalStudents,
    'Average Grade': `${overallStats.averageGrade}%`,
    'At-Risk Count': overallStats.atRiskCount,
    'Export Date': new Date().toLocaleDateString()
  }]
  
  exportToCSV(statsData, `grade-stats-${timestamp}`)
  
  // Export grade distribution
  if (gradeDistribution && gradeDistribution.length > 0) {
    exportToCSV(gradeDistribution, `grade-distribution-${timestamp}`)
  }
  
  // Export assignment analytics
  if (assignments && assignments.length > 0) {
    const assignmentData = assignments.map(assignment => ({
      'Assignment Title': assignment.title,
      'Average Grade': `${assignment.average_grade}%`,
      'Submission Count': assignment.submission_count,
      'Total Students': assignment.total_students,
      'Submission Rate': `${assignment.submission_rate}%`
    }))
    
    exportToCSV(assignmentData, `assignment-analytics-${timestamp}`)
  }
  
  // Export performance trends
  if (performanceTrends && performanceTrends.length > 0) {
    exportToCSV(performanceTrends, `performance-trends-${timestamp}`)
  }
}