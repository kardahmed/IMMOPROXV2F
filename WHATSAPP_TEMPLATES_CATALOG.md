# 📋 Catalogue Templates WhatsApp — IMMO PRO-X

Les **10 templates critiques** qui couvrent le cycle de vie complet d'un client immobilier. À soumettre à Meta **tous en catégorie Utility** pour éviter le piège de la re-catégorisation en Marketing (comme ce qui s'est passé avec l'ancien `new_lead_notification`).

## ⚠️ Règles anti-Marketing (à respecter ABSOLUMENT)

Pour que Meta garde la catégorie Utility:

- ❌ Pas de **CTA urgent** ("contactez-nous maintenant", "répondez avant...", "offre limitée")
- ❌ Pas de **langage promotionnel** ("opportunité", "offre", "promo", "spécial", "exclusif")
- ❌ Pas d'**incitation à l'achat** ("achetez", "réservez maintenant", "profitez")
- ❌ Pas d'**emojis promotionnels** (🔥, ⚡, 💰, 🎁)
- ✅ **Ton factuel** — "Nous vous confirmons...", "Nous avons reçu...", "Votre visite est prévue..."
- ✅ **Mentionner le conseiller** pour les questions → montre que c'est transactionnel
- ✅ **Dates, montants, références** — données concrètes = utility claire

## 📌 Ordre de soumission recommandé

Soumet dans cet ordre (priorité business). Chaque template prend **1-24h** en review Meta, tu peux les soumettre tous en parallèle.

---

# 1. `visite_confirmation_j_moins_1`

**Quand:** la veille d'une visite planifiée.
**Catégorie:** `Utility`
**Langue:** `French`

**En-tête (optionnel):** `Confirmation de visite`

**Corps:**
```
Bonjour {{1}},

Nous vous confirmons votre visite prevue le {{2}} a {{3}}.

Adresse : {{4}}
Conseiller : {{5}}

En cas d'empechement, contactez votre conseiller.
```

**Pied de page:** `IMMO PRO-X`

**Exemples de variables (pour la review Meta):**
- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `mardi 24 mai 2026`
- `{{3}}` = `14h00`
- `{{4}}` = `Projet Oran Plage, Bt B, Lot A-23`
- `{{5}}` = `Ali Ahmed - 0555 11 22 33`

---

# 2. `visite_rappel_h_moins_2`

**Quand:** 2 heures avant la visite.
**Catégorie:** `Utility`
**Langue:** `French`

**En-tête:** `Rappel visite`

**Corps:**
```
Bonjour {{1}},

Votre visite est prevue dans 2 heures, a {{2}}.

Adresse : {{3}}
Conseiller : {{4}}
```

**Pied de page:** `IMMO PRO-X`

**Exemples:**
- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `14h00`
- `{{3}}` = `Projet Oran Plage, Bt B, Lot A-23`
- `{{4}}` = `Ali Ahmed - 0555 11 22 33`

---

# 3. `visite_annulation`

**Quand:** annulation d'une visite (manuel ou auto).
**Catégorie:** `Utility`
**Langue:** `French`

**En-tête:** `Annulation de visite`

**Corps:**
```
Bonjour {{1}},

Votre visite du {{2}} a {{3}} a ete annulee.

Motif : {{4}}
Votre conseiller {{5}} vous recontactera pour reporter.
```

**Pied de page:** `IMMO PRO-X`

**Exemples:**
- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `mardi 24 mai 2026`
- `{{3}}` = `14h00`
- `{{4}}` = `Conseiller indisponible`
- `{{5}}` = `Ali Ahmed - 0555 11 22 33`

---

# 4. `document_demande`

**Quand:** liste des documents manquants pour compléter le dossier.
**Catégorie:** `Utility`
**Langue:** `French`

**En-tête:** `Documents requis`

