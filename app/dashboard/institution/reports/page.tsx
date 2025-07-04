"use client"

"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'

interface Activity {
  id: string
  userId: string
  type: string
  description: string
  timestamp: string
}

interface Report {
  reportName: string
  institutionId: string
  generatedAt: string
  summary: {
    totalTeachers: number
    totalStudents: number
    activeClasses: number
    completedAssignments: number
  }
  details: any[]
}

export default function ActivityReportsPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [report, setReport] = useState<Report | null>(null)

  useEffect(() => {
    fetchActivities()
    fetchReport()
  }, [])

  const fetchActivities = async () => {
    const res = await fetch('/api/institution/activity')
    const data = await res.json()
    setActivities(data)
  }

  const fetchReport = async () => {
    const res = await fetch('/api/institution/reports')
    const data = await res.json()
    setReport(data)
  }

  const handleExportReport = () => {
    if (report) {
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(report, null, 2)
      )}`
      const link = document.createElement('a')
      link.href = jsonString
      link.download = `institution_report_${new Date().toISOString()}.json`
      link.click()
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:gap-8 md:p-6">
      <h1 className="text-lg font-semibold md:text-2xl">Activity & Reports</h1>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activities</CardTitle>
          <CardDescription>Overview of recent activities within your institution.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5">
            {activities.map((activity) => (
              <li key={activity.id}>
                <strong>{activity.type}:</strong> {activity.description} (User: {activity.userId}) - {new Date(activity.timestamp).toLocaleString()}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Institution Report</CardTitle>
          <CardDescription>Generate and export a summary report for your institution.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {report ? (
            <div className="grid gap-2">
              <p><strong>Report Name:</strong> {report.reportName}</p>
              <p><strong>Generated At:</strong> {new Date(report.generatedAt).toLocaleString()}</p>
              <p><strong>Total Teachers:</strong> {report.summary.totalTeachers}</p>
              <p><strong>Total Students:</strong> {report.summary.totalStudents}</p>
              <p><strong>Active Classes:</strong> {report.summary.activeClasses}</p>
              <p><strong>Completed Assignments:</strong> {report.summary.completedAssignments}</p>
              <Button onClick={handleExportReport}>Export Report (JSON)</Button>
            </div>
          ) : (
            <p>Loading report...</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
