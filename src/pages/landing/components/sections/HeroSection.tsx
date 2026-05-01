interface HeroContent {
  subtitle?: string
  background_image?: string
  background_video?: string
  overlay_opacity?: number
}

export function HeroSection({ title, content, accent }: { title?: string; content: HeroContent; accent: string }) {
  const hasMedia = content.background_image || content.background_video
  const overlay = content.overlay_opacity ?? 0.4

  return (
    <div className="relative overflow-hidden py-20 px-4" style={{ minHeight: hasMedia ? 400 : 'auto' }}>
      {/* Background */}
      {content.background_video ? (
        <video autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover">
          <source src={content.background_video} type="video/mp4" />
        </video>
      ) : content.background_image ? (
        <img src={content.background_image} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}15, ${accent}05)` }} />
      )}

      {hasMedia && <div className="absolute inset-0 bg-black" style={{ opacity: overlay }} />}

      <div className="relative mx-auto max-w-3xl text-center">
        {title && <h1 className={`text-4xl font-bold sm:text-5xl ${hasMedia ? 'text-white' : 'text-[#0A2540]'}`}>{title}</h1>}
        {content.subtitle && <p className={`mt-4 text-lg ${hasMedia ? 'text-white/80' : 'text-[#425466]'}`}>{content.subtitle}</p>}
      </div>
    </div>
  )
}
