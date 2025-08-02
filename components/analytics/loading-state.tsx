import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

interface LoadingStateProps {
  title?: string
  description?: string
  className?: string
}

export function LoadingState({
  title = "Loading...",
  description = "Please wait while we fetch your data.",
  className = ""
}: LoadingStateProps) {
  return (
    <Card className={className}>
      <CardContent className="py-12 text-center">
        <Loader2 className="h-8 w-8 text-blue-600 mx-auto mb-4 animate-spin" />
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </CardContent>
    </Card>
  )
}

// Skeleton loader for metric cards
export function MetricCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/3"></div>
        </div>
      </CardContent>
    </Card>
  )
}

// Skeleton loader for charts
export function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </CardContent>
    </Card>
  )
}