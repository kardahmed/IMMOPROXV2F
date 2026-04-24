# 📋 Catalogue Templates WhatsApp — IMMO PRO-X

**10 templates Utility** prêts à copier-coller dans Meta Business Manager. Chaque template est compatible à 100% avec:
- ✅ **L'API WhatsApp Cloud** (contraintes format respectées)
- ✅ **Le data model IMMO PRO-X** (variables mappées sur les champs existants du CRM)

## ⚠️ Règles anti-Marketing (CRITIQUE — respecter absolument)

Pour que Meta garde la catégorie **Utility** et pas **Marketing**:

- ❌ Pas de **CTA urgent** ("contactez-nous maintenant", "répondez avant...", "offre limitée")
- ❌ Pas de **langage promotionnel** ("opportunité", "offre", "promo", "spécial", "exclusif")
- ❌ Pas d'**emojis promotionnels** (🔥 ⚡ 💰 🎁 🎉 🏆 💎)
- ✅ **Ton factuel** — "Nous vous confirmons...", "Nous avons reçu..."
- ✅ **Emojis neutres autorisés** — 👤 📧 📱 📞 🏠 📍 🏢 💬 📅 🕐 📄 📎 🏦

## 📏 Contraintes WhatsApp API

- Nom template: `a-z`, `0-9`, `_` uniquement (pas de majuscule, tiret, accent)
- Header texte: max **60 caractères**
- Body: max **1024 caractères**
- Footer: max **60 caractères**
- Variables: **max 10** par body, numérotées `{{1}}` à `{{10}}`
- Chaque variable doit avoir un **sample** (sinon rejet Meta automatique)

## 📌 Ordre de soumission recommandé

Soumet dans cet ordre (business priority). Tu peux en soumettre plusieurs en parallèle (chaque review = 1-24h indépendamment).

---

# 1. Template: `visite_confirmation_j_moins_1`

**Quand:** la veille d'une visite planifiée dans le CRM.

**Mapping data:** `visits.scheduled_at` + `projects.address` + `users` (agent)

### Template que je te propose (pure Utilitaire)

**Nom:** `visite_confirmation_j_moins_1`
**Catégorie:** Utility
**Langue:** French
**Titre (header):** `Confirmation de visite`
**Corps:**
```
Bonjour {{1}},

Nous vous confirmons votre visite prevue le {{2}} a {{3}}.

📍 Adresse : {{4}}
👤 Conseiller : {{5}}

En cas d'empechement, contactez votre conseiller.
```

**Pied de page (footer):** `IMMO PRO-X`

### Samples pour Meta (obligatoires)

- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `mardi 26 mai 2026`
- `{{3}}` = `14h00`
- `{{4}}` = `Projet Oran Plage, Bt B, Lot A-23`
- `{{5}}` = `Ali Ahmed - 0555 11 22 33`

---

# 2. Template: `visite_rappel_h_moins_2`

**Quand:** 2 heures avant la visite (cron `check-reminders`).

**Mapping data:** `visits.scheduled_at` + `projects.address` + `users`

### Template que je te propose (pure Utilitaire)

**Nom:** `visite_rappel_h_moins_2`
**Catégorie:** Utility
**Langue:** French
**Titre (header):** `Rappel visite`
**Corps:**
```
Bonjour {{1}},

Votre visite est prevue dans 2 heures, a {{2}}.

📍 Adresse : {{3}}
👤 Conseiller : {{4}}
```

**Pied de page (footer):** `IMMO PRO-X`

### Samples pour Meta (obligatoires)

- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `14h00`
- `{{3}}` = `Projet Oran Plage, Bt B, Lot A-23`
- `{{4}}` = `Ali Ahmed - 0555 11 22 33`

---

# 3. Template: `visite_annulation`

**Quand:** un visit passe au statut `cancelled` dans `visits.status`.

**Mapping data:** `visits.scheduled_at` + `visits.notes` (motif) + `users`

### Template que je te propose (pure Utilitaire)

**Nom:** `visite_annulation`
**Catégorie:** Utility
**Langue:** French
**Titre (header):** `Annulation de visite`
**Corps:**
```
Bonjour {{1}},

Votre visite du {{2}} a {{3}} a ete annulee.

Motif : {{4}}
Votre conseiller {{5}} vous recontactera pour reporter.
```

**Pied de page (footer):** `IMMO PRO-X`

### Samples pour Meta (obligatoires)

- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `mardi 26 mai 2026`
- `{{3}}` = `14h00`
- `{{4}}` = `Conseiller indisponible`
- `{{5}}` = `Ali Ahmed - 0555 11 22 33`

---

# 4. Template: `document_demande`

**Quand:** l'agent ajoute un item dans la liste de docs à fournir (UI `/dossiers`).

**Mapping data:** concaténation des documents manquants + `users` (agent)

### Template que je te propose (pure Utilitaire)

