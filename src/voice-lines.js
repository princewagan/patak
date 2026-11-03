/* Recorded dialogue. Director.say(who, text) plays the clip whose speaker and text match exactly,
   so a line only keeps its voice while its D.say() string is left as written here.
   Files are in public/audio/voice/. 01-16 are ElevenLabs voices; 17 and 18 are Prince and Keira themselves.
   03 and 12 say the amounts out loud ("five hundred", "fifty-eight"); the subtitles keep ₱500 and ₱58 on purpose. */
const V = n => `/audio/voice/${n}.mp3`;

const LINES = [
  // jeep
  ['01-ale', 'Ale', "'Wag mong bigyan. Sindikato 'yan."],
  ['02-bata', 'Totoy', 'Salamat po, kuya.'],
  // kaha (the scene and the text-only fallback in story.js use the same strings)
  ['03-maam-joy', "Ma'am Joy", 'Kulang ng ₱500.'],
  ['04-ate-weng', 'Ate Weng', "Ma'am, hindi ko po alam kung saan napunta…"],
  ['05-maam-joy', "Ma'am Joy", 'Alam mo naman ang rule. Kulang sa kaha, kaltas sa sahod.'],
  ['06-mark', 'Mark', "Pre, 'wag ka nang makialam. Renewal mo next week."],
  ['07-maam-joy', "Ma'am Joy", 'May alam ka ba dito?'],
  ['08-ikaw', 'Ikaw', "Ma'am, 'yung refund po kanina… kayo po 'yung nag-approve."],
  ['09-maam-joy', "Ma'am Joy", 'Okay. Balik sa trabaho.'],
  ['10-ate-weng', 'Ate Weng', "Salamat, ha. Pambaon 'yon ng mga anak ko."],
  // bigas
  ['11-lola-ising', 'Lola Ising', "Isang kilo nga, 'neng."],
  ['12-tindera', 'Tindera', "₱58 na po, 'La. Tumaas na naman po."],
  ['13-lola-ising', 'Lola Ising', 'Kalahati na lang pala.'],
  ['14-tindera', 'Tindera', "Pasensya na po, 'La. Puno na po 'yung lista n'yo."],
  ['15-lola-ising', 'Lola Ising', 'May tatlo kasi akong apo sa bahay…'],
  ['16-lola-ising', 'Lola Ising', 'Pagpalain ka ng Diyos, iho.'],
  // car: these were in the old car scene. Part Three is now Sir alone, so nothing says them yet.
  ['17-prince', 'Prince', "Sayang 'yung gas."],
  ['18-keira', 'Keira', 'Baba muna tayo?'],
];

const MAP = new Map(LINES.map(([f, who, text]) => [`${who}|${text}`, V(f)]));

/** every clip, so audio can fetch and decode them all up front */
export const VOICE_URLS = LINES.map(([f]) => V(f));

/** the clip for this line, or null */
export const voiceFor = (who, text) => (who ? MAP.get(`${who}|${text}`) ?? null : null);
