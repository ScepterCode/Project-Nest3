"use client"

import { useState, useEffect } from 'react'
import { useAuth } from "@/contexts/auth-context"

export default function SimpleReportsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('Simple reports page loaded')
    console.log('User:', user)
    setLoading(false)
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow">
            <h1 className="text-2xl font-bold mb-4">Loading Reports...</h1>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white p-6 rounded-lg shadow">
          <h1 className="text-2xl font-bold mb-6">Simple Reports Page</h1>
          
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded">
              <h2 className="font-semibold text-blue-800">✅ Page Status</h2>
              <p className="text-blue-700">This page is loading successfully!</p>
            </div>
            
            <div className="p-4 bg-green-50 rounded">
              <h2 className="font-semibold text-green-800">👤 User Information</h2>
              <p className="text-green-700"><strong>Email:</strong> {user?.email || 'Not logged in'}</p>
              <p className="text-green-700"><strong>Role:</strong> {user?.role || 'No role'}</p>
              <p className="text-green-700"><strong>ID:</strong> {user?.id || 'No ID'}</p>
            </div>
            
            <div className="p-4 bg-yellow-50 rounded">
              <h2 className="font-semibold text-yellow-800">📊 Mock Reports Data</h2>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-blue-600">42</div>
                  <div className="text-sm text-gray-600">Total Users</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-green-600">15</div>
                  <div className="text-sm text-gray-600">Active Classes</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-purple-600">128</div>
                  <div className="text-sm text-gray-600">Assignments</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-orange-600">89%</div>
                  <div className="text-sm text-gray-600">Completion Rate</div>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 rounded">
              <h2 className="font-semibold text-gray-800">🔧 Next Steps</h2>
              <p className="text-gray-700">
                If you can see this page, the basic routing and authentication are working. 
                The issue with the main reports page is likely in the complex component structure or database queries.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}