**Nom:** `document_demande`
**Catégorie:** Utility
**Langue:** French
**Titre (header):** `Documents requis`
**Corps:**
```
Bonjour {{1}},

Pour completer votre dossier, merci de transmettre les documents suivants :

📄 {{2}}

👤 Contact : {{3}}
```

**Pied de page (footer):** `IMMO PRO-X`

### Samples pour Meta (obligatoires)

- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `Piece d'identite, fiche de paie des 3 derniers mois`
- `{{3}}` = `Ali Ahmed - ali@batiplan.dz`

---

# 5. Template: `document_recu`

**Quand:** l'agent marque un document comme reçu dans le CRM.

**Mapping data:** `documents.name` + `documents.created_at` + `users`

### Template que je te propose (pure Utilitaire)

**Nom:** `document_recu`
**Catégorie:** Utility
**Langue:** French
**Titre (header):** `Documents recus`
**Corps:**
```
Bonjour {{1}},

Nous avons bien recu vos documents : 

📎 {{2}}

📅 Date de reception : {{3}}
Votre dossier est en cours de traitement.

👤 Conseiller : {{4}}
```

**Pied de page (footer):** `IMMO PRO-X`

### Samples pour Meta (obligatoires)

- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `Piece d'identite, fiche de paie`
- `{{3}}` = `24 avril 2026`
- `{{4}}` = `Ali Ahmed - ali@batiplan.dz`

---

# 6. Template: `document_rappel_manquant`

**Quand:** un doc reste manquant après X jours (cron `check-reminders`).

**Mapping data:** concaténation docs manquants + deadline calculée

### Template que je te propose (pure Utilitaire)

**Nom:** `document_rappel_manquant`
**Catégorie:** Utility
**Langue:** French
**Titre (header):** `Rappel documents`
**Corps:**
```
Bonjour {{1}},

Les documents suivants sont toujours en attente pour votre dossier :

📄 {{2}}

📅 Date limite : {{3}}
👤 Conseiller : {{4}}
```

**Pied de page (footer):** `IMMO PRO-X`

### Samples pour Meta (obligatoires)

- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `Fiche de paie du mois dernier`
- `{{3}}` = `30 avril 2026`
- `{{4}}` = `Ali Ahmed - 0555 11 22 33`

---

# 7. Template: `paiement_echeance_j_moins_3`

**Quand:** 3 jours avant `payment_schedules.due_date` (cron `check-payments`).

**Mapping data:** `payment_schedules.amount` + `due_date` + dossier ref + RIB tenant

### Template que je te propose (pure Utilitaire)

**Nom:** `paiement_echeance_j_moins_3`
**Catégorie:** Utility
**Langue:** French
**Titre (header):** `Rappel d'echeance`
**Corps:**
```
Bonjour {{1}},

Une echeance de {{2}} DZD est prevue le {{3}}.

📎 Reference dossier : {{4}}
🏦 RIB pour virement : {{5}}

Contactez votre conseiller pour toute question.
```

**Pied de page (footer):** `IMMO PRO-X`

### Samples pour Meta (obligatoires)

- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `500 000`
- `{{3}}` = `27 avril 2026`
- `{{4}}` = `DOS-2026-A47`
- `{{5}}` = `BEA 00025401234567890 Batiplan Promotion`

---

# 8. Template: `paiement_recu`

**Quand:** l'agent marque une échéance `paid` (`payment_schedules.status = 'paid'`).

**Mapping data:** `payment_schedules.amount` + date + référence + solde restant

### Template que je te propose (pure Utilitaire)

**Nom:** `paiement_recu`
**Catégorie:** Utility
**Langue:** French
**Titre (header):** `Paiement recu`
**Corps:**
```
Bonjour {{1}},

Nous accusons reception de votre paiement de {{2}} DZD le {{3}}.

📎 Reference : {{4}}
📊 Solde restant : {{5}} DZD

👤 Conseiller : {{6}}
```

**Pied de page (footer):** `IMMO PRO-X`

### Samples pour Meta (obligatoires)

- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `500 000`
- `{{3}}` = `24 avril 2026`
- `{{4}}` = `PAY-2026-00142`
- `{{5}}` = `4 500 000`
- `{{6}}` = `Ali Ahmed - ali@batiplan.dz`

---

# 9. Template: `paiement_retard`

**Quand:** J+1 après une échéance non payée (cron `check-payments`).

**Mapping data:** `payment_schedules.due_date` + `amount` + dossier ref + agent

### Template que je te propose (pure Utilitaire)

**Nom:** `paiement_retard`
**Catégorie:** Utility
**Langue:** French
**Titre (header):** `Notification d'impaye`
**Corps:**
```
Bonjour {{1}},

L'echeance du {{2}} ({{3}} DZD) n'a pas ete reglee a ce jour.

📎 Reference dossier : {{4}}
👤 Contactez votre conseiller : {{5}}
```

**Pied de page (footer):** `IMMO PRO-X`

### Samples pour Meta (obligatoires)

- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `24 avril 2026`
- `{{3}}` = `500 000`
- `{{4}}` = `DOS-2026-A47`
- `{{5}}` = `Ali Ahmed - 0555 11 22 33`

