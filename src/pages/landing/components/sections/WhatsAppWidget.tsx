interface WhatsAppWidgetProps {
  phone: string
  message?: string
  accent?: string
}

export function WhatsAppWidget({ phone, message }: WhatsAppWidgetProps) {
  const formatted = phone.replace(/[\s\-\(\)]/g, '').replace(/^0/, '213')
  const msg = encodeURIComponent(message ?? 'Bonjour, je suis interesse par votre projet immobilier')

  return (
    <a
      href={`https://wa.me/${formatted}?text=${msg}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg shadow-[#25D366]/30 transition-transform hover:scale-110"
      title="Contactez-nous sur WhatsApp"
    >
      <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12.001 2C6.478 2 2 6.478 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.932-1.39A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.524 2 12.001 2z"/>
      </svg>
    </a>
  )
}
