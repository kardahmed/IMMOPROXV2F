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
  onresult: ((e: {
    results: {
      length: number
      [k: number]: {
        length: number
        isFinal: boolean
        [k: number]: { transcript: string }
      }
    }
    resultIndex: number
  }) => void) | null
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
  // What X is currently doing (Recherche client…, Création visite…) —
  // populated from SSE tool_start events and cleared on tool_done.
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const recognitionRef = useRef<SR | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Cumulative final transcript across the recording session.
  // Recognition emits per-utterance — we stitch them so a pause
  // doesn't truncate the user's full sentence.
  const finalTranscriptRef = useRef('')
  // Lets the user cancel the in-flight request mid-stream.
  const abortRef = useRef<AbortController | null>(null)

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
    // Continuous + interim results so the mic stays open across natural
    // pauses ("hmm…") and the user sees the live transcript building up
    // in the input. The user explicitly stops by re-clicking the mic.
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const seg = e.results[i]
        const t = seg[0]?.transcript ?? ''
        if (seg.isFinal) finalTranscriptRef.current += t + ' '
        else interim += t
      }
      setInput((finalTranscriptRef.current + interim).trim())
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
    finalTranscriptRef.current = ''
    setInput('')
    try {
      recognitionRef.current.start()
      setRecording(true)
    } catch { setRecording(false) }
  }

  function stopMic() {
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    setRecording(false)
    // Send whatever we captured. Tiny delay so the last onresult finalizes.
    const captured = finalTranscriptRef.current.trim()
    finalTranscriptRef.current = ''
    if (captured) setTimeout(() => sendMessage(captured), 100)
  }

  function cancelRequest() {
    abortRef.current?.abort()
    abortRef.current = null
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setLoading(false)
    setPendingAction(null)
  }

  // Map tool names to user-facing labels for the "Recherche client…" indicator.
  const TOOL_LABELS: Record<string, string> = {
    search_clients: 'Recherche client…',
    create_client: 'Création client…',
    create_visit: 'Création visite…',
    create_task: 'Création tâche…',
    update_client_stage: 'Changement étape…',
    update_client_info: 'Mise à jour client…',
    mark_visit_completed: 'Clôture visite…',
    send_whatsapp: 'Envoi WhatsApp…',
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    // Snapshot conversation for the request body BEFORE adding the user turn,
    // so we don't double-count the message we're about to send.
    const conversationToSend = messages.slice(-10)

    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setInput('')
    setLoading(true)
    setPendingAction(null)
    abortRef.current = new AbortController()

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const resp = await fetch(`${supabaseUrl}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          question: trimmed,
          language: lang,
          conversation: conversationToSend,
        }),
        signal: abortRef.current.signal,
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erreur réseau' }))
        throw new Error(err.error || 'Erreur')
      }
      if (!resp.body) throw new Error('No response body')

      // Add an empty assistant message we'll fill in via streaming.
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      const reader = resp.body.getReader()
      const dec = new TextDecoder()
      let buffer = ''
      let assistantText = ''
      // Buffer text until a sentence boundary (.!?) before speaking it,
      // so the TTS plays whole sentences instead of choppy fragments.
      let speakBuffer = ''
      // Cancel any in-flight TTS so the new response doesn't overlap.
      if (voiceOn && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += dec.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: { type: string; delta?: string; name?: string; ok?: boolean; cost_da?: number; message?: string }
          try { event = JSON.parse(line.slice(6)) } catch { continue }

          if (event.type === 'text' && typeof event.delta === 'string') {
            assistantText += event.delta
            speakBuffer += event.delta
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (last?.role === 'assistant') {
                return [...prev.slice(0, -1), { ...last, content: assistantText }]
              }
              return prev
            })
            // Speak completed sentences as they arrive.
            const m = speakBuffer.match(/^([\s\S]+?[.!?؟])(?:\s|$)/)
            if (m) {
              speak(m[1].trim())
              speakBuffer = speakBuffer.slice(m[0].length)
            }
          } else if (event.type === 'tool_start' && event.name) {
            setPendingAction(TOOL_LABELS[event.name] ?? `${event.name}…`)
          } else if (event.type === 'tool_done') {
            setPendingAction(null)
          } else if (event.type === 'final') {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (last?.role === 'assistant') {
                return [...prev.slice(0, -1), { ...last, cost_da: event.cost_da }]
              }
              return prev
            })
            // Speak any remaining text that didn't end with punctuation.
            if (speakBuffer.trim()) speak(speakBuffer.trim())
            speakBuffer = ''
          } else if (event.type === 'error') {
            throw new Error(event.message ?? 'Erreur')
          }
        }
      }
    } catch (err) {
      // Silent on user cancel — we already cleared state in cancelRequest.
      if ((err as { name?: string })?.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.content === '') {
          return [...prev.slice(0, -1), { role: 'assistant', content: `❌ ${msg}` }]
        }
        return [...prev, { role: 'assistant', content: `❌ ${msg}` }]
      })
    } finally {
      setLoading(false)
      setPendingAction(null)
      abortRef.current = null
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
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] text-white shadow-2xl shadow-purple-500/30 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-300/40"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 flex h-[560px] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-immo-border-default bg-immo-bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-immo-border-default bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] px-4 py-3">
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
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#7C3AED]/20 to-[#3B82F6]/20">
                  <Sparkles className="h-6 w-6 text-[#7C3AED]" />
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
                      className="rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-left text-xs text-immo-text-secondary transition-colors hover:border-[#7C3AED]/40 hover:text-immo-text-primary"
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
                      ? 'bg-[#7C3AED] text-white'
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

            {/* Pending action pill — visible while a tool is executing */}
            {pendingAction && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-[#7C3AED]/30 bg-[#7C3AED]/10 px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7C3AED]" />
                  <span className="text-xs font-medium text-[#7C3AED]">{pendingAction}</span>
                </div>
              </div>
            )}

            {/* Generic loading indicator + cancel button */}
            {loading && !pendingAction && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-immo-bg-primary px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7C3AED]" />
                  <span className="text-xs text-immo-text-muted">{t('x_assistant.thinking')}</span>
                  <button
                    type="button"
                    onClick={cancelRequest}
                    className="ml-2 text-[10px] font-medium text-immo-status-red hover:underline"
                  >
                    Annuler
                  </button>
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
                    : 'bg-immo-bg-primary text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-[#7C3AED]'
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
                className="h-9 flex-1 rounded-full border border-immo-border-default bg-immo-bg-primary px-4 text-sm text-immo-text-primary placeholder:text-immo-text-muted focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]/20 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label={t('x_assistant.send')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7C3AED] text-white transition-colors hover:bg-[#7C3AED]/90 disabled:opacity-50"
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