---

# 10. Template: `reservation_confirmation`

**Quand:** une réservation passe `active` (`reservations.status = 'active'`).

**Mapping data:** `units.code` + `projects.name` + `reservations.created_at` + agent

### Template que je te propose (pure Utilitaire)

**Nom:** `reservation_confirmation`
**Catégorie:** Utility
**Langue:** French
**Titre (header):** `Confirmation de reservation`
**Corps:**
```
Bonjour {{1}},

Votre reservation a ete enregistree.

🏠 Bien : {{2}} (Lot {{3}})
🏢 Projet : {{4}}
📅 Date : {{5}}
👤 Conseiller : {{6}}
```

**Pied de page (footer):** `IMMO PRO-X`

### Samples pour Meta (obligatoires)

- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `Appartement F4`
- `{{3}}` = `A-23`
- `{{4}}` = `Projet Oran Plage`
- `{{5}}` = `24 avril 2026`
- `{{6}}` = `Ali Ahmed - 0555 11 22 33`

---

## 🎯 Procédure de soumission (rappel)

Pour chaque template ci-dessus:

1. Va sur: https://business.facebook.com/wa/manage/message-templates/
2. Clique **Créer un modèle** (bouton bleu en haut à droite)
3. **Catégorie:** sélectionne **Utility** (même si Meta propose Marketing, force Utility)
4. **Nom:** copie exactement le nom (ex: `visite_confirmation_j_moins_1`)
5. **Langue:** `French`
6. **Titre (header):** copie le texte du header (simple texte, pas de variable)
7. **Corps:** copie le body complet avec emojis et `{{X}}`
8. **Pied de page (footer):** `IMMO PRO-X`
9. **Samples de variables:** rempli CHAQUE `{{X}}` avec le sample correspondant (IMPORTANT — Meta rejette si vide)
10. Clique **Soumettre à examen**
11. Attends l'email Meta d'approbation (1-24h en général)

### Astuce batch

Tu peux soumettre les 10 en parallèle — pas besoin d'attendre la validation du précédent. Chaque review est indépendante.

Ordre malin:
1. **Maintenant:** les 3 `visite_*` (priorité business)
2. **Dans 10 min:** les 3 `document_*`
3. **Dans 20 min:** les 3 `paiement_*` + `reservation_confirmation`

Ça étale la charge mentale sans bloquer la parallélisation Meta.

## ✅ Une fois tous approuvés

1. Le secret `META_WHATSAPP_TEMPLATE_NAME` reste sur le template founder (`nouveau_lead__immo_prox`) — ces nouveaux templates sont pour le **plan Pro** (automation vers les clients des agences)
2. Tous les templates apparaîtront dans la table `whatsapp_templates` (à synchroniser via une migration seed ou l'admin UI `/admin/whatsapp` onglet Templates)
3. Le futur helper `dispatchAutomation()` (Phase 2 en cours de dev de mon côté) va choisir le bon template selon l'événement déclencheur et remplir les variables avec les données du CRM

## 🧭 Planning recommandé

| Tâche | Qui | Timing |
|---|---|---|
| Soumettre 10 templates à Meta | Toi | Maintenant (par batch de 3) |
| Code moteur `dispatchAutomation` | Moi | Pendant la review Meta |
| Attendre review Meta | — | 1-24h par template |
| Sync `whatsapp_templates` table | Moi + toi | Dès email Meta d'approbation |
| Test flow end-to-end | Ensemble | Quand tout approuvé |

## 📐 Notes de compatibilité

### Variables CRM → Template mapping

Chaque `{{X}}` est pré-mappé sur un champ existant du data model. Quand on codera `dispatchAutomation()`, on injectera automatiquement:

| Template var | Champ CRM |
|---|---|
| Nom client | `clients.full_name` |
| Date/heure visite | `visits.scheduled_at` (formaté `dd MMM yyyy HH:mm`) |
| Adresse | `projects.address` + `units.code` |
| Conseiller | `users.first_name + users.last_name + users.phone` |
| Doc manquants | calculé depuis `documents` pending |
| Montant | `payment_schedules.amount` (formaté `X XXX XXX`) |
| Date échéance | `payment_schedules.due_date` (formaté) |
| Réf dossier | généré depuis `sales.id` ou `reservations.id` |
| RIB tenant | `tenant_settings.bank_rib` (à ajouter) |

### Contraintes respectées

| Contrainte Meta | Notre template |
|---|---|
| Nom: `a-z 0-9 _` | ✅ |
| Header ≤ 60 car | ✅ (tous ≤ 30) |
| Body ≤ 1024 car | ✅ (tous ≤ 400) |
| Footer ≤ 60 car | ✅ (IMMO PRO-X = 11) |
| Samples obligatoires | ✅ (fournis) |
| Pas de CTA marketing | ✅ (ton factuel) |
| Emojis neutres | ✅ (👤📧📱📞🏠📍🏢💬📅🕐📄📎🏦 uniquement) |
