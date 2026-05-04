import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface FAQContent {
  items?: Array<{ question: string; answer: string }>
}

export function FAQSection({ title, content }: { title?: string; content: FAQContent }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const items = content.items ?? []
  if (items.length === 0) return null

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        {title && <h2 className="mb-8 text-center text-2xl font-bold text-[#0A2540]">{title}</h2>}
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-[#E3E8EF] bg-white">
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="flex w-full items-center justify-between px-5 py-4 text-start"
              >
                <span className="text-sm font-semibold text-[#0A2540]">{item.question}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-[#8898AA] transition-transform ${openIdx === i ? 'rotate-180' : ''}`} />
              </button>
              {openIdx === i && (
                <div className="border-t border-[#E3E8EF] px-5 py-4">
                  <p className="text-sm leading-relaxed text-[#425466]">{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
