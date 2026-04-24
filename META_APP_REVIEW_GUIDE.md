# 🎯 Guide Meta App Review — IMMO PRO-X

**Objectif:** passer l'app Meta d'IMMO PRO-X de "test mode" (5 destinataires max) à "production mode" (n'importe quelle agence peut connecter son WhatsApp).

**Temps requis:** ~1-2h de travail + 2-8 semaines d'attente Meta.

**À suivre dans l'ordre, en 1 seule session.** Ne saute pas d'étapes, Meta est très strict sur l'ordre et la cohérence du dossier.

---

## 📋 PRÉREQUIS — Checklist avant de commencer

Coche chaque ligne avant de démarrer. Si quelque chose manque, arrête-toi là et règle-le d'abord.

- [ ] Ordinateur + connexion stable (évite d'enregistrer la vidéo depuis un téléphone)
- [ ] QuickTime Player (Mac) ou OBS Studio pour les vidéos screencast
- [ ] Accès admin au Meta Business Manager: https://business.facebook.com
- [ ] Accès admin au Meta Developers: https://developers.facebook.com/apps
- [ ] Ton app IMMO PRO-X existe déjà dans Meta Developers (avec WhatsApp activé en test mode)
- [ ] Domaine marketing actif: https://immoprox.io
- [ ] Domaine app actif: https://app.immoprox.io
- [ ] Privacy Policy accessible: https://immoprox.io/confidentialite
- [ ] Terms of Service accessibles: https://immoprox.io/cgu
- [ ] Super admin credentials IMMO PRO-X (pour la démo vidéo)
- [ ] Au moins 1 client de test dans ton CRM (pour la démo vidéo)
- [ ] Numéro WhatsApp Business **dédié** (SIM neuve recommandée, non utilisée sur WhatsApp grand public)

⚠️ **Si tu n'as pas encore de SIM dédiée:** va en acheter une AVANT de commencer. Utiliser ton numéro perso est une mauvaise idée — si un jour tu changes, ton business WhatsApp casse.

---

## 🧩 ÉTAPE 1 — Business Verification

**Si déjà fait → passe à l'ÉTAPE 2.**

### 1.1. Vérifier le statut actuel

1. Va sur: https://business.facebook.com/settings
2. Dans la sidebar: **Sécurité du compte** → **Vérification de l'entreprise**
3. Regarde le statut: `Vérifié` / `En cours` / `Non vérifié`

### 1.2. Si "Non vérifié": soumettre

1. Clique **Commencer la vérification**
2. Remplis:
   - **Nom légal de l'entreprise** (exactement comme sur les documents officiels)
   - **Adresse** (doit matcher le Registre de Commerce algérien)
   - **Numéro de téléphone** (ligne fixe ou mobile pro)
   - **Site web** → `https://immoprox.io`
3. Upload les documents:
   - **Registre de Commerce algérien** (scan PDF)
   - **Extrait de rôle** ou **Facture d'électricité récente** à l'adresse de l'entreprise
4. Soumets → Meta te renvoie un code par SMS ou email → rentre-le
5. **Délai:** 1-3 jours ouvrés

### 1.3. Troubleshooting

- **Rejeté pour "document illisible":** re-scan en 300 DPI minimum
- **Rejeté pour "adresse ne matche pas":** vérifie que l'adresse sur Meta Business = adresse sur le Registre de Commerce, caractère par caractère
- **Rejeté pour "nom différent":** si ton business name varie entre arabe et français, utilise la version qui correspond aux documents

---

## 📱 ÉTAPE 2 — Configurer le numéro WhatsApp Business

### 2.1. Choisir le numéro

Utilise une **SIM neuve dédiée** à IMMO PRO-X. Le numéro:
- Ne doit PAS être actif sur WhatsApp grand public (classique)
- Doit pouvoir recevoir SMS et appels pour la vérification
- Sera LE numéro affiché à tes utilisateurs

**⚠️ Test préalable:**
1. Ouvre WhatsApp sur un autre téléphone
2. Essaie d'ajouter le numéro comme contact
3. Si WhatsApp propose "Envoyer un message" → le numéro est DÉJÀ sur WhatsApp grand public, **NE L'UTILISE PAS**
4. Si WhatsApp dit "Ce contact n'utilise pas WhatsApp" → parfait, tu peux l'utiliser

### 2.2. Enregistrer le numéro dans Meta

1. Va sur: https://developers.facebook.com/apps/ → clique sur ton app IMMO PRO-X
2. Sidebar → **WhatsApp** → **API Setup**
3. Section **Send and receive messages** → clique **Add phone number**
4. Remplis:
   - **Display name:** `IMMO PRO-X`
   - **Category:** `Business Services`
   - **Description:** `CRM immobilier pour les agences et promoteurs algeriens`
   - **Business website:** `https://immoprox.io`
5. Entre le numéro de téléphone → reçois le code de vérification par SMS ou voice call → rentre-le

### 2.3. Attendre validation du Display Name

- Meta valide le `Display Name` sous **1-2 jours**
- Tu reçois un email de confirmation
- Une fois validé, tes messages WhatsApp afficheront **"IMMO PRO-X"** (pas "Test Number")

### 2.4. Récupérer les nouveaux identifiants

Une fois le numéro validé:
1. Retourne sur **WhatsApp → API Setup**
2. Note:
   - **Phone number ID** (commence par un nombre long, ~15 chiffres)
   - **WhatsApp Business Account ID** (WABA ID)
   - **Permanent access token** — générer via **Meta Business Settings → System Users** (voir étape 3.5 ci-dessous si pas encore fait)

### 2.5. Mettre à jour les secrets Supabase

Va sur: https://supabase.com/dashboard/project/lbnqccsebwiifxcucflg/settings/functions → **Secrets**

Met à jour:
```
META_WHATSAPP_PHONE_NUMBER_ID = <nouveau Phone number ID>
META_WHATSAPP_ACCESS_TOKEN = <nouveau permanent access token>
```

Save. La prochaine notif WhatsApp partira depuis le vrai numéro "IMMO PRO-X" — plus de "Test Number".

---

## 🎬 ÉTAPE 3 — Préparer les vidéos screencast

Meta exige **2 vidéos séparées** (une par permission demandée). Chaque vidéo doit durer **2-3 minutes** maximum, en anglais (ou sous-titres anglais sur audio français).

### 3.1. Setup avant d'enregistrer

1. Ouvre un navigateur en mode **Incognito** (pas d'extensions, interface propre)
2. Va sur `https://app.immoprox.io` et connecte-toi avec un compte admin de TEST
3. Assure-toi d'avoir au moins 1 client dans le pipeline avec téléphone valide (pour la démo)
4. Ferme tous les onglets inutiles, WhatsApp Desktop, notifications système

### 3.2. Vidéo #1 — `whatsapp_business_messaging`

**But:** Montrer à Meta que ton app envoie des messages WhatsApp professionnels à des clients dans le cadre d'un CRM immobilier.

#### Script (2-3 min)

```
[0:00-0:15] Intro
"This is IMMO PRO-X, a CRM platform for real estate agencies in Algeria.
We help agents manage their pipeline, book property visits, and communicate
with clients via WhatsApp Business API."

[0:15-0:30] Login
- Ouvre app.immoprox.io/login
- Entre les credentials d'un compte admin de test
- Arrive sur /dashboard

[0:30-0:50] Show the client pipeline
- Clique sur "Pipeline" dans la sidebar
- Montre la vue kanban avec quelques clients
- Clique sur un client (ex: "Test Client Ahmed")

[0:50-1:30] Trigger a WhatsApp message
- Dans la fiche client, montre le bouton WhatsApp vert
- Clique sur "Send visit confirmation template"
- Montre le modal qui apparaît avec le template à envoyer
- Clique "Send"
- Montre la confirmation ("Message sent successfully")

[1:30-2:00] Show the received message
- Switch to your phone screen (enregistre avec AirPlay ou screen mirroring)
- Ouvre WhatsApp
- Montre le message WhatsApp reçu depuis "IMMO PRO-X"
- Zoom sur le contenu: "Bonjour Ahmed, confirmation de votre visite demain..."

[2:00-2:30] Compliance note
"We only send messages via approved templates from Meta Business Manager.
Each tenant manages their own WhatsApp Business Account through the Embedded
Signup flow. Users explicitly opted in to receive these communications when
they signed up for our partner agency's services."

[2:30] End — "Thank you for reviewing our app."
```

#### Anglais à lire (si tu ne fais pas de voix-off)

Ajoute ces textes en **subtitles** dans la vidéo:
- `CRM for Algerian real estate agencies`
- `Agents manage clients and appointments`
- `WhatsApp Business API is used for approved templates only`
- `Example: visit confirmation to a client`
- `Message delivered from IMMO PRO-X business number`
- `Users opted in when signing up with our partner agency`

### 3.3. Vidéo #2 — `whatsapp_business_management`

**But:** Montrer que tu gères les templates et la configuration WhatsApp à l'échelle de la plateforme.

#### Script (2-3 min)

```
[0:00-0:15] Intro
"As the platform operator, we manage WhatsApp templates and tenant
configuration centrally through our Super Admin console."

[0:15-0:45] Login as super admin
- app.immoprox.io/login (super admin account)
- Arrive sur /admin/tenants
- Montre la liste des tenants (agences) inscrits

[0:45-1:30] Show WhatsApp management
- Sidebar → "WhatsApp"
- Montre les 4 onglets: Configuration / Tenants / Messages / Templates
- Clique sur "Templates" → montre la liste des templates (approved / pending)
- Clique sur "Tenants" → montre les agences connectées + leur quota

[1:30-2:00] Show message analytics
- Onglet "Messages" → montre les 50 derniers messages envoyés par les tenants
- Montre les statuts: sent / delivered / read / failed
- Montre le KPI global en haut: "Total messages sent: X"

[2:00-2:30] Compliance
"We ensure every template is pre-approved by Meta before tenants can use it.
We monitor delivery rates and flag any tenant with unusual activity. Users
can opt out at any time via our unsubscribe mechanism."

[2:30] End
```

### 3.4. Conseils d'enregistrement

- **QuickTime Mac:** File → New Screen Recording → sélectionne juste la fenêtre du navigateur
- **OBS Windows/Mac:** règle l'output à 1920x1080, 30fps, MP4
- Garde le curseur visible et bouge-le tranquillement (les reviewers suivent)
- Si tu parles en français, **ajoute des sous-titres anglais** (CapCut ou iMovie)
- Upload sur YouTube en **unlisted** (lien privé partageable) pour donner à Meta

### 3.5. Créer un "System User" token permanent

Si pas encore fait. Le token temporaire de 24h ne suffit pas pour la review.

1. https://business.facebook.com/settings/system-users
2. **Add** → Name: `IMMO PRO-X System User` → Role: `Admin`
3. **Add Assets** → sélectionne ton app IMMO PRO-X + ton WABA → Full Control
4. **Generate new token**:
   - App: IMMO PRO-X
   - Token expiration: `Never`
   - Permissions: coche `whatsapp_business_messaging` et `whatsapp_business_management`
5. Copie le token (il n'est plus jamais affiché), mets-le dans Supabase secrets

---

## 📝 ÉTAPE 4 — Soumettre l'App Review

### 4.1. Accès

1. https://developers.facebook.com/apps → clique ton app IMMO PRO-X
2. Sidebar → **App Review** → **Permissions and Features**

### 4.2. Demander `whatsapp_business_messaging`

1. Trouve la ligne `whatsapp_business_messaging` → clique **Request**
2. Remplis le formulaire:

#### Use case description (copie-colle)

```
IMMO PRO-X is a multi-tenant CRM platform for Algerian real estate
agencies. Our tenants (real estate agencies and promoters) use our
platform to manage their property sales pipeline, including client
communications.

Each tenant onboards their own WhatsApp Business Account through
Meta's Embedded Signup flow. Once connected, agents within that
tenant can send approved message templates to their clients for:

1. Appointment confirmations (before property visits)
2. Visit reminders (2 hours before the scheduled visit)
3. Document requests (asking for missing paperwork like ID scans
   or payment proofs)
4. Payment reminders (3 days before installment due dates)
5. Reservation confirmations (when a client reserves a property)
6. Post-visit follow-ups (24 hours after the visit)

All message templates are pre-approved by Meta's review process.
Users (the end clients of our tenant agencies) are informed at
signup that they will receive WhatsApp communications from the
agency, and can unsubscribe at any time.

We use the whatsapp_business_messaging permission to call the
/messages endpoint on behalf of each tenant, using their own
access_token obtained via Embedded Signup.
```

#### How does your app use this permission? (copie-colle)

```
The permission is called from our Supabase Edge Function
"send-whatsapp", which runs server-side with each tenant's
dedicated access_token. The function is invoked by:

1. Automated cron jobs (e.g. check-reminders runs hourly and
   sends visit reminders via approved templates).
2. Manual agent actions (e.g. an agent in the CRM clicks
   "Send visit confirmation" on a client's page).

Every call uses a pre-approved template, never free-form content.
The template name, language, and parameters are stored in our
"whatsapp_templates" database table, synchronized with Meta's
Template Library.

Users opted in to receive these messages by signing up with our
partner real estate agency. Our Privacy Policy at
https://immoprox.io/confidentialite details the communication
consent.
```

#### Video demonstration

- Upload l'URL YouTube unlisted de **Vidéo #1**
- Coche les cases de confirmation

3. Clique **Save** puis **Submit for review**

### 4.3. Demander `whatsapp_business_management`

Même process que 4.2 mais avec ces textes:

#### Use case description (copie-colle)

```
IMMO PRO-X centrally manages WhatsApp Business templates and
tenant configurations through our Super Admin console.

We use the whatsapp_business_management permission to:

1. List and display message templates to platform administrators
   in our /admin/whatsapp page (Templates tab).
2. Create new templates on behalf of the platform when launching
   a new use case (submitted to Meta for approval through the
   standard template workflow).
3. Subscribe our app to each tenant's WABA during the Embedded
   Signup flow, so incoming message webhooks are routed to our
   backend for display in the tenant's shared inbox.
4. Query tenant-level analytics (messages sent, delivery rates,
   template usage) to populate the Tenants tab in our Super Admin
   console.

The permission is never used to modify a tenant's settings
without their explicit action in our UI. All destructive actions
(template deletion, account disconnection) are logged in our
security_audit table for forensic review.
```

#### How does your app use this permission? (copie-colle)

```
Server-side only, via our Supabase Edge Functions:

- "whatsapp-signup" calls /{waba-id}/subscribed_apps when a
  tenant completes Embedded Signup.
- "send-whatsapp" reads template metadata from /{template-id}
  before sending.
- Our Super Admin UI /admin/whatsapp fetches template lists and
  tenant configurations via our backend, never from the client
  side directly.

All calls use the tenant's access_token (for tenant-scoped
actions) or our platform system-user token (for cross-tenant
reads limited to aggregates).
```

#### Video demonstration

- Upload l'URL YouTube unlisted de **Vidéo #2**
- Coche les cases de confirmation

4. Clique **Save** puis **Submit for review**

### 4.4. Sections annexes à remplir

Meta demande aussi dans le processus:

#### Data Use Checkup

- **Purpose:** Business messaging + template management
- **Data categories:** Phone numbers, messages content, delivery status
- **Storage duration:** 2 years for compliance, then anonymized
- **Third-party sharing:** None (all processing is done internally)

#### Platform Usage

- Coche **Cloud API** (pas On-Premises)
- Coche **Direct integration** (pas BSP)

#### Business Use

- **Vertical:** Real Estate / Property
- **Geography:** Algeria (North Africa / MENA)
- **Target users:** Real estate agencies and their property clients

---

## ⏳ ÉTAPE 5 — Pendant l'attente Meta

**Lead time typique: 2-8 semaines.** Meta peut aussi revenir avec des questions ou demander des modifications.

### 5.1. Surveille ta boîte mail et Notifications Meta

- Email du contact admin sur ton Business Manager
- Notifications dans Meta Developers → ton app

### 5.2. Si Meta refuse

Les rejets courants et comment les corriger:

| Raison | Action |
|---|---|
| "Video doesn't show the permission in use" | Réenregistrer la vidéo en montrant clairement où le bouton est cliqué, où le message part, où il arrive |
| "Use case description too vague" | Ajouter des exemples concrets + volume attendu |
| "Missing privacy policy link" | Vérifier que `immoprox.io/confidentialite` est bien accessible publiquement |
| "Screen recording quality too low" | Refaire en 1080p minimum |
| "Business not verified" | Retourner à l'Étape 1 |

Tu peux re-soumettre dès que les corrections sont faites — compteur Meta repart à 2-8 semaines.

### 5.3. Pendant l'attente, construire en parallèle

Dans le plan final qu'on a fait:
- **Phase 2** — je code les templates + le moteur d'automation
- Tu recrutes tes 2-3 tenants pilotes (agences amies)
- On prépare le page tarification sur `immoprox.io`

---

## 🎉 ÉTAPE 6 — Après l'approbation

### 6.1. Basculer l'app en mode production

1. https://developers.facebook.com/apps → ton app IMMO PRO-X
2. En haut: bouton **In development** → clique et switch à **Live**
3. Valide les messages de confirmation

### 6.2. Tester le flow Embedded Signup

- Crée un compte tenant de test
- Va sur `/settings/whatsapp` (à construire en Phase 3)
- Lance le flow → connecte un autre numéro WhatsApp Business
- Vérifie que `whatsapp_accounts` se remplit

### 6.3. Lancer commercialement

- Page tarification `immoprox.io/tarifs` devient publique
- Mail aux 2-3 tenants pilotes pour démarrer leur onboarding Pro

---

## 📞 Contacts de support

| Besoin | Où |
|---|---|
| Question technique Meta API | https://developers.facebook.com/community |
| Problème App Review | https://business.facebook.com/help → Contact Support |
| Urgence compte Business | 1 (650) 308-7300 (anglais uniquement) |

---

## ✅ Checklist finale — avant de cliquer "Submit"

Relis cette liste une dernière fois:

- [ ] Business Verified ✅
- [ ] Display Name approved (pas encore "Test Number")
- [ ] System User token permanent créé et stocké dans Supabase
- [ ] Vidéo #1 enregistrée, uploadée YouTube unlisted
- [ ] Vidéo #2 enregistrée, uploadée YouTube unlisted
- [ ] Use case descriptions copiées-collées pour les 2 permissions
- [ ] Privacy Policy accessible: https://immoprox.io/confidentialite
- [ ] Terms accessible: https://immoprox.io/cgu
- [ ] Tested the WhatsApp flow one last time on your test account

Clique **Submit for review** → l'horloge démarre.

---

## 📊 État actuel de l'intégration (pour info reviewer)

Au moment de la soumission, IMMO PRO-X a déjà en production:

- Edge Function `notify-lead-whatsapp` qui envoie des notifications au founder (test recipient) à chaque nouveau lead — preuve que l'intégration messaging fonctionne
- Edge Function `send-whatsapp` qui envoie via approved templates on behalf d'un tenant (code prêt, waiting for App Review pour activer)
- Edge Function `whatsapp-signup` qui gère le callback Embedded Signup (code prêt)
- Tables `whatsapp_config`, `whatsapp_accounts`, `whatsapp_messages`, `whatsapp_templates` (migration 016)
- Super Admin UI `/admin/whatsapp` pour la gestion plateforme (4 tabs)
- Double-ping notification system pour les leads (template + libre)
- Sécurité DB-level (migration 017) qui protège les tokens tenants

Si un reviewer Meta veut inspecter le code: le repo github est `kardahmed/immoproxv2f`.

---

**Bonne chance avec l'App Review ! Garde ce fichier ouvert pendant que tu fais la soumission.** 🚀
