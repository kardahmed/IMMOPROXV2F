import { MessageCircle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

interface Props {
  clientId: string
  clientName: string
  phone: string
  tenantId: string
  message?: string
  size?: 'sm' | 'md'
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  greeting: 'Bonjour {name}, je suis {agent} de {company}. Comment puis-je vous aider ?',
  visit_confirm: 'Bonjour {name}, je confirme votre visite prevue pour demain. A bientot !',
  followup: 'Bonjour {name}, suite a notre dernier echange, avez-vous des questions concernant le bien ?',
  reservation: 'Bonjour {name}, felicitations ! Votre reservation a bien ete enregistree.',
}

export function WhatsAppButton({ clientId, clientName, phone, tenantId, message, size = 'sm' }: Props) {
  const userId = useAuthStore(s => s.session?.user?.id)
  const { userProfile } = useAuthStore()
  const qc = useQueryClient()

  const logMessage = useMutation({
    mutationFn: async () => {
      await supabase.from('history').insert({
        tenant_id: tenantId,
        client_id: clientId,
        agent_id: userId,
        type: 'whatsapp_message',
        title: 'Message WhatsApp envoye',
        description: `Message a ${clientName}`,
      } as never)
      await supabase.from('clients').update({ last_contact_at: new Date().toISOString() } as never).eq('id', clientId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-history'] })
      qc.invalidateQueries({ queryKey: ['client-detail'] })
    },
  })

  function handleClick() {
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^0/, '213')
    const text = message ?? DEFAULT_TEMPLATES.greeting
      .replace('{name}', clientName.split(' ')[0])
      .replace('{agent}', `${userProfile?.first_name ?? ''} ${userProfile?.last_name ?? ''}`.trim())
      .replace('{company}', 'notre agence')

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank')
    logMessage.mutate()
    toast.success('WhatsApp ouvert — message enregistre')
  }

  if (size === 'md') {
    return (
      <button onClick={handleClick}
        className="flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#20BD5A]">
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </button>
    )
  }

  return (
    <button onClick={handleClick} title="Envoyer WhatsApp"
      className="rounded-md p-1.5 text-[#25D366] hover:bg-[#25D366]/10">
      <MessageCircle className="h-4 w-4" />
    </button>
  )
}

export { DEFAULT_TEMPLATES as WHATSAPP_TEMPLATES }
