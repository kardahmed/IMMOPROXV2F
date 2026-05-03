import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Mic, MicOff, Send, X, Volume2, VolumeX, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useFeatureAccess } from '@/hooks/useFeatureAccess'

// Web Speech API type bridges. Ambient lib.dom.d.ts only ships these
// for some browsers; declaring them here keeps TS happy without
// pulling a separate @types package.
type SR = {
  start: () => void
  stop: () => void
  abort: () => void
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { results: { [k: number]: { [k: number]: { transcript: string } } }; resultIndex: number }) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SR
    webkitSpeechRecognition?: new () => SR
  }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  cost_da?: number
}

// X — the floating AI assistant. Phase 1: Q&A only, no actions.
//
// Click the button to open the panel. Type or hit the mic to ask
// anything about your CRM (clients, visites, tâches, projets). X
// answers in 1-3 sentences, optionally read aloud via the browser's
// Speech Synthesis API.
//
// Mounted once at the AppLayout level for tenant users with
// `x_assistant_qa` enabled in their plan.
export function XAssistant() {
  const { t, i18n } = useTranslation()
  const access = useFeatureAccess('x_assistant_qa')

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const recognitionRef = useRef<SR | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const lang = i18n.language === 'ar' ? 'ar' : 'fr'

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  // Init Web Speech Recognition once (browser-native, free)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) return
    const r = new Ctor()
    r.lang = lang === 'ar' ? 'ar-DZ' : 'fr-FR'
    r.continuous = false
    r.interimResults = false
    r.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      if (transcript) {
        setInput(transcript)
        // Auto-send after voice capture
        setTimeout(() => sendMessage(transcript), 50)
      }
    }
    r.onerror = (e) => {
      setRecording(false)
      const code = e?.error ?? 'unknown'
      const msg =
        code === 'not-allowed' || code === 'service-not-allowed'
          ? 'Permission micro refusée. Autorise le micro dans la barre d\'adresse Chrome puis recharge la page.'
          : code === 'no-speech'
          ? 'Aucune parole détectée. Réessaie en parlant plus fort.'
          : code === 'audio-capture'
          ? 'Aucun micro détecté. Vérifie que ton micro est branché et autorisé.'
          : code === 'network'
          ? 'Erreur réseau pendant la reconnaissance vocale.'
          : `Erreur micro: ${code}`
      setMessages(prev => [...prev, { role: 'assistant', content: msg }])
    }
    r.onend = () => setRecording(false)
    recognitionRef.current = r
    return () => { try { r.abort() } catch { /* noop */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  function speak(text: string) {
    if (!voiceOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang === 'ar' ? 'ar-DZ' : 'fr-FR'
      u.rate = 1.05
      window.speechSynthesis.speak(u)
    } catch { /* noop */ }
  }

  function startMic() {
    if (!recognitionRef.current) {
      alert(t('x_assistant.no_mic_support'))
      return
    }
    try {
      recognitionRef.current.start()
      setRecording(true)
    } catch { setRecording(false) }
  }

  function stopMic() {
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    setRecording(false)
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setInput('')
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const resp = await fetch(`${supabaseUrl}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          question: trimmed,
          language: lang,
          conversation: messages.slice(-10),  // last 10 turns for context
        }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erreur réseau' }))
        throw new Error(err.error || 'Erreur')
      }

      const data = await resp.json() as { response: string; cost_da: number }
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, cost_da: data.cost_da }])
      speak(data.response)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${msg}` }])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  // Hide widget entirely when feature isn't available (no plan, disabled)
  if (access.isLoading || !access.allowed) return null

  return (
    <>
      {/* Floating trigger button (always visible) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t('x_assistant.open')}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#0579DA] to-[#3B82F6] text-white shadow-2xl shadow-blue-500/30 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/40"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 flex h-[560px] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-immo-border-default bg-immo-bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-immo-border-default bg-gradient-to-r from-[#0579DA] to-[#3B82F6] px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-white" />
              <h3 className="text-sm font-semibold text-white">X Assistant</h3>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white">{t('x_assistant.beta')}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setVoiceOn(v => !v)}
                aria-label={voiceOn ? t('x_assistant.voice_off') : t('x_assistant.voice_on')}
                title={voiceOn ? t('x_assistant.voice_off') : t('x_assistant.voice_on')}
                className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label={t('x_assistant.close')}
                className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#0579DA]/20 to-[#3B82F6]/20">
                  <Sparkles className="h-6 w-6 text-[#0579DA]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-immo-text-primary">{t('x_assistant.welcome_title')}</p>
                  <p className="mt-1 text-xs text-immo-text-muted">{t('x_assistant.welcome_subtitle')}</p>
                </div>
                <div className="mt-2 grid w-full grid-cols-1 gap-1.5">
                  {[
                    t('x_assistant.example_1'),
                    t('x_assistant.example_2'),
                    t('x_assistant.example_3'),
                  ].map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(ex)}
                      className="rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-left text-xs text-immo-text-secondary transition-colors hover:border-[#0579DA]/40 hover:text-immo-text-primary"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-[#0579DA] text-white'
                      : 'bg-immo-bg-primary text-immo-text-primary'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.cost_da !== undefined && m.cost_da > 0 && (
                    <p className="mt-1 text-[10px] opacity-50">~{m.cost_da.toFixed(3)} DA</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-immo-bg-primary px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0579DA]" />
                  <span className="text-xs text-immo-text-muted">{t('x_assistant.thinking')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-immo-border-default bg-immo-bg-card p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={recording ? stopMic : startMic}
                disabled={loading}
                aria-label={recording ? t('x_assistant.mic_stop') : t('x_assistant.mic_start')}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                  recording
                    ? 'bg-immo-status-red text-white animate-pulse'
                    : 'bg-immo-bg-primary text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-[#0579DA]'
                }`}
              >
                {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('x_assistant.input_placeholder')}
                disabled={loading || recording}
                maxLength={1500}
                className="h-9 flex-1 rounded-full border border-immo-border-default bg-immo-bg-primary px-4 text-sm text-immo-text-primary placeholder:text-immo-text-muted focus:border-[#0579DA] focus:outline-none focus:ring-1 focus:ring-[#0579DA]/20 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label={t('x_assistant.send')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0579DA] text-white transition-colors hover:bg-[#0579DA]/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[10px] text-center text-immo-text-muted">{t('x_assistant.disclaimer')}</p>
          </form>
        </div>
      )}
    </>
  )
}
