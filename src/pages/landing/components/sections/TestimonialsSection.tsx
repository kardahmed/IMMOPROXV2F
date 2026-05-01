interface TestimonialsContent {
  items?: Array<{ name: string; text: string; photo_url?: string; role?: string }>
}

export function TestimonialsSection({ title, content }: { title?: string; content: TestimonialsContent }) {
  const items = content.items ?? []
  if (items.length === 0) return null

  return (
    <div className="py-12 px-4 bg-[#F6F9FC]">
      <div className="mx-auto max-w-4xl">
        {title && <h2 className="mb-8 text-center text-2xl font-bold text-[#0A2540]">{title}</h2>}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-xl border border-[#E3E8EF] bg-white p-6">
              <p className="text-sm leading-relaxed text-[#425466]">"{item.text}"</p>
              <div className="mt-4 flex items-center gap-3">
                {item.photo_url ? (
                  <img src={item.photo_url} alt={item.name} loading="lazy" decoding="async" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F0F4F8] text-sm font-bold text-[#425466]">
                    {item.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-[#0A2540]">{item.name}</p>
                  {item.role && <p className="text-xs text-[#8898AA]">{item.role}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
