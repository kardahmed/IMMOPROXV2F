// Stage-aware prompt context for AI call script generation.
//
// Pre-fix the prompt simply said "adapt to the current stage" and
// let Claude improvise — which produced absurd scripts like
// "Are you interested in our properties?" for a client whose
// pipeline_stage is `vente` (already bought). The model needs an
// EXPLICIT goal + dos/don'ts per stage to produce professional
// scripts that match where the client actually is in the funnel.
//
// Each stage maps to an objective + concrete instructions.
// generate-call-script and ai-suggestions inject the matching block
// at the top of their system prompt so Claude reads the rules
// before everything else.

export type PipelineStage =
  | 'accueil'
  | 'visite_a_gerer'
  | 'visite_confirmee'
  | 'visite_terminee'
  | 'negociation'
  | 'reservation'
  | 'vente'
  | 'relancement'
  | 'perdue'

interface StageContext {
  /** One-line summary of WHERE the client is — Claude reads this first. */
  position: string
  /** What the call should accomplish. Action-oriented, single goal. */
  goal: string
  /** Concrete behaviors the script SHOULD include. */
  dos: string[]
  /** Behaviors that would be unprofessional or absurd at this stage. */
  donts: string[]
  /** Concrete action the agent should drive the call toward. */
  expected_action: string
}

