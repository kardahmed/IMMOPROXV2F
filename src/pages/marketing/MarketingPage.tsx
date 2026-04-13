import { useEffect } from 'react'

export function MarketingPage() {
  useEffect(() => {
    window.location.replace('/marketing/index.html')
  }, [])
  return null
}
