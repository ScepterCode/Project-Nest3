"use client"

import { useState, useEffect } from 'react'
import { useAuth } from "@/contexts/auth-context"
import { DatabaseStatusBanner } from '@/components/database-status-banner'

export default function ReportsTestPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('Reports test page loaded')
    console.log('Current user:', user)
    console.log('User role:', user?.role)
    setLoading(false)
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <DatabaseStatusBanner />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h1 className="text-3xl font-bold mb-4">Reports Test Page</h1>
          <div className="space-y-4">
            <p><strong>User ID:</strong> {user?.id || 'Not logged in'}</p>
            <p><strong>User Role:</strong> {user?.role || 'No role'}</p>
            <p><strong>User Email:</strong> {user?.email || 'No email'}</p>
            <p><strong>Page Status:</strong> Loading successfully</p>
          </div>
          
          <div className="mt-6 p-4 bg-green-100 rounded">
            <h2 className="text-lg font-semibold text-green-800">✅ Test Results</h2>
            <ul className="mt-2 text-green-700">
              <li>✅ Page renders without errors</li>
              <li>✅ User context is available</li>
              <li>✅ No permission gate blocking access</li>
              <li>✅ Components load properly</li>
            </ul>
          </div>
          
          <div className="mt-4 p-4 bg-blue-100 rounded">
            <h3 className="text-lg font-semibold text-blue-800">Next Steps</h3>
            <p className="text-blue-700">
              If you can see this page, the issue is likely with the RoleGate or permission system in the main reports page.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}