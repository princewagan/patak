import { audio } from './engine/audio.js';
import { tickTweens } from './engine/tween.js';

/*
  PATAK: the whole game, in order. See STORY.md for the design.
  Each chapter is an async function below. Scenes live in src/scenes/<name>.js.
  If a scene file is missing, its chapter falls back to text-only, so the game always runs start to finish.

  While working:   /?from=kami          start at a chapter
                   /?scene=car          play a single scene (add &beat=... &state={"sobre":false})
                   add &fast            to speed through text
*/

const files = import.meta.glob('./scenes/*.js');
const SCENES = {};
const ORDER = ['jeep', 'kaha', 'bigas', 'gabi', 'car', 'baha', 'ulit', 'ending'];

export async function preload(engine) {
  engine.onUpdate(dt => tickTweens(dt));
  for (const name of ORDER) {
    const f = files[`./scenes/${name}.js`];
    if (!f) continue;
    try {
      const mod = (await f()).default;
      if (mod && mod.build && !mod.built) { await mod.build(engine); mod.built = true; }
      SCENES[name] = mod;
    } catch (e) { console.error('scene failed to load:', name, e); }
  }
}

export async function story(engine, D, from) {
  const S = D.state;
  const q = new URLSearchParams(location.search);
  const solo = q.get('scene');
  if (solo) {
    const mod = SCENES[solo] || (await files[`./scenes/${solo}.js`]()).default;
    if (!mod.built) { await mod.build(engine); mod.built = true; }
    Object.assign(S, { sobre: true, kaha: true, bigas: true, wallet: 120 }, JSON.parse(q.get('state') || '{}'));
    await engine.show(mod);
    if (mod.play) await mod.play(D, S, q.get('beat'));
    return;
  }
  const CH = chapters(engine, D, S);
  const order = Object.keys(CH);
  let i = Math.max(0, order.indexOf(from || order[0]));
  if (i > 0) Object.assign(S, { sobre: true, kaha: true, bigas: true, wallet: 80 }, JSON.parse(q.get('state') || '{}'));
  for (; i < order.length; i++) await CH[order[i]]();
}

