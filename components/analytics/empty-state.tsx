import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionText?: string
  actionHref?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionText,
  actionHref,
  onAction,
  className = ""
}: EmptyStateProps) {
  return (
    <Card className={className}>
      <CardContent className="py-12 text-center">
        <Icon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-gray-600 mb-4">{description}</p>
        {(actionText && (actionHref || onAction)) && (
          <>
            {actionHref ? (
              <Link href={actionHref}>
                <Button>
                  {actionText}
                </Button>
              </Link>
            ) : (
              <Button onClick={onAction}>
                {actionText}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}