const STAGE_CONTEXT_FR: Record<PipelineStage, StageContext> = {
  accueil: {
    position: 'Premier contact — le client vient juste d\'arriver dans le pipeline (lead frais).',
    goal: 'Qualifier les besoins, comprendre le projet, créer la confiance.',
    dos: [
      'Te présenter clairement (toi + ton agence)',
      'Demander comment le client a connu l\'agence',
      'Comprendre le projet : type de bien, zone, timing, budget approximatif',
      'Proposer une visite si le profil colle à un projet en stock',
    ],
    donts: [
      'Pousser une vente avant d\'avoir qualifié',
      'Donner un prix exact (toujours "à partir de")',
      'Sauter les questions de qualification',
    ],
    expected_action: 'Programmer une visite OU envoyer une plaquette projet par WhatsApp.',
  },

  visite_a_gerer: {
    position: 'Le client a montré de l\'intérêt — il faut caler une date de visite.',
    goal: 'Obtenir une date et heure de visite précise, dans le calendrier de l\'agence.',
    dos: [
      'Référencer la conversation précédente (« suite à notre échange... »)',
      'Proposer 2 ou 3 créneaux concrets',
      'Confirmer le mode de visite (sur site / bureau / virtuel)',
      'Envoyer la confirmation par WhatsApp dès la fin de l\'appel',
    ],
    donts: [
      'Re-qualifier le besoin (déjà fait à l\'accueil)',
      'Demander à nouveau le budget',
      'Proposer un autre projet sans avoir d\'abord visité celui qui intéresse',
    ],
    expected_action: 'Visite planifiée avec date+heure+lieu confirmés.',
  },

  visite_confirmee: {
    position: 'La visite est planifiée — appel de rappel/confirmation à J-1 ou H-2.',
    goal: 'Confirmer la présence du client, lever les derniers doutes logistiques.',
    dos: [
      'Rappeler la date, heure et lieu exacts',
      'Demander si le client a besoin de l\'adresse GPS / nom du contact sur place',
      'Demander qui l\'accompagne (conjoint, parents) — préparer la salle si besoin',
      'Préciser ce qui sera montré : combien d\'unités, durée approximative',
    ],
    donts: [
      'Re-pitcher le bien (la visite va parler d\'elle-même)',
      'Demander le budget',
      'Exercer une pression commerciale',
    ],
    expected_action: 'Confirmation de présence + heure d\'arrivée OU report propre.',
  },

  visite_terminee: {
    position: 'Le client a vu le bien — on recueille son ressenti à chaud.',
    goal: 'Obtenir un feedback honnête, comprendre les freins, proposer la prochaine étape.',
    dos: [
      'Demander une note sur 5 + 1-2 points forts + 1-2 réserves',
      'Écouter activement les objections sans les contredire',
      'Si retour positif : proposer une réservation sous X jours',
      'Si retour mitigé : proposer une 2ème visite ou un autre bien similaire',
    ],
    donts: [
      'Insister si le client exprime un retour franchement négatif',
      'Sauter le feedback pour passer direct à la vente',
      'Donner un prix ferme avant la phase de négociation',
    ],
    expected_action: 'Feedback clair OU passage en négociation OU re-programmation visite.',
  },

  negociation: {
    position: 'Le client est intéressé mais discute le prix, les modalités ou les conditions.',
    goal: 'Lever les objections, construire un compromis acceptable pour les deux parties.',
    dos: [
      'Référencer le bien précis discuté + le budget confirmé',
      'Discuter prix, paiement (comptant/échelonné), date de livraison, finitions',
      'Proposer des compromis concrets (remise X%, paiement étalé, options offertes)',
      'Confirmer la prochaine étape : réservation avec acompte',
    ],
    donts: [
      'Présenter le bien comme s\'il était nouveau (déjà fait à l\'accueil)',
      'Sous-entendre que la vente est conclue',
      'Donner un prix final sans valider en interne avec l\'admin',
    ],
    expected_action: 'Accord de principe + RDV pour réservation avec acompte.',
  },

  reservation: {
    position: 'Le client a réservé une unité avec un acompte — la vente est presque conclue.',
    goal: 'Sécuriser le passage de la réservation à la vente définitive (signature contrat).',
    dos: [
      'Confirmer l\'acompte reçu + montant + date',
      'Rappeler la date d\'expiration de la réservation',
      'Préparer les documents nécessaires (CIN, justificatifs, contrat)',
      'Programmer le RDV signature',
    ],
    donts: [
      'Re-vendre l\'unité (déjà réservée — risque de désengager)',
      'Proposer un autre bien (le client a fait son choix)',
      'Demander le budget',
    ],
    expected_action: 'RDV signature contrat fixé.',
  },

  vente: {
    position: 'CLIENT DÉJÀ ACHETEUR — la vente est conclue, contrat signé.',
    goal: 'Suivi post-achat : vérifier satisfaction, échéancier, et obtenir un referral.',
    dos: [
      'Saluer chaleureusement et FÉLICITER pour son acquisition',
      'Vérifier l\'avancement de l\'échéancier (paiements à venir, en retard)',
      'Demander si tout va bien : finitions, livraison, contact post-vente',
      'DEMANDER UN PARRAINAGE : "Connaissez-vous quelqu\'un qui cherche aussi ?" (clé du business immobilier)',
    ],
    donts: [
      'INTERDIT : proposer un autre bien (sauf si le client le demande explicitement)',
      'INTERDIT : demander le budget',
      'INTERDIT : poser des questions de qualification (déjà passé)',
      'INTERDIT : parler comme à un prospect — c\'est un client',
    ],
    expected_action: 'Confirmer satisfaction + obtenir au moins 1 nom de prospect referral.',
  },

  relancement: {
    position: 'Le client était intéressé mais s\'est éloigné depuis quelques semaines/mois.',
    goal: 'Comprendre pourquoi il a disparu, raviver l\'intérêt sans pousser.',
    dos: [
      'Référence précise au dernier échange (date, sujet)',
      'Question ouverte : "Où en êtes-vous dans votre projet ?"',
      'Si toujours intéressé : nouvelles offres / nouveaux biens disponibles',
      'Si plus intéressé : noter pourquoi proprement, garder porte ouverte',
    ],
    donts: [
      'Reproches ("on a essayé 3 fois...")',
      'Pression commerciale agressive',
      'Faire comme si le silence n\'avait pas eu lieu',
    ],
    expected_action: 'Re-qualification du timing + re-engagement OU passage propre en perdue.',
  },

  perdue: {
    position: 'Le client a été perdu — vente non conclue. Appel de clôture respectueuse.',
    goal: 'Comprendre la vraie raison de la perte + laisser une porte ouverte pour le futur.',
    dos: [
      'Remercier le client pour son temps et son intérêt',
      'Question franche : "Qu\'est-ce qui vous a fait choisir une autre option ?"',
      'Écouter sans contredire — l\'objectif est d\'apprendre',
      'Laisser la porte ouverte : "Si votre situation change, on reste à votre disposition"',
    ],
    donts: [
      'Tenter de reconquérir agressivement',
      'Prétendre qu\'il y a encore une vente possible',
      'Proposer un nouveau pitch / nouveau bien',
      'Faire culpabiliser le client',
    ],
    expected_action: 'Recueillir la raison de perte + laisser un contact ouvert.',
  },
}

