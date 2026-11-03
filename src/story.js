import { audio } from './engine/audio.js';
import { preloadReal } from './engine/realbody.js';
import { music } from './engine/music.js';
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
const ORDER = ['jeep', 'kaha', 'bigas', 'gabi', 'car', 'labas', 'baha', 'ulit', 'ending'];

export async function preload(engine) {
  engine.onUpdate(dt => tickTweens(dt));
  if (!new URLSearchParams(location.search).has('noreal')) await preloadReal(['mark', 'joy', 'weng', 'driver', 'boy', 'tindera', 'commuter', 'lola', 'prince', 'keira']);
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
  if (i > 0) {
    // started partway: keep the choices passed along, assume he helped in any he never reached, and work out the wallet
    Object.assign(S, { sobre: true, kaha: true, bigas: true }, JSON.parse(q.get('state') || '{}'));
    const past = n => i > order.indexOf(n);
    S.wallet = 160 - (past('sobre') && S.sobre ? 20 : 0) - (past('bigas') ? (S.bigas ? 50 : 30) : 0);
  }
  D.order = order;
  for (; i < order.length; i++) { D.chapter = order[i]; await CH[order[i]](); }
}

/** what he did for each person. Running out of time is shown as what it was: nothing. */
function summaryOf(S) {
  const c = S.choices || {};
  const card = (name, id, helped, did, didnt, ok, bad) => {
    const out = c[id] === 'timeout';
    return { name, helped, tag: helped ? 'Tinulungan' : out ? 'Walang ginawa' : 'Hindi tinulungan', did: helped ? did : out ? 'Naubusan ka ng oras.' : didnt, then: helped ? ok : bad };
  };
  const cards = [
    card('Totoy', 'sobre', !!S.sobre, 'Nilagyan mo ng bente ang sobre.', 'Ibinalik mo ang sobre nang walang laman.', 'Nakapag-almusal siya.', 'Nakatingin lang siya sa panaderya.'),
    card('Ate Weng', 'kaha', !!S.kaha, 'Sinabi mo ang tungkol sa refund.', 'Nanahimik ka.', 'Hindi siya nakaltasan.', '₱500 ang ikinaltas sa kanya.'),
    card('Lola Ising', 'bigas', !!S.bigas, 'Ikaw ang nagbayad ng kulang.', 'Itinabi mo ang pera mo.', 'Isang kilo ang naiuwi niya.', 'Kalahating kilo lang ang naiuwi niya.'),
  ];
  const n = cards.filter(x => x.helped).length;
  return { cards, foot: n === 3 ? 'Natulungan mo silang lahat.' : n === 0 ? 'Wala kang natulungan.' : `Natulungan mo: ${n} sa 3` };
}