function chapters(engine, D, S) {
  const has = n => !!SCENES[n];
  const show = n => engine.show(SCENES[n]);
  const P1 = 'Unang Bahagi · Ikaw';
  return {
    // ================= PART ONE: IKAW =================
    async intro() {
      await D.black(true, 0.01);
      audio.rain(0.35, 0.8);
      await D.lines([{ t: 'Hango sa mga nangyayari araw-araw.', cls: 'small', hold: 3 }]);
      await D.charCard('IKAW', [
        '22 · Service crew sa isang fast food sa Cubao',
        'Contractual. Sa susunod na linggo malalaman kung ire-renew ka.',
        'Biyernes pa ang sahod. Martes ngayon.',
        '₱160 sa wallet',
      ]);
    },

    async sobre() {
      await show('jeep');
      await D.card(P1, 'Sobre', 'Jeep sa Aurora Blvd · 6:42 AM');
      await SCENES.jeep.play(D, S);
    },

    async kaha() {
      if (has('kaha')) { await show('kaha'); await D.card(P1, 'Kaha', 'Fast food sa Cubao · 2:15 PM'); return SCENES.kaha.play(D, S); }
      await D.card(P1, 'Kaha', 'Fast food sa Cubao · 2:15 PM');
      await D.say('', "Pagkatapos ng lunch rush, binilang ni Ma'am Joy ang kaha ni Ate Weng.");
      await D.say("Ma'am Joy", 'Kulang ng ₱500.');
      await D.say('Ate Weng', "Ma'am, hindi ko po alam kung saan napunta…");
      await D.say("Ma'am Joy", 'Alam mo naman ang rule. Kulang sa kaha, kaltas sa sahod.');
      await D.say('', "Alam mo kung saan napunta. Kanina, si Ma'am Joy mismo ang nag-approve ng ₱500 na refund sa kahang 'yon. Hindi niya ni-log.");
      await D.say('Mark', "Pre, 'wag ka nang makialam. Renewal mo next week.");
      await D.say("Ma'am Joy", 'May alam ka ba dito?');
      const p = await D.choose(['Sabihin ang refund', 'Manahimik'], { timer: 8, id: 'kaha', def: 1 });
      S.kaha = p === 0;
      if (S.kaha) {
        await D.say('Ikaw', "Ma'am, 'yung refund po kanina… kayo po 'yung nag-approve.");
        await D.say('', 'Tiningnan niya ang resibo. Nandoon nga.');
        await D.say("Ma'am Joy", 'Okay. Balik sa trabaho.');
        await D.say('', "Pagdaan niya sa'yo, may isinulat siya sa clipboard.");
        await D.say('Ate Weng', "Salamat, ha. Pambaon 'yon ng mga anak ko.");
        D.patak('Ate Weng', 'nakahinga nang maluwag');
      } else {
        await D.say('', 'Yumuko ka sa tray mo.');
        await D.say('', 'Pinirmahan ni Ate Weng ang kaltas.');
        await D.say('', "Sa break, nakita mo siyang nagte-text: \"Anak, sa Sabado na lang 'yung pambili ng project mo ha.\"");
        D.patak('Ate Weng', '₱500 ang ikinaltas');
      }
      await D.wait(2.5); await D.black(true, 1.2);
    },

    async bigas() {
      if (has('bigas')) { await show('bigas'); await D.card(P1, 'Bigas', 'Sari-sari store · 7:48 PM'); return SCENES.bigas.play(D, S); }
      await D.card(P1, 'Bigas', 'Sari-sari store · 7:48 PM');
      await D.say('Lola Ising', "Isang kilo nga, 'neng.");
      await D.say('Tindera', "₱58 na po, 'La. Tumaas na naman po.");
      await D.say('', 'Binilang ni Lola ang barya niya. ₱40.');
      await D.say('Lola Ising', 'Kalahati na lang pala.');
      await D.say('Tindera', "Pasensya na po, 'La. Puno na po 'yung lista n'yo.");
      await D.say('Lola Ising', 'May tatlo kasi akong apo sa bahay…');
      await D.say('', `₱${S.wallet} na lang ang pera mo. Tatlong araw pa bago sumahod.`);
      const p = await D.choose(['Dagdagan ang kulang', "Bayaran lang ang sa'yo"], { id: 'bigas' });
      S.bigas = p === 0;
      if (S.bigas) {
        S.wallet -= 20;
        await D.say('', 'Inabot mo ang bente.');
        await D.say('Lola Ising', 'Pagpalain ka ng Diyos, iho.');
        D.patak('Lola Ising', 'isang kilo ang naiuwi');
      } else {
        await D.say('', 'Binayaran mo ang pancit canton mo.');
        await D.say('', 'Kalahating kilo ang kinuha ni Lola. Isiniksik niya sa ilalim ng balabal, tapos naglakad sa dilim.');
        D.patak('Lola Ising', 'kalahating kilo lang');
      }
      S.wallet -= 30;
      await D.wait(2.5); await D.black(true, 1.2);
    },

    async gabi() {
      if (has('gabi')) { await show('gabi'); await D.card('', 'Gabi', 'Kuwarto mo · 10:05 PM', { sting: false, hold: 2.6 }); return SCENES.gabi.play(D, S); }
      await D.card('', 'Gabi', 'Kuwarto mo · 10:05 PM', { sting: false, hold: 2.6 });
      await D.say('', `Binilang mo ang natira. ₱${S.wallet}.`);
      await D.say('', 'Umulan nang malakas.');
      await D.black(true, 1.2);
    },

    // ================= PART TWO: SA TOTOO LANG =================
    async totoo() {
      await D.card('Ikalawang Bahagi', 'Sa Totoo Lang', 'Miyerkules · 6:41 AM');
      if (has('jeep')) { await show('jeep'); await SCENES.jeep.montage(D, S); }
      else { await D.say('', 'Parehong jeep. Parehong kanto. Sumakay ulit ang bata.'); await D.say('', S.sobre ? 'Hindi ka niya naaalala.' : 'Naglapag ulit siya ng sobre sa kandungan mo.'); }
      if (has('kaha') && SCENES.kaha.montage) { await show('kaha'); await SCENES.kaha.montage(D, S); }
      else await D.say('', 'Nasa pader pa rin ang memo: "Ang kulang sa kaha ay ikakaltas sa sahod." Contractual pa rin si Ate Weng.');
      if (has('bigas') && SCENES.bigas.montage) { await show('bigas'); await SCENES.bigas.montage(D, S); }
      else await D.say('', 'Bigas: ₱60 na. Nakapila ulit si Lola Ising, hawak ang pitaka niya.');
      await D.black(true, 0.6);
      audio.stopAll(2); audio.rain(0.5, 0.6); audio.drone(0.6);
      await D.lines([
        { t: 'Tumulong ka man o hindi,' },
        { t: 'ganito pa rin kinabukasan.' },
        { t: 'Kaya parang walang pinagkaiba.' },
      ]);
      await D.lines([{ t: 'Ganyan talaga.', cls: 'huge', hold: 3.4, sfx: () => audio.sting() }]);
      audio.rain(1.1, 0.2); audio.thunder();
      await D.wait(1.8);
      await D.lines([{ t: "'Yan din ang akala namin.", hold: 3.6 }]);
      audio.layer('drone', 0, null, 3);
    },

    // ================= PART THREE: KAMI =================
    async kami() {
      await D.lines([{ t: 'Ang susunod ay totoong nangyari.', cls: 'small', hold: 3 }]);
      if (has('car')) await show('car');
      await D.card('Ikatlong Bahagi · Kami', 'Kami', 'Lunes, Agosto 17, 2026 · Brgy. Del Monte, Quezon City', { hold: 4 });
      if (has('car')) await SCENES.car.play(D, S);
      if (has('baha')) { await show('baha'); await SCENES.baha.play(D, S); }
      audio.stopAll(3); audio.rain(0.3, 0.8);
      await D.lines([
        'Hindi nila napigilan ang baha. Babaha ulit doon.',
        "CR, tubig, biskwit, kuwentuhan. Maliit lang 'yon para sa kanila.",
        'Pero doon kami natutong bumaba, makinig, at magtanong.',
        "Doon din namin naisip 'yung app para sa mga naiipit sa baha.",
        "Hindi nila alam na hanggang ngayon, dala pa rin namin 'yon.",
      ].map(t => ({ t, alone: true })));
    },

    // ================= PART FOUR: ULIT =================
    async ulit() {
      await D.card('Ikaapat na Bahagi', 'Ulit', '', { hold: 2.6 });
      if (has('ulit')) { await show('ulit'); await SCENES.ulit.play(D, S); }
      else {
        await D.say('', S.sobre ? "Martes, 6:51 AM. Bumili si Totoy ng pandesal at kape gamit ang bente mo. 'Yun ang almusal niya." : 'Martes, 6:51 AM. Nakatayo si Totoy sa labas ng panaderya. Nakatingin.');
        await D.say('', S.kaha ? 'Sabado. Dala ng panganay ni Ate Weng ang bagong illustration board. Naipasa niya ang project sa oras.' : 'Sabado. Nangutang si Ate Weng ng ₱200 sa kapitbahay para sa project.');
        await D.say('', S.bigas ? 'Martes ng gabi. Tatlong apo, tatlong platong may kanin.' : 'Martes ng gabi. Tatlong platong may kanin. Walang laman ang kay Lola. Busog pa raw siya.');
      }
      await D.card('', 'Huwebes', '6:40 AM', { sting: false, hold: 2 });
      let p;
      if (has('jeep')) { await show('jeep'); p = await SCENES.jeep.again(D, S); }
      else { await D.say('', 'Parehong jeep. Parehong kanto. Sumakay ulit ang bata. May sobre ulit sa kandungan mo.'); p = await D.choose(['Lagyan ng bente', 'Ibalik nang walang laman'], { timer: 10, id: 'ulit', def: 1 }); await D.black(true, 1.5); }
      audio.stopAll(2);
      await D.wait(1.2);
      await D.lines([{ t: p === 0 ? 'Sa tingin mo, hanggang saan aabot ang bente mo?' : 'Bukas, may sobre ulit.', hold: 5.5 }]);
    },

    async end() {
      if (has('ending')) { await show('ending'); await SCENES.ending.play(D, S); }
      await D.lines([{ t: 'PATAK', cls: 'huge', hold: 3.2 }, { t: 'Keira Gacusan · Prince Wagan · THEO 12', cls: 'small', hold: 5 }], { clearAfter: false });
      audio.stopAll(5);
    },
  };
}
