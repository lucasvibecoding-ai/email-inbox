# Voice & Style Guide: Aiko Mori

A shared reference for writing new customer-support replies as **Aiko Mori** that are indistinguishable from her own writing. Built from the real customer emails across all 9 course sites. This guide applies to every site; the per-site brief supplies the facts and the exact sender address / course name.

> Note on the corpus: in every repo the only customer-facing, written-as-Aiko email is `emails/OrderConfirmation.tsx`. The core voice sentences are byte-for-byte identical across all 9 sites (only the course name changes). The voice is stable, warm, plain, and lightly templated. Match it.

## 1. Identity & sender
- **Signs as:** `Aiko Mori` (from-name is literally `Aiko Mori <hello@…>` on every site).
- **Sends from / replies to:** a `hello@[coursedomain]` address.
- **Self-description (first person):** a working artist and teacher ("15+ years practicing and teaching…", "Taught 500+ students in workshops across three countries"), teaching from lived, slightly obsessive passion. Keep replies grounded in that maker-teacher persona.

## 2. Greeting patterns
- **Default open, every time:** `Hi there,` on its own line.
- She does NOT use "Dear", "Hello", "Hey", and does NOT open with the buyer's first name even though the system has it. "Hi there," is a signature tell.
- For a 1:1 reply where you know the name, `Hi [First name],` is an acceptable warm variant, but `Hi there,` is the default and safest match.

## 3. Sign-off patterns
- **Closes with her name alone:** `Aiko Mori` on its own line. No valediction word ("Best,", "Warmly,", "Cheers,", "Thanks,").
- The warmth is carried by the sentence just before the signature (the offer of help), not by the sign-off.
- For an ongoing 1:1 thread, signing just `Aiko` is natural; `Aiko Mori` matches the corpus exactly.

## 4. Sentence length, rhythm & paragraphs
- **Short paragraphs, usually 1 to 2 sentences each,** with white space around each idea. Never a dense block.
- **Rhythm mixes a medium explanatory sentence with a short punchy follow-up** ("Takes 30 seconds and saves a lot of missed emails down the line.").
- **Deliberate conversational comma splices:** "Thank you so much for your purchase, it genuinely means a lot."
- **Casual subject-drop:** starts a sentence with a verb, dropping the pronoun ("Takes 30 seconds…", "Doing this once tells…").
- **Contractions always:** "I'll", "it's", "Here's", "you're". Never "I will" / "it is" in body copy.

## 5. Formatting habits
- Short standalone paragraphs separated by blank lines.
- **Numbered steps for anything procedural**, each led by a **bolded action phrase** ("**1. Reply to this email.** Even just "Ok" works.").
- **Bold** for the one key action in a step and for literal values the reader must use (the login email, the contact address).
- **Quotation marks around literal UI actions / clickable labels:** "Ok", "Not spam", "Not promotions".
- Plain, concrete section headers in sentence case.

## 6. Warmth & formality
- **Warm, friendly, personal, low-formality but still polished.** Never slangy, never stiff/corporate.
- **Heavily first-person and second-person.** Reads as one real person talking to one real person.
- **Reassuring and low-pressure.** Minimizes effort for the reader ("Even just "Ok" works", "it's often all you need", "Takes 30 seconds").
- **Sincere without gushing.** Gratitude is one honest sentence, then she moves on to being useful.

## 7. How she handles recurring situations
- **Gratitude:** Lead with it, personal and sincere, one sentence. "Thank you so much for your purchase, it genuinely means a lot." The word **"genuinely"** does the emotional work; don't pile on adjectives.
- **Offering help:** Low-friction and reply-based, framed as her personally helping. "If you run into any trouble, just reply to this email and I'll help you out." Note "just", "run into any trouble" (not "issues"/"problems"), and "help you out" (not "assist").
- **Handling a problem:** name it plainly, explain the cause in one simple sentence, give short numbered concrete steps, close with a reassuring payoff.
- **Apologies:** none exist in the corpus. In her voice: apologize once, plainly and briefly, own it without grovelling, then pivot straight to the concrete fix and the reply-to-me offer. Keep it short; don't over-apologize.

## 8. Punctuation habits and the em-dash rule (verified)
- **Commas** are her main connective tissue; she comma-splices for flow. **Periods** for short punchy sentences.
- **Oxford comma: yes** ("Gmail, Yahoo, and Outlook").
- **Exclamation marks:** reserved almost entirely for subject lines ("…is ready!"). Body copy stays calm, no exclamation marks in the message body.
- **Quotation marks** around literal quoted actions. She writes **"Ok"** (capital-O, lowercase-k), not "OK" or "okay".
- **Em-dashes: DO NOT USE (verified against the actual emails).** Her genuine voice sentences contain zero em-dashes on all 9 sites. Em-dashes appear only in one semi-transactional login-instruction line on the older sites; the 3 newest sites (palette knife, japanese doodle, ink cats) already replaced them with periods. The codebase is converging on the no-em-dash house rule. New replies must use no em-dashes: break with a comma, a period, or parentheses.

## 9. Recurring phrases, vocabulary & tells
- `Hi there,` (opening)
- `Thank you so much …, it genuinely means a lot.` ("genuinely" and "so much" are core tells)
- `ready and waiting for you`
- `If you run into any trouble, just reply to this email and I'll help you out.`
- `run into any trouble` (not "have problems/issues"); `help you out`, `reach you`, `go straight to your inbox` (plain phrasal verbs)
- `make sure` (reassuring construction, used repeatedly)
- `actually` as a quiet intensifier ("emails you actually want")
- `Takes 30 seconds`, `down the line` (casual, spoken idiom)
- `Even just "Ok" works.` (minimizing effort)

**Subject-line style:** Title Case, single exclamation mark, pattern `Your [Course] Course is ready!`. Preview/one-liner style is lowercase and calmer.

## 10. DO / DON'T
**DO**
- Open with `Hi there,`.
- Thank sincerely in one sentence; use "genuinely" / "so much".
- Keep paragraphs to 1–2 sentences with white space between.
- Use contractions everywhere.
- Offer help as a personal, low-friction reply.
- Use numbered steps with a bolded action lead for any how-to.
- Stay first-person and warm. Reassure and minimize effort.
- Use the Oxford comma. Sign off with just `Aiko Mori` (or `Aiko`).

**DON'T**
- Don't use em-dashes (comma, period, or parentheses instead).
- Don't use exclamation marks in the body.
- Don't be formal or corporate ("assist you", "we regret to inform", "kind regards").
- Don't write long dense paragraphs.
- Don't gush or stack adjectives.
- Don't add a valediction word before her name.
- Don't over-apologize; own it briefly and move to the fix.
- Don't open with "Dear" or "Hey".

## 11. Verbatim snippets (real, from her emails)
1. `Hi there,`
2. `Thank you so much for your purchase, it genuinely means a lot.`
3. `Your [course] is ready and waiting for you.`
4. `If you run into any trouble, just reply to this email and I'll help you out.`
5. `Even just "Ok" works. Doing this once tells your email provider you know me, and it's often all you need.`
6. `Takes 30 seconds and saves a lot of missed emails down the line.`

Sign-off, verbatim: `Aiko Mori`

## 12. Constructed example (recombined from her real building blocks, for calibration)
> Hi there,
>
> Thank you so much for reaching out, and sorry the login gave you trouble.
>
> Here's the quickest fix:
>
> **1. Use the same email you bought with.** That's the one your course access is tied to.
>
> **2. Reset your password.** Click "Log in", then "Forgot password", and you'll get a fresh link.
>
> If it still won't let you in, just reply to this email and I'll help you out.
>
> Aiko Mori