function chapters(engine, D, S) {
  const has = n => !!SCENES[n];
  const show = n => engine.show(SCENES[n]);
  // no chapter screens: place and time are a quiet stamp over the scene as it fades in
  const place = (time, where) => D.stamp(`<b>${time}</b>${where || ''}`, 5, 1.6);
  return {
    // ================= PART ONE: IKAW =================
    async intro() {
      await D.black(true, 0.01);
      audio.rain(0.35, 0.8);
      await D.lines([{ t: 'Hango sa mga nangyayari araw-araw.', cls: 'small', hold: 2.4 }]);
      if (has('gabi') && SCENES.gabi.morning) { await show('gabi'); return SCENES.gabi.morning(D, S); }
      await D.charCard('IKAW', [
        '22 · Service crew sa isang fast food sa Cubao',
        'Contractual. Sa susunod na linggo malalaman kung ire-renew ka.',
        'Biyernes pa ang sahod. Martes ngayon.',
        '₱160 sa wallet',
      ]);
    },

    async sobre() {
      await show('jeep');
      place('6:42 AM', 'Jeep sa Aurora Blvd');
      await SCENES.jeep.play(D, S);
    },

    async kaha() {
      place('2:15 PM', 'Fast food sa Cubao');
      if (has('kaha')) { await show('kaha'); return SCENES.kaha.play(D, S); }
      await D.say('', "Pagkatapos ng lunch rush, binilang ni Ma'am Joy ang kaha ni Ate Weng.");
      await D.say("Ma'am Joy", 'Kulang ng ₱500.');
      await D.say('Ate Weng', "Ma'am, hindi ko po alam kung saan napunta…");
      await D.say("Ma'am Joy", 'Alam mo naman ang rule. Kulang sa kaha, kaltas sa sahod.');
      await D.say('', "Alam mo kung saan napunta. Kanina, si Ma'am Joy mismo ang nag-approve ng ₱500 na refund sa kahang 'yon. Hindi niya ni-log.");
      await D.say('Mark', "Pre, 'wag ka nang makialam. Renewal mo next week.");
      await D.say("Ma'am Joy", 'May alam ka ba dito?');
      const p = await D.choose(['Magsalita|Sabihin ang refund', 'Manahimik|May renewal ka pa next week'], { timer: 8, id: 'kaha', def: 1 });
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
      place('7:48 PM', 'Sari-sari store');
      if (has('bigas')) { await show('bigas'); return SCENES.bigas.play(D, S); }
      await D.say('Lola Ising', "Isang kilo nga, 'neng.");
      await D.say('Tindera', "₱58 na po, 'La. Tumaas na naman po.");
      await D.say('', 'Binilang ni Lola ang barya niya. ₱40.');
      await D.say('Lola Ising', 'Kalahati na lang pala.');
      await D.say('Tindera', "Pasensya na po, 'La. Puno na po 'yung lista n'yo.");
      await D.say('Lola Ising', 'May tatlo kasi akong apo sa bahay…');
      await D.say('', `₱${S.wallet} na lang ang pera mo. Tatlong araw pa bago sumahod.`);
      const p = await D.choose(['Dagdagan|Ikaw na ang magbayad ng kulang', "Itabi|Pangkain mo pa 'yan bukas"], { timer: 12, id: 'bigas', def: 1 });
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
      place('10:05 PM', 'Kuwarto mo');
      music.play('night', 0.55, 5);
      if (has('gabi')) { await show('gabi'); await SCENES.gabi.play(D, S); music.stop(2); return; }
      await D.say('', `Binilang mo ang natira. ₱${S.wallet}.`);
      await D.say('', 'Umulan nang malakas.');
      await D.black(true, 1.2);
    },

    // ================= PART TWO: SA TOTOO LANG =================
    async totoo() {
      place('Miyerkules, 6:41 AM');
      if (has('jeep')) { await show('jeep'); await SCENES.jeep.montage(D, S); }
      else { await D.say('', 'Parehong jeep. Parehong kanto. Sumakay ulit ang bata.'); await D.say('', S.sobre ? 'Hindi ka niya naaalala.' : 'Naglapag ulit siya ng sobre sa kandungan mo.'); }
      if (has('kaha') && SCENES.kaha.montage) { await show('kaha'); await SCENES.kaha.montage(D, S); }
      else await D.say('', 'Nasa pader pa rin ang memo: "Ang kulang sa kaha ay ikakaltas sa sahod." Contractual pa rin si Ate Weng.');
      if (has('bigas') && SCENES.bigas.montage) { await show('bigas'); await SCENES.bigas.montage(D, S); }
      else await D.say('', 'Bigas: ₱60 na. Nakapila ulit si Lola Ising, hawak ang pitaka niya.');
      await D.black(true, 0.6);
      audio.stopAll(2); audio.rain(0.5, 0.6); audio.drone(0.6);
      music.play('night', 0.8, 2.5);
      await D.lines([
        { t: 'Tumulong ka man o hindi,' },
        { t: 'ganito pa rin kinabukasan.' },
        { t: 'Kaya parang walang pinagkaiba.' },
      ]);
      await D.lines([{ t: 'Ganyan talaga.', cls: 'huge', hold: 3.4, sfx: () => audio.sting() }]);
      audio.rain(1.1, 0.2); audio.thunder();
      await D.wait(1.8);
      music.stop(2.5);
      await D.lines([{ t: "'Yan din ang akala namin.", hold: 3.6 }]);
      audio.layer('drone', 0, null, 3);
    },

    // ================= PART THREE: KAMI =================
    async kami() {
      await D.lines([{ t: 'Ang susunod ay totoong nangyari.', cls: 'small', hold: 3 }]);
      if (has('car')) await show('car');
      place('Lunes, Agosto 17, 2026', 'Brgy. Del Monte, Quezon City');
      if (has('car')) await SCENES.car.play(D, S);
    },

    async labas() {
      if (has('labas')) { await show('labas'); await SCENES.labas.play(D, S); }
    },

    async bahay() {
      music.play('tender', 0.4, 6);
      if (has('baha')) { await show('baha'); await SCENES.baha.play(D, S); }
      audio.stopAll(3); audio.rain(0.3, 0.8);
      music.level(0.95, 4);
      await D.lines([
        'Hindi nila napigilan ang baha. Babaha ulit doon.',
        "CR, tubig, biskwit, kuwentuhan. Maliit lang 'yon para sa kanila.",
        "Puwede naman nilang sabihing, <i>ganyan talaga</i>, at hayaan na lang kami.",
        "Pero pinili nilang tumulong. At malaking bagay 'yon para sa amin.",
        'Kaya kami nagbago. Doon kami natutong bumaba, makinig, at magtanong.',
        "Doon din namin naisip 'yung app para sa mga naiipit sa baha.",
        "Hindi nila alam na hanggang ngayon, dala pa rin namin 'yon.",
      ].map(t => ({ t, alone: true })));
    },

    // ================= PART FOUR: ULIT =================
    async ulit() {
      music.play('tender', 0.6, 3);
      if (has('ulit')) { await show('ulit'); await SCENES.ulit.play(D, S); }
      else {
        await D.say('', S.sobre ? "Martes, 6:51 AM. Bumili si Totoy ng pandesal at kape gamit ang bente mo. 'Yun ang almusal niya." : 'Martes, 6:51 AM. Nakatayo si Totoy sa labas ng panaderya. Nakatingin.');
        await D.say('', S.kaha ? 'Sabado. Dala ng panganay ni Ate Weng ang bagong illustration board. Naipasa niya ang project sa oras.' : 'Sabado. Nangutang si Ate Weng ng ₱200 sa kapitbahay para sa project.');
        await D.say('', S.bigas ? 'Martes ng gabi. Tatlong apo, tatlong platong may kanin.' : 'Martes ng gabi. Tatlong platong may kanin. Walang laman ang kay Lola. Busog pa raw siya.');
      }
      // the point of Part Four: nobody helps everyone, but one person is already a lot
      const helped = [S.sobre && 'Totoy', S.kaha && 'Ate Weng', S.bigas && 'Lola Ising'].filter(Boolean);
      const names = helped.length === 1 ? `si ${helped[0]}` : helped.length === 2 ? `sina ${helped[0]} at ${helped[1]}` : `sina ${helped[0]}, ${helped[1]}, at ${helped[2]}`;
      audio.rain(0.3, 0.8);
      music.level(0.9, 3);
      await D.summary(summaryOf(S));
      await D.lines([
        { t: 'Hindi tayo perpekto. Hindi natin kayang tulungan ang lahat.', alone: true },
        { t: helped.length ? `Pero ginawa mo ang makakaya mo, at natulungan mo ${names}.` : 'Pero kaya nating tulungan kahit isa.', alone: true },
        { t: helped.length ? "Kahit isang tao lang, malaking bagay na 'yon." : "At malaking bagay na 'yon.", alone: true },
      ]);
      music.stop(4);
      place('Huwebes, 6:40 AM');
      let p;
      if (has('jeep')) { await show('jeep'); p = await SCENES.jeep.again(D, S); }
      else { await D.say('', 'Parehong jeep. Parehong kanto. Sumakay ulit ang bata. May sobre ulit sa kandungan mo.'); p = await D.choose(['Magbigay|Lagyan ng bente', "Ibalik|Sindikato naman 'yan"], { timer: 10, id: 'ulit', def: 1 }); await D.black(true, 1.5); }
      audio.stopAll(2);
      await D.wait(1.2);
      await D.lines([{ t: p === 0 ? 'Sa tingin mo, hanggang saan aabot ang bente mo?' : 'Bukas, may sobre ulit.', hold: 5.5 }]);
    },

    async end() {
      if (has('ending')) { await show('ending'); await SCENES.ending.play(D, S); }
      music.resolve();
      await D.lines([{ t: 'PATAK', cls: 'huge', hold: 3.2 }, { t: 'Keira Gacusan · Prince Wagan · THEO 12', cls: 'small', hold: 5 }], { clearAfter: false });
      audio.stopAll(5);
    },
  };
}
