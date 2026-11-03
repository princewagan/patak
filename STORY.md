# PATAK — story and structure

*Patak* means a drop. A small act feels like one drop: it doesn't stop the flood, so why bother? That's
"ganyan talaga." But *patak-patak* is also how Filipinos chip in. Drops add up only if they keep falling.

**Built on Prince's point.** We say "ganyan talaga" because we feel our small actions make no difference,
so helping and not helping seem to end up the same. The game lets Sir feel that logic first, then
breaks it with our real flood day. Help can look small and the happiness it brings can look temporary,
and it still matters. Doing it once isn't enough. What changes lives is doing it again and again, even
when we never see the result.

Runtime target: about 6 minutes of play. Style: cinematic, in the spirit of Until Dawn / The Dark Pictures
(no chapter screens: a quiet place-and-time stamp as each scene fades in; letterbox, subtitles, two-option choices, and a timer on every choice: if time runs out he did nothing, which counts as not helping). A soft piano score (`src/engine/music.js`) runs under the night, the "ganyan talaga" lines, the house, Part Four and the ending.

**The "patak" marker** (our version of Until Dawn's butterfly): when a choice affects someone, a drop
falls in the corner with that person's name and how they're doing now. People react on screen: help
means relief or a smile, "ganyan talaga" means they look away, sign, or walk off.

---

## PART ONE: IKAW (you)
First-person. Sir never sees "himself." He *is* the character. An invented but ordinary Filipino day.

**Opening: Martes, 5:30 AM, your room.** The alarm goes off. The camera finds your crew shirt on the wall: IKAW, 22, service crew in Cubao, and a CONTRACTUAL stamp (renewal is decided next week). Then ₱100, ₱50 and ₱10 land on the bed as the wallet counts up to ₱160, and the days run from Tuesday to Friday's payday. You count what's left in this same room that night.

Every choice costs him something real. Helping is never free here. The "no" option always carries the reason a real person would give ("Sindikato naman 'yan"), because in real life nobody picks "ignore." We justify it.

### Chapter 1: SOBRE (envelope) · Jeep sa Aurora Blvd · 6:42 AM
- Packed jeep, drizzle. His phone buzzes with a scam text ("Nanalo ang number mo ng ₱25,000…"). He swipes it away. *(texture: online scams)*
- A barefoot boy climbs in at a stop, crouches, wipes passengers' shoes with a rag, then leaves a small envelope on every lap. Pencil on his: *"Pang-kain lang po. Salamat po."*
- The ale beside him, low: **"'Wag mong bigyan. Sindikato 'yan."**
- **CHOICE (10s timer; the boy is collecting the envelopes):**
  - **Lagyan ng bente** → the boy peeks inside and gives a small smile. "Salamat po, kuya." He hops off. *Patak: Totoy, napangiti.* (₱140 left)
  - **Ibalik: "Sindikato naman 'yan"** → he takes it without looking at you and drops off into the rain. *Patak: Totoy, hindi ka na tiningnan.*
  - *(Timer runs out → same as empty. Not choosing is a choice.)*

### Chapter 2: KAHA (the register) · Fast food, Cubao · 2:15 PM
- After the lunch rush, Ma'am Joy (manager) counts Ate Weng's register: **₱500 short.**
- Ate Weng: 40s, cashier, single mom, contractual like you. "Ma'am, hindi ko po alam kung saan napunta…"
- Ma'am Joy: **"Alam mo naman ang rule. Kulang sa kaha, kaltas sa sahod."**
- You know what happened: earlier, Ma'am Joy herself approved a ₱500 refund at that register and never logged it. You were right there.
- Mark (coworker), whispering: **"Pre, 'wag ka nang makialam. Renewal mo next week."**
- Ma'am Joy looks at you: "May alam ka ba dito?"
- **CHOICE (8s timer; everyone is looking):**
  - **Sabihin ang refund** → She checks the receipt, and it's there. Ate Weng is cleared. Ma'am Joy writes something on her clipboard as she walks past you. At break Ate Weng squeezes your hand: "Salamat, ha. Pambaon 'yon ng mga anak ko." *Patak: Ate Weng, nakahinga nang maluwag.*
  - **Manahimik: "May renewal ka pa next week"** → You look down at the tray. Ate Weng signs the deduction slip. At break she's in the corner texting: "Anak, sa Sabado na lang 'yung pambili ng project mo ha." *Patak: Ate Weng, ₱500 ang ikinaltas.*

### Chapter 3: BIGAS (rice) · Sari-sari store · 7:48 PM
- Drizzle. You're buying dinner: pancit canton and an egg.
- Ahead of you, Lola Ising with a coin purse: "Isang kilo nga, 'neng."
- Tindera: **"₱58 na po, 'La. Tumaas na naman po."** The TV inside is on the news: rice prices up again. *(texture: rising prices)*
- Lola counts ₱40. "Kalahati na lang pala." Tindera: "Pasensya na po, 'La, puno na po 'yung lista n'yo."
- Lola, almost to herself: "May tatlo kasi akong apo sa bahay…"
- **CHOICE (12s timer; quiet, heavy):**
  - **Dagdagan ang kulang** → You hand over ₱20. She holds your wrist with both hands: "Pagpalain ka ng Diyos, iho." She walks home with the full kilo. *Patak: Lola Ising, isang kilo ang naiuwi.*
  - **Itabi: "Pangkain mo pa 'yan bukas"** → She takes half a kilo, tucks it under her shawl, walks into the dark. *Patak: Lola Ising, kalahating kilo lang.*

### Night · Your room · 10:05 PM
Electric fan. You count your coins (the amount reflects your choices). Rain starts on the roof. Alarm set for 5:30. No choice. Just the day settling.

---

## PART TWO: SA TOTOO LANG (in reality) · Miyerkules, 6:41 AM
A fast montage, **the same no matter what Sir chose**:
1. Same jeep, same stop. The boy climbs in again and puts an envelope on your lap. **He doesn't recognize you.** Out the open back, across the road, a busy jeepney stop at night (crowd, waiting shed, sari-sari store, fishball cart, a barker calling Cubao): other kids with the same envelopes and rag climb into the other jeeps.
2. The fast food. The memo is still on the wall: *"ANG KULANG SA KAHA AY IKAKALTAS SA SAHOD."* Ate Weng is still contractual.
3. The sari-sari price board: BIGAS ₱58 → ₱60. Lola Ising is in line again with her coin purse.

Then over black, one line at a time:
> Tumulong ka man o hindi,
> ganito pa rin kinabukasan.
> Kaya parang walang pinagkaiba.

The phrase lands, big: **Ganyan talaga.**

The rain swells. Then, quietly:
> 'Yan din ang akala namin.

---

## PART THREE: KAMI (us) · Lunes, Agosto 17, 2026 · Brgy. Del Monte, QC
Card: *"Ang susunod ay totoong nangyari."* **Sir plays this part himself, alone** (Keira, Nov 3): he drives, he gets out, he walks up to the mom and asks. Keira and Prince are not in the car or on the street. They only come in after his questions, when it fades and turns into *our* telling ("Sa amin talaga nangyari 'yan. Ngayon, kami naman ang magkukuwento.").
**Everything here really happened.** Real photos and timestamps. Nothing invented.

1. **Sa kotse.** Heavy rain, real wipers going. You take a shortcut through a village in San Francisco del Monte.
2. **2:51 PM: Walang labasan.** Each exit we try is flooded (real photos 2:51, 2:57). Overhead shot: the village is high in the middle and every road out goes down into water.
3. **Parked, engine running.**
   **CHOICE (12s timer, timing out means Maghintay):** Maghintay / Bumaba. Waiting: half an hour passes, the water is still there, you go down anyway. (What *we* picked, the B99 episode and "Maybe we should go down" / "Yeah, you're right" are told later, in our telling.)
4. **2:57 PM: Sa labas.** You shut the car door and walk down the lane to the submerged jeep (the real IMG_6457). The people are the three behind us in IMG_6462, dressed as they were: the mom from the house (white tee, navy pants, black umbrella), an older neighbour (grey-violet shirt) and a neighbour in a blue NY cap, black trefoil tee and shorts with his arms crossed. "Kawawa naman 'yung driver." "Hindi niya nailabas 'yung jeep. Hindi niya kasi alam." Kakausapin mo ba sila? You walk up to the mom.
   Sir picks what to ask. Every answer is something they really told us:
   - "Lagi po bang bumabaha rito?" → *Madalas daw. Pero ito na raw ang pinakamalala.*
   - "Bakit po walang madaanan?" → *Mataas daw ang gitna ng village. Lahat ng labasan, pababa.*
   Then it fades and becomes ours: the stats screen (what we picked: Maghintay 100%), the B99 episode, "Maybe we should go down." / "Yeah, you're right.", and that Keira was the first to go up and ask.
5. **3:02 PM: CR.** Keira needs a CR. A family we've never met lets us into their house. Water, biscuits, a roof while it pours, and conversation. We stay for a while. They have a dog.
6. **3:50 PM.** The barangay rescue boat arrives at the corner.
7. **4:06 PM.** The karinderya. **4:30 PM.** The sari-sari store. Everyone is kind.
8. The water drops. We go home. **We never asked their names.**

Then, in our voice. The point: they could have said "ganyan talaga," and they chose not to.
> Hindi nila napigilan ang baha. Babaha ulit doon.
> CR, tubig, biskwit, kuwentuhan. Maliit lang 'yon para sa kanila.
> Puwede naman nilang sabihing, *ganyan talaga*, at hayaan na lang kami.
> Pero pinili nilang tumulong. At malaking bagay 'yon para sa amin.
> Kaya kami nagbago. Doon kami natutong bumaba, makinig, at magtanong.
> Doon din namin naisip 'yung app para sa mga naiipit sa baha.
> Hindi nila alam na hanggang ngayon, dala pa rin namin 'yon.

---

## PART FOUR: ULIT (again)
**First, what his Part One choices actually did**, one short timestamped moment per person, based on what he picked.
Small, temporary, but real for that person that day. (Part Two said "walang pinagkaiba." This shows there was.)

| Person | If he helped | If he didn't |
|---|---|---|
| Totoy · *Martes, 6:51 AM* | Under a bakery awning, he buys pandesal and a cup of coffee with your ₱20. That's his breakfast. | He stands outside the bakery window, watching. |
| Ate Weng · *Sabado, 9:10 AM* | Her eldest carries a new illustration board to school. The project is submitted on time. | She borrows ₱200 from a neighbor for the project. |
| Lola Ising · *Martes, 8:20 PM* | Three grandkids, three full plates of rice. | Three plates of rice. Lola's is empty. She says she already ate. |

**Then a summary, "Ang ginawa mo":** one card per person showing what he did and what came of it (or that he ran out of time), and how many he helped out of three. It sets up the message below; it is not a score against anyone.

**Then, on black, the goal of the whole game:** he doesn't have to help everyone.
> Hindi tayo perpekto. Hindi natin kayang tulungan ang lahat.
> Pero ginawa mo ang makakaya mo, at natulungan mo si [names].
> Kahit isang tao lang, malaking bagay na 'yon.

If he helped nobody, the middle line is "Pero kaya nating tulungan kahit isa." and the last is "At malaking bagay na 'yon." The jeep is then his second chance.

**Then the same choice, one more time.** Thursday, 6:40 AM. Same jeep, same stop. The boy climbs in and leaves an envelope on your lap.
- **Lagyan ng bente** → cut to black: **"Sa tingin mo, hanggang saan aabot ang bente mo?"**
- **Ibalik: "Sindikato naman 'yan"** → cut to black: **"Bukas, may sobre ulit."**

Real photos from Aug 17 with their timestamps, over the main piano theme. Along the bottom runs our lesson, as one thought (not captions of the photos), taken from what we actually said and our thesis:
> Sinasabi natin, *ganyan talaga*, kasi pakiramdam natin, walang epekto ang maliit nating ginagawa.
> Tumulong man o hindi, parang pareho lang.
> Pero nung kami ang naipit, doon namin nakita ang pagkakaiba.
> Panandalian lang ang tulong nila, isang hapon lang. Pero hanggang ngayon, hindi namin 'yon nakakalimutan.
> Hindi natin mababago ang buong mundo. Pero kaya natin sa sarili nating paraan, kung aalisin muna natin ang *ganyan talaga* sa isip natin.
> Hindi rin sapat ang isang beses. Kapag ginawa natin 'yon nang paulit-ulit, may mga buhay na nagbabago, kahit hindi natin agad makita.
> Kaya ngayon, tuwing masasabi namin ang *ganyan talaga*, titigil kami, titingin, makikinig, at aalamin kung may magagawa kami.
> Maliit lang 'yon para sa kanila. Pero umabot 'yon hanggang dito.

Then the end card, and Keira and Prince take it from here, live.

---

### Why this order works
- **Part One** makes Sir *pay* for helping (lunch money, his contract, his dinner). That's what makes it hard, not just "help because I can."
- **Part Two** makes the "ganyan talaga" logic feel *reasonable*. That's Prince's point: no difference, so why bother?
- **Part Three** flips him to the receiving end, on the day it happened to us. The locals' help didn't fix the flood either, and it still changed us.
- **Part Four** answers Part Two. His help *did* do something: one breakfast, one project, one dinner. It was small and temporary, and it was real. Then consistency: choosing once doesn't make you that person, so he chooses again, and the game asks how far it could go.
