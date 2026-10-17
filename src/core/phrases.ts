export type Mood = 'rude' | 'smug' | 'corporate' | 'wholesome';

export const MOODS: readonly Mood[] = ['rude', 'smug', 'corporate', 'wholesome'];
export const DEFAULT_MOOD: Mood = 'smug';

export const MOOD_LABELS: Record<Mood, string> = {
  rude: 'Rude',
  smug: 'Smug',
  corporate: 'Corporate',
  wholesome: 'Wholesome',
};

export interface Phrase {
  readonly text: string;
  readonly profane: boolean;
}

interface SlotValue {
  readonly text: string;
  readonly profane?: boolean;
}

interface Template {
  readonly pattern: string;
  readonly slots: Record<string, readonly SlotValue[]>;
  readonly profane?: boolean;
}

interface MoodData {
  readonly fixed: readonly Phrase[];
  readonly templates: readonly Template[];
}

const p = (text: string): Phrase => ({ text, profane: true });
const c = (text: string): Phrase => ({ text, profane: false });
const s = (text: string, profane = false): SlotValue => (profane ? { text, profane } : { text });

const RUDE: MoodData = {
  fixed: [
    p('fuck off'),
    p('fuck right off'),
    p('kindly fuck off'),
    p('piss off, nerd'),
    p('sod off'),
    p('bugger off'),
    p('nice try, dipshit'),
    p('fuck off and enhance that'),
    p('absolutely fucking not'),
    p('not a chance, shithead'),
    p('eat shit, snoop'),
    p('go fuck a cactus'),
    p('bollocks to you'),
    p('piss off and zoom out'),
    c('none of your business'),
    c('mind your own business'),
    c('get your own password'),
    c('go away'),
    c('absolutely not, mate'),
    c('who asked?'),
    c('back off, creep'),
    c('get a life'),
    c('stop squinting'),
    c('zoom out, loser'),
    c('not today, buddy'),
    c('keep dreaming'),
    c('how about no'),
    c('take a hike'),
    c('get lost'),
    c('bite me'),
    c('nosy little gremlin'),
    c('eat glass, snoop'),
    c('nope, nosy'),
    c('go bother someone else'),
    c('cry about it'),
    c('you wish, creep'),
    c('nothing here for you, weirdo'),
    c('stop it, get some help'),
  ],
  templates: [
    {
      pattern: '{off} off, {target}',
      slots: {
        off: [
          s('fuck', true),
          s('piss', true),
          s('sod', true),
          s('bugger', true),
          s('back'),
          s('buzz'),
          s('shove'),
        ],
        target: [
          s('nerd'),
          s('creep'),
          s('buddy'),
          s('pal'),
          s('snoop'),
          s('detective'),
          s('hacker'),
          s('weirdo'),
        ],
      },
    },
  ],
};

const SMUG: MoodData = {
  fixed: [
    c('you thought this was a password?'),
    c('nice try, enhance harder'),
    c('enhance harder, detective'),
    c('wow, you really zoomed in'),
    c('nothing to see here, nerd'),
    c('lol no'),
    c('imagine trying this hard'),
    c("you've been decoyed"),
    c('this is not the password'),
    c('still not the password'),
    c('keep squinting'),
    c('nope, try again'),
    c("did you really think that'd work?"),
    c('the real one is in my head'),
    c('congratulations, you found nothing'),
    c('10/10 effort, 0/10 result'),
    c('zoom and enhance... nope'),
    c('this took you how long?'),
    c("plot twist: it's not here"),
    c('your depixelizer is proud of you'),
    c('adorable attempt'),
    c('imagine trying this hard, lol'),
    c('so much effort, so little reward'),
    c('the pixels were never the point'),
    c('decoded: a waste of your time'),
    c('you un-blurred a joke'),
    c('next time try asking nicely'),
    c('that was the decoy, genius'),
    c('close, but entirely wrong'),
    c("you're reading a decoy right now"),
    c('great tool, wrong target'),
    c('a+ for effort, f for outcome'),
    c('hope the enhance was worth it'),
    c('all that compute, for this'),
  ],
  templates: [
    {
      pattern: '{opener}, {target}',
      slots: {
        opener: [
          s('nice try'),
          s('good effort'),
          s('so close'),
          s('bless your heart'),
          s('adorable attempt'),
          s('almost'),
        ],
        target: [
          s('detective'),
          s('nerd'),
          s('sherlock'),
          s('genius'),
          s('buddy'),
          s('champ'),
          s('inspector'),
        ],
      },
    },
  ],
};