**Corps:**
```
Bonjour {{1}},

Pour completer votre dossier, merci de transmettre les documents suivants :

{{2}}

Contact : {{3}}
```

**Pied de page:** `IMMO PRO-X`

**Exemples:**
- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `Piece d'identite, fiche de paie des 3 derniers mois`
- `{{3}}` = `Ali Ahmed - ali@batiplan.dz`

---

# 5. `document_recu`

**Quand:** confirmation que les documents ont bien été reçus.
**Catégorie:** `Utility`
**Langue:** `French`

**En-tête:** `Documents recus`

**Corps:**
```
Bonjour {{1}},

Nous avons bien recu vos documents : {{2}}

Date de reception : {{3}}
Votre dossier est en cours de traitement.

Conseiller : {{4}}
```

**Pied de page:** `IMMO PRO-X`

**Exemples:**
- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `Piece d'identite, fiche de paie`
- `{{3}}` = `24 avril 2026`
- `{{4}}` = `Ali Ahmed - ali@batiplan.dz`

---

# 6. `document_rappel_manquant`

**Quand:** relance pour documents toujours manquants.
**Catégorie:** `Utility`
**Langue:** `French`

**En-tête:** `Rappel documents`

**Corps:**
```
Bonjour {{1}},

Les documents suivants sont toujours en attente pour votre dossier :

{{2}}

Date limite : {{3}}
Conseiller : {{4}}
```

**Pied de page:** `IMMO PRO-X`

**Exemples:**
- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `Fiche de paie du mois dernier`
- `{{3}}` = `30 avril 2026`
- `{{4}}` = `Ali Ahmed - 0555 11 22 33`

---

# 7. `paiement_echeance_j_moins_3`

**Quand:** 3 jours avant échéance d'un paiement.
**Catégorie:** `Utility`
**Langue:** `French`

**En-tête:** `Rappel d'echeance`

**Corps:**
```
Bonjour {{1}},

Une echeance de {{2}} DZD est prevue le {{3}}.

Reference dossier : {{4}}
RIB pour virement : {{5}}

Contactez votre conseiller pour toute question.
```

**Pied de page:** `IMMO PRO-X`

**Exemples:**
- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `500 000`
- `{{3}}` = `27 avril 2026`
- `{{4}}` = `DOS-2026-A47`
- `{{5}}` = `BEA 00025401234567890 Batiplan Promotion`

---

# 8. `paiement_recu`

**Quand:** confirmation d'un paiement reçu.
**Catégorie:** `Utility`
**Langue:** `French`

**En-tête:** `Paiement recu`

**Corps:**
```
Bonjour {{1}},

Nous accusons reception de votre paiement de {{2}} DZD le {{3}}.

Reference : {{4}}
Solde restant : {{5}} DZD

Conseiller : {{6}}
```

**Pied de page:** `IMMO PRO-X`

**Exemples:**
- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `500 000`
- `{{3}}` = `24 avril 2026`
- `{{4}}` = `PAY-2026-00142`
- `{{5}}` = `4 500 000`
- `{{6}}` = `Ali Ahmed - ali@batiplan.dz`

---

# 9. `paiement_retard`

**Quand:** impayé détecté (J+1 après échéance non réglée).
**Catégorie:** `Utility`
**Langue:** `French`

**En-tête:** `Notification d'impaye`

**Corps:**
```
Bonjour {{1}},

L'echeance du {{2}} ({{3}} DZD) n'a pas ete reglee a ce jour.

Reference dossier : {{4}}
Contactez votre conseiller : {{5}}
```

**Pied de page:** `IMMO PRO-X`

**Exemples:**
- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `24 avril 2026`
- `{{3}}` = `500 000`
- `{{4}}` = `DOS-2026-A47`
- `{{5}}` = `Ali Ahmed - 0555 11 22 33`

---

# 10. `reservation_confirmation`

**Quand:** une réservation est validée dans le CRM.
**Catégorie:** `Utility`
**Langue:** `French`

