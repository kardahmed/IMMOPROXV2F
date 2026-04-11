import { useEffect } from 'react'

interface SEOHeadProps {
  title: string
  description?: string
  ogImage?: string
  slug: string
  tenantName?: string
}

export function SEOHead({ title, description, ogImage, slug, tenantName }: SEOHeadProps) {
  useEffect(() => {
    // Page title
    document.title = `${title} | ${tenantName ?? 'IMMO PRO-X'}`

    // Meta description
    setMeta('description', description ?? title)

    // Open Graph
    setMeta('og:title', title, 'property')
    setMeta('og:description', description ?? '', 'property')
    setMeta('og:type', 'website', 'property')
    setMeta('og:url', `${window.location.origin}/p/${slug}`, 'property')
    if (ogImage) setMeta('og:image', ogImage, 'property')

    // Twitter Card
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', title)
    setMeta('twitter:description', description ?? '')
    if (ogImage) setMeta('twitter:image', ogImage)

    // Schema.org structured data
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: title,
      description: description ?? '',
      url: `${window.location.origin}/p/${slug}`,
      ...(ogImage ? { image: ogImage } : {}),
      ...(tenantName ? { provider: { '@type': 'Organization', name: tenantName } } : {}),
    }

    let scriptEl = document.querySelector('script[data-schema="landing"]') as HTMLScriptElement
    if (!scriptEl) {
      scriptEl = document.createElement('script')
      scriptEl.type = 'application/ld+json'
      scriptEl.setAttribute('data-schema', 'landing')
      document.head.appendChild(scriptEl)
    }
    scriptEl.textContent = JSON.stringify(schema)

    return () => {
      document.title = 'IMMO PRO-X'
      scriptEl?.remove()
    }
  }, [title, description, ogImage, slug, tenantName])

  return null
}

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.content = content
}