const CORPORATE: MoodData = {
  fixed: [
    c('per my last email: no'),
    c("let's take this offline"),
    c('circling back: no'),
    c('this is above your pay grade'),
    c('please see attached nothing'),
    c('as previously discussed, no'),
    c("let's park this indefinitely"),
    c('not a priority this quarter'),
    c('request denied by legal'),
    c('out of office, forever'),
    c('synergy not found'),
    c("we'll circle back never"),
    c('this has been escalated to nobody'),
    c('thanks for your interest. no.'),
    c('ticket closed: won’t fix'),
    c('HR has been notified'),
    c('noted, and ignored'),
    c('per policy, no'),
    c('not in scope'),
    c('kindly revert with nothing'),
    c('moving forward, no'),
    c('pending approval until the heat death'),
    c('access denied, see your manager'),
    c('this meeting could have been a no'),
    c('aligned on: nothing for you'),
    c('redacted per compliance'),
    c('let me loop in nobody'),
    c('low priority, high nope'),
    c('we value your curiosity. no.'),
    c('action item: stop'),
  ],
  templates: [
    {
      pattern: '{opener}: {verdict}',
      slots: {
        opener: [
          s('per my last email'),
          s('as discussed'),
          s('circling back'),
          s('just flagging'),
          s('quick sync'),
          s('to close the loop'),
          s('friendly reminder'),
        ],
        verdict: [s('no'), s('still no'), s('hard pass'), s("won't fix"), s('not happening'), s('declined')],
      },
    },
  ],
};

const WHOLESOME: MoodData = {
  fixed: [
    c('go drink some water'),
    c("you're doing great, sweetie"),
    c('have you eaten today?'),
    c('call your mother'),
    c('take a deep breath'),
    c('go touch some grass'),
    c('you deserve a nap'),
    c('stretch your back'),
    c('be kind to yourself'),
    c("go outside, it's sunny"),
    c('pet a dog today'),
    c('hydrate, then investigate'),
    c('you are enough'),
    c('posture check'),
    c("go to bed, it's late"),
    c('make yourself a tea'),
    c('drink water, not secrets'),
    c('text a friend back'),
    c('unclench your jaw'),
    c('blink. you forgot to blink.'),
    c('nothing here, but you look nice'),
    c('proud of you for trying'),
    c('rest your eyes for a bit'),
    c('eat a vegetable today'),
    c('you did your best, champ'),
    c('go for a little walk'),
    c('somebody is glad you exist'),
    c('a snack would help right now'),
  ],
  templates: [
    {
      pattern: '{advice}, {endearment}',
      slots: {
        advice: [
          s('drink some water'),
          s('take a deep breath'),
          s('go touch some grass'),
          s('stretch your back'),
          s('go to bed'),
          s('have a snack'),
          s('call your mother'),
          s('rest your eyes'),
          s('be gentle with yourself'),
        ],
        endearment: [s('friend'), s('sweetie'), s('pal'), s('champ'), s('buddy')],
      },
    },
  ],
};

const DATA: Record<Mood, MoodData> = { rude: RUDE, smug: SMUG, corporate: CORPORATE, wholesome: WHOLESOME };

export const FALLBACKS: readonly Phrase[] = [c('no'), c('nope'), c('lol'), c('nah'), c('no.')];
const RUDE_FALLBACKS: readonly Phrase[] = [p('fu'), ...FALLBACKS];

function expandTemplate(template: Template): Phrase[] {
  const names = Object.keys(template.slots);
  let partial: { text: string; profane: boolean }[] = [
    { text: template.pattern, profane: template.profane ?? false },
  ];
  for (const name of names) {
    const values = template.slots[name];
    const next: { text: string; profane: boolean }[] = [];
    for (const item of partial) {
      for (const value of values) {
        next.push({
          text: item.text.split(`{${name}}`).join(value.text),
          profane: item.profane || (value.profane ?? false),
        });
      }
    }
    partial = next;
  }
  return partial;
}

const cache = new Map<Mood, readonly Phrase[]>();

export function allPhrases(mood: Mood): readonly Phrase[] {
  const hit = cache.get(mood);
  if (hit) return hit;
  const data = DATA[mood];
  const seen = new Set<string>();
  const out: Phrase[] = [];
  for (const phrase of [...data.fixed, ...data.templates.flatMap(expandTemplate)]) {
    const key = phrase.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
  }
  cache.set(mood, out);
  return out;
}

// "Keep it clean" drops every entry flagged profane, from every mood, including the rude fallbacks.
export function phrasesFor(mood: Mood, clean: boolean): readonly Phrase[] {
  const all = allPhrases(mood);
  return clean ? all.filter((phrase) => !phrase.profane) : all;
}

export function fallbacksFor(mood: Mood, clean: boolean): readonly Phrase[] {
  const all = mood === 'rude' ? RUDE_FALLBACKS : FALLBACKS;
  return clean ? all.filter((phrase) => !phrase.profane) : all;
}