// Arabic version — kept as fallback if the model is asked to respond
// in Arabic. Same shape, identical key set.
const STAGE_CONTEXT_AR: Record<PipelineStage, StageContext> = {
  accueil: {
    position: 'اتصال أول — العميل دخل للتو في خط البيع.',
    goal: 'تأهيل الاحتياجات، فهم المشروع، بناء الثقة.',
    dos: [
      'قدّم نفسك بوضوح (أنت + الوكالة)',
      'اسأل كيف عرف العميل الوكالة',
      'افهم المشروع: نوع العقار، المنطقة، الجدول الزمني، الميزانية التقريبية',
      'اقترح زيارة إذا تطابق الملف مع مشروع متوفر',
    ],
    donts: ['ضغط للبيع قبل التأهيل', 'إعطاء سعر دقيق (دائمًا "ابتداءً من")', 'تخطي أسئلة التأهيل'],
    expected_action: 'برمجة زيارة أو إرسال كتيّب المشروع عبر واتساب.',
  },
  visite_a_gerer: {
    position: 'العميل أبدى اهتمامًا — يجب تحديد موعد للزيارة.',
    goal: 'الحصول على تاريخ وساعة محددة للزيارة في تقويم الوكالة.',
    dos: ['الإشارة إلى المحادثة السابقة', 'اقتراح 2 أو 3 مواعيد محددة', 'تأكيد طريقة الزيارة', 'إرسال التأكيد عبر واتساب'],
    donts: ['إعادة تأهيل الحاجة', 'طلب الميزانية مرة أخرى', 'اقتراح مشروع آخر قبل زيارة المشروع المطلوب'],
    expected_action: 'زيارة مخططة بتاريخ + ساعة + مكان مؤكّدين.',
  },
  visite_confirmee: {
    position: 'الزيارة مخططة — مكالمة تذكير قبل يوم أو ساعتين.',
    goal: 'تأكيد حضور العميل ورفع آخر الشكوك اللوجستية.',
    dos: ['التذكير بالتاريخ والساعة والمكان', 'سؤال إذا يحتاج عنوان GPS', 'سؤال من سيرافقه', 'تحديد ما سيعرض'],
    donts: ['إعادة عرض البيع', 'طلب الميزانية', 'الضغط التجاري'],
    expected_action: 'تأكيد الحضور + ساعة الوصول أو تأجيل سليم.',
  },
  visite_terminee: {
    position: 'العميل زار العقار — جمع انطباعاته فورًا.',
    goal: 'الحصول على تعليق صادق، فهم الموانع، اقتراح الخطوة التالية.',
    dos: ['طلب تقييم من 5 + نقاط قوة وتحفظات', 'الاستماع النشط للاعتراضات', 'إذا كان إيجابيًا: اقتراح حجز', 'إذا كان مختلطًا: زيارة ثانية'],
    donts: ['الإصرار في حالة رد سلبي', 'تخطي التعليق للذهاب مباشرة للبيع', 'إعطاء سعر نهائي قبل التفاوض'],
    expected_action: 'تعليق واضح أو الانتقال إلى التفاوض أو إعادة برمجة الزيارة.',
  },
  negociation: {
    position: 'العميل مهتم لكن يناقش السعر أو الشروط.',
    goal: 'رفع الاعتراضات، بناء حل وسط مقبول للطرفين.',
    dos: ['الإشارة إلى العقار المحدد + الميزانية المؤكدة', 'مناقشة السعر، الدفع، تاريخ التسليم', 'اقتراح حلول وسط', 'تأكيد الخطوة التالية: حجز'],
    donts: ['تقديم العقار كأنه جديد', 'الإيحاء بأن البيع تم', 'إعطاء سعر نهائي دون التحقق'],
    expected_action: 'اتفاق مبدئي + موعد للحجز.',
  },
  reservation: {
    position: 'العميل حجز وحدة بدفعة أولى — البيع تقريبًا تم.',
    goal: 'تأمين الانتقال من الحجز إلى البيع النهائي (توقيع العقد).',
    dos: ['تأكيد استلام الدفعة الأولى', 'التذكير بتاريخ انتهاء الحجز', 'تحضير الوثائق', 'تحديد موعد التوقيع'],
    donts: ['إعادة بيع الوحدة', 'اقتراح عقار آخر', 'طلب الميزانية'],
    expected_action: 'موعد توقيع العقد محدد.',
  },
  vente: {
    position: 'عميل مالك بالفعل — البيع تم، العقد موقّع.',
    goal: 'متابعة ما بعد البيع: التحقق من الرضا، الجدول، والحصول على إحالة.',
    dos: ['تحية ودية وتهنئة', 'التحقق من الجدول الزمني', 'سؤال إذا كل شيء على ما يرام', 'طلب الإحالة: هل تعرف شخصًا يبحث؟'],
    donts: ['ممنوع: اقتراح عقار آخر', 'ممنوع: طلب الميزانية', 'ممنوع: أسئلة التأهيل', 'ممنوع: التحدث كأنه عميل محتمل'],
    expected_action: 'تأكيد الرضا + الحصول على اسم محتمل واحد للإحالة.',
  },
  relancement: {
    position: 'العميل كان مهتمًا لكنه ابتعد منذ أسابيع/أشهر.',
    goal: 'فهم سبب الاختفاء، إحياء الاهتمام دون ضغط.',
    dos: ['إشارة دقيقة إلى آخر تبادل', 'سؤال مفتوح', 'إذا لا يزال مهتمًا: عروض جديدة', 'إذا لم يعد: تسجيل السبب وإبقاء الباب مفتوحًا'],
    donts: ['اللوم', 'الضغط التجاري العدواني', 'التظاهر بأن الصمت لم يحدث'],
    expected_action: 'إعادة تأهيل التوقيت + إعادة الإشراك أو الانتقال إلى الفقدان.',
  },
  perdue: {
    position: 'تم فقدان العميل — البيع لم يتم. مكالمة إغلاق محترمة.',
    goal: 'فهم السبب الحقيقي للفقد + إبقاء الباب مفتوحًا للمستقبل.',
    dos: ['شكر العميل على وقته', 'سؤال صريح: ما الذي جعلك تختار خيارًا آخر؟', 'الاستماع دون مناقضة', 'إبقاء الباب مفتوحًا'],
    donts: ['محاولة استعادته بقوة', 'ادعاء أن البيع لا يزال ممكنًا', 'اقتراح عرض جديد', 'جعل العميل يشعر بالذنب'],
    expected_action: 'جمع سبب الفقد + ترك جهة اتصال مفتوحة.',
  },
}

