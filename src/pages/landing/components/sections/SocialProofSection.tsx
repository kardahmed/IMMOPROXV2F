import { useState, useEffect } from 'react'

interface SocialProofContent {
  items?: Array<{ name: string; action: string; time: string }>
  interval?: number
}

export function SocialProofPopup({ content }: { content: SocialProofContent }) {
  const [visible, setVisible] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const items = content.items ?? []
  const interval = (content.interval ?? 30) * 1000

  useEffect(() => {
    if (items.length === 0) return

    // Show first after 5s, then every interval
    const firstTimeout = setTimeout(() => {
      setVisible(true)
      setTimeout(() => setVisible(false), 5000)
    }, 5000)

    const recurring = setInterval(() => {
      setCurrentIdx(prev => (prev + 1) % items.length)
      setVisible(true)
      setTimeout(() => setVisible(false), 5000)
    }, interval)

    return () => { clearTimeout(firstTimeout); clearInterval(recurring) }
  }, [items.length, interval])

  if (items.length === 0 || !visible) return null

  const item = items[currentIdx]

  return (
    <div className="fixed bottom-6 left-6 z-40 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-[#E3E8EF] bg-white px-4 py-3 shadow-lg">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00D4A0]/10">
          <svg className="h-5 w-5 text-[#00D4A0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <div>
          <p className="text-sm font-medium text-[#0A2540]">{item.name} {item.action}</p>
          <p className="text-[11px] text-[#8898AA]">{item.time}</p>
        </div>
        <button onClick={() => setVisible(false)} className="ml-2 text-[#8898AA] hover:text-[#0A2540]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  )
}
