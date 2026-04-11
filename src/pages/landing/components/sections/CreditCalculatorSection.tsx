import { useState, useMemo } from 'react'
import { formatPrice } from '@/lib/constants'

interface CreditCalcContent {
  default_price?: number
  default_rate?: number
  default_years?: number
}

export function CreditCalculatorSection({ title, content, accent }: { title?: string; content: CreditCalcContent; accent: string }) {
  const [price, setPrice] = useState(String(content.default_price ?? 10000000))
  const [downPayment, setDownPayment] = useState('30')
  const [rate, setRate] = useState(String(content.default_rate ?? 6.5))
  const [years, setYears] = useState(String(content.default_years ?? 20))

  const result = useMemo(() => {
    const p = Number(price) || 0
    const dp = (Number(downPayment) || 0) / 100
    const r = (Number(rate) || 0) / 100 / 12
    const n = (Number(years) || 1) * 12

    const loan = p * (1 - dp)
    const monthly = r > 0 ? (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loan / n
    const total = monthly * n

    return { loan, monthly: Math.round(monthly), total: Math.round(total), interest: Math.round(total - loan) }
  }, [price, downPayment, rate, years])

  const inputCls = "h-11 w-full rounded-lg border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none focus:border-[color:var(--accent)]"

  return (
    <div className="py-12 px-4 bg-[#F6F9FC]">
      <div className="mx-auto max-w-2xl">
        {title && <h2 className="mb-8 text-center text-2xl font-bold text-[#0A2540]">{title}</h2>}

        <div className="rounded-2xl border border-[#E3E8EF] bg-white p-8 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#425466]">Prix du bien (DA)</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} className={inputCls} style={{ '--accent': accent } as React.CSSProperties} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#425466]">Apport personnel (%)</label>
              <input type="range" min="0" max="80" value={downPayment} onChange={e => setDownPayment(e.target.value)} className="mt-3 w-full accent-[color:var(--accent)]" style={{ '--accent': accent } as React.CSSProperties} />
              <span className="text-sm font-medium text-[#0A2540]">{downPayment}%</span>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#425466]">Taux annuel (%)</label>
              <input type="number" step="0.1" value={rate} onChange={e => setRate(e.target.value)} className={inputCls} style={{ '--accent': accent } as React.CSSProperties} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#425466]">Duree (annees)</label>
              <input type="number" min="1" max="30" value={years} onChange={e => setYears(e.target.value)} className={inputCls} style={{ '--accent': accent } as React.CSSProperties} />
            </div>
          </div>

          <div className="mt-6 rounded-xl p-6" style={{ background: `${accent}10` }}>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-xs text-[#8898AA]">Mensualite</p>
                <p className="text-3xl font-bold" style={{ color: accent }}>{formatPrice(result.monthly)}</p>
                <p className="text-xs text-[#8898AA]">/ mois</p>
              </div>
              <div>
                <p className="text-xs text-[#8898AA]">Montant emprunte</p>
                <p className="text-lg font-bold text-[#0A2540]">{formatPrice(result.loan)}</p>
              </div>
              <div>
                <p className="text-xs text-[#8898AA]">Cout total du credit</p>
                <p className="text-lg font-bold text-[#0A2540]">{formatPrice(result.total)}</p>
              </div>
              <div>
                <p className="text-xs text-[#8898AA]">Interets totaux</p>
                <p className="text-lg font-bold text-[#CD3D64]">{formatPrice(result.interest)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
