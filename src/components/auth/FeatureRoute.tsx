import { Outlet } from 'react-router-dom'
import { useFeatureAccess } from '@/hooks/useFeatureAccess'
import { FeatureUnavailable } from '@/components/common/FeatureUnavailable'

interface Props {
  feature: string
  featureName?: string
}

export function FeatureRoute({ feature, featureName }: Props) {
  const { allowed, isLoading, reason } = useFeatureAccess(feature)

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" />
      </div>
    )
  }

  if (!allowed) {
    return <FeatureUnavailable featureName={featureName} reason={reason} />
  }

  return <Outlet />
}