/**
 * Build the stage-context block to inject at the top of the
 * generate-call-script / ai-suggestions prompt. Returns a multi-line
 * string in the requested language. If `override` is provided
 * (tenant-customized via call_script_overrides), it REPLACES the
 * defaults entirely so each agency can express their own playbook.
 */
export function buildStagePromptBlock(
  stage: PipelineStage,
  language: 'fr' | 'ar' = 'fr',
  override?: string | null,
): string {
  if (override && override.trim().length > 0) {
    const header = language === 'ar'
      ? `سياق المرحلة (${stage}) — تعليمات مخصصة من الوكالة:`
      : `CONTEXTE DE L'ÉTAPE (${stage}) — Instructions personnalisées de l'agence :`
    return `${header}\n${override.trim()}\n`
  }

  const ctx = (language === 'ar' ? STAGE_CONTEXT_AR : STAGE_CONTEXT_FR)[stage]
  if (!ctx) return ''

  if (language === 'ar') {
    return [
      `سياق المرحلة (${stage}):`,
      `الموقع: ${ctx.position}`,
      `الهدف من الاتصال: ${ctx.goal}`,
      `يجب فعل:`,
      ...ctx.dos.map(d => `  - ${d}`),
      `لا يجب فعل:`,
      ...ctx.donts.map(d => `  - ${d}`),
      `الإجراء المتوقع: ${ctx.expected_action}`,
    ].join('\n')
  }

  return [
    `CONTEXTE DE L'ÉTAPE (${stage}):`,
    `POSITION: ${ctx.position}`,
    `OBJECTIF DE L'APPEL: ${ctx.goal}`,
    `À FAIRE:`,
    ...ctx.dos.map(d => `  • ${d}`),
    `À NE PAS FAIRE:`,
    ...ctx.donts.map(d => `  • ${d}`),
    `ACTION ATTENDUE: ${ctx.expected_action}`,
  ].join('\n')
}

/** True when this stage is "post-sale" — the UI shows a warning
 *  banner so the agent doesn't mistake a vente/perdue/relancement
 *  call for a regular prospect call. */
export function isPostSaleStage(stage: PipelineStage): boolean {
  return stage === 'vente' || stage === 'perdue' || stage === 'relancement'
}
