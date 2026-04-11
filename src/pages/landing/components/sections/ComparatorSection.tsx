import { formatPrice } from '@/lib/constants'

interface ComparatorContent {
  items?: Array<{ type: string; surface: string; rooms: string; price: number; features: string[] }>
}

export function ComparatorSection({ title, content, accent }: { title?: string; content: ComparatorContent; accent: string }) {
  const items = content.items ?? []
  if (items.length === 0) return null

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-4xl">
        {title && <h2 className="mb-8 text-center text-2xl font-bold text-[#0A2540]">{title}</h2>}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border-b border-[#E3E8EF] px-4 py-3 text-left text-xs font-semibold text-[#8898AA]">Critere</th>
                {items.map((item, i) => (
                  <th key={i} className="border-b border-[#E3E8EF] px-4 py-3 text-center">
                    <span className="text-lg font-bold text-[#0A2540]">{item.type}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#F0F4F8]">
                <td className="px-4 py-3 text-sm text-[#8898AA]">Surface</td>
                {items.map((item, i) => <td key={i} className="px-4 py-3 text-center text-sm font-medium text-[#0A2540]">{item.surface}</td>)}
              </tr>
              <tr className="border-b border-[#F0F4F8]">
                <td className="px-4 py-3 text-sm text-[#8898AA]">Pieces</td>
                {items.map((item, i) => <td key={i} className="px-4 py-3 text-center text-sm font-medium text-[#0A2540]">{item.rooms}</td>)}
              </tr>
              <tr className="border-b border-[#F0F4F8]">
                <td className="px-4 py-3 text-sm text-[#8898AA]">Prix</td>
                {items.map((item, i) => <td key={i} className="px-4 py-3 text-center text-lg font-bold" style={{ color: accent }}>{formatPrice(item.price)}</td>)}
              </tr>
              {/* Dynamic feature rows */}
              {(() => {
                const allFeatures = [...new Set(items.flatMap(i => i.features))]
                return allFeatures.map(feature => (
                  <tr key={feature} className="border-b border-[#F0F4F8]">
                    <td className="px-4 py-2.5 text-sm text-[#8898AA]">{feature}</td>
                    {items.map((item, i) => (
                      <td key={i} className="px-4 py-2.5 text-center">
                        {item.features.includes(feature)
                          ? <span className="text-[#00D4A0]">✓</span>
                          : <span className="text-[#E3E8EF]">—</span>
                        }
                      </td>
                    ))}
                  </tr>
                ))
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