**En-tête:** `Confirmation de reservation`

**Corps:**
```
Bonjour {{1}},

Votre reservation a ete enregistree.

Bien : {{2}} (Lot {{3}})
Projet : {{4}}
Date : {{5}}
Conseiller : {{6}}
```

**Pied de page:** `IMMO PRO-X`

**Exemples:**
- `{{1}}` = `Youcef Mansouri`
- `{{2}}` = `Appartement F4`
- `{{3}}` = `A-23`
- `{{4}}` = `Projet Oran Plage`
- `{{5}}` = `24 avril 2026`
- `{{6}}` = `Ali Ahmed - 0555 11 22 33`

---

## 🎯 Comment soumettre chaque template

Pour chacun des 10 templates ci-dessus:

1. Va sur: https://business.facebook.com/wa/manage/message-templates/
2. Clique **Créer un modèle** (bouton bleu en haut à droite)
3. **Catégorie:** sélectionne **Utility** (ne pas laisser "Marketing" même si Meta le propose)
4. **Nom:** copie le nom du template (ex: `visite_confirmation_j_moins_1`)
5. **Langue:** `French`
6. **En-tête:** copie l'en-tête (texte simple)
7. **Corps:** copie le body du template (avec les `{{X}}`)
8. **Pied de page:** `IMMO PRO-X`
9. **Exemples de variables:** remplis CHAQUE variable avec l'exemple fourni (IMPORTANT — Meta rejette sans)
10. Clique **Soumettre à examen**
11. Attends l'email de Meta (1-24h, souvent < 1h pour Utility clair)

### Astuce soumission en batch

Au lieu de faire les 10 en une fois (fatiguant), tu peux:
1. Créer les 3 plus urgents (visite) maintenant → soumet
2. Créer les 3 suivants (dossier) dans 30 min → soumet
3. Créer les 3 suivants (paiement) demain matin → soumet
4. Créer le dernier (reservation) dans la foulée

Ça étale la charge mentale.

## ✅ Une fois les 10 templates approuvés

Tous les templates apparaitront dans la table `whatsapp_templates` (à synchroniser manuellement pour l'instant — on automatisera ça en Phase 2).

Puis on code le **moteur d'automation** qui:
- Lit les événements du CRM (visite créée, dossier incomplet, paiement reçu, etc.)
- Matche l'événement avec le bon template
- Remplit les variables avec les vraies données client
- Envoie via `send-whatsapp` Edge Function

À ce moment-là, IMMO PRO-X devient une **machine qui travaille toute seule** pour l'agence. C'est le game-changer de la proposition de valeur "Pro".

## 🧭 Planning recommandé

| Tâche | Qui | Timing |
|---|---|---|
| Soumettre 10 templates à Meta | Toi | Maintenant (par batch) |
| Code moteur `dispatchAutomation` | Moi | Pendant la review Meta |
| Attendre review Meta | — | 1-24h par template |
| Update `whatsapp_templates` avec les approuvés | Toi | Dès email Meta |
| Tester flow complet end-to-end | Ensemble | Quand tout approuvé |

## Notes techniques

### Pourquoi les noms avec underscores et pas avec tirets ?
Meta accepte uniquement `a-z`, `0-9` et `_` dans les noms de templates. Pas de tirets, pas d'accents, pas de majuscules.

### Pourquoi pas de tutoiement (tu/ton/toi) ?
Format "vous" pro et respectueux. Évite les ambiguïtés de traduction et reste adapté au business B2B/B2C en Algérie.

### Pourquoi tous les templates mentionnent le conseiller ?
Ça renforce le côté **transactionnel** (il y a une vraie personne derrière) et **évite la re-catégorisation en Marketing** (Meta lit les templates comme un humain — un message automatique sans interlocuteur ressemble à du marketing de masse, un message qui pointe vers un conseiller identifié = utility métier).
