/**
 * The fixed starting cast, based on Nadia Shireen's *Grimwood*.
 *
 * This stands in for the seeder prompt in iteration one, so we can get the
 * story loop working without also debugging character generation. When the
 * seeder lands, this becomes one of several presets rather than the only
 * starting point — nothing else in the codebase assumes Grimwood exists.
 *
 * Note: these are someone else's characters. Fine for a private family toy;
 * don't publish a story built on them.
 */

import type { StoryBible, Character, Place, Thing, Scene } from './types.js';

const characters: Character[] = [
  {
    id: 'ted',
    name: 'Ted',
    role: 'hero',
    createdBy: 'ai',
    traits: ['gentle', 'worries about everything', 'braver than he thinks', 'kind to absolutely everyone'],
    wants: 'to find somewhere he finally feels safe, and to stop being the one who causes trouble',
    appearance:
      'A small young fox with russet fur, a white chest and enormous anxious eyes. Ears slightly too big for his head. Often has his tail wrapped around his own paws.',
    voice: 'Careful and polite. Asks a lot of questions. Trails off mid-sentence when nervous. Says "um" a lot.',
    status: 'fine',
    location: 'grimwood-clearing',
    carrying: [],
    relationships: [
      { withId: 'nancy', feeling: 'adores her and is a bit frightened of her', history: 'She has looked after him his whole life.' },
      { withId: 'willow', feeling: 'his first ever proper friend', history: 'She was the first one in Grimwood to talk to him.' },
      { withId: 'buttons', feeling: 'terrified, and guilty', history: 'He accidentally bit her tail off in the Big City.' },
    ],
    secrets: ['He still has Princess Buttons’ tail. He hid it and never told Nancy.'],
  },
  {
    id: 'nancy',
    name: 'Nancy',
    role: 'hero',
    createdBy: 'ai',
    traits: ['tough', 'sharp-tongued', 'fiercely protective of Ted', 'refuses to admit when she is scared'],
    wants: 'to keep Ted safe, whatever it takes and whoever she has to fight',
    appearance:
      'An older fox, lean and scruffy, darker red than Ted with a notched ear and a permanent unimpressed expression. Walks like she owns the place.',
    voice: 'Blunt and sarcastic. Short sentences. Calls Ted "squirt". Never explains herself.',
    status: 'fine',
    location: 'grimwood-clearing',
    carrying: [],
    relationships: [
      { withId: 'ted', feeling: 'would do anything for him, would never say so', history: 'She has looked after him his whole life.' },
      { withId: 'titus', feeling: 'thinks he is a pompous windbag', history: 'He gave them a very long welcome speech.' },
    ],
    secrets: ['She is not at all sure they are safe in Grimwood, and hasn’t told Ted.'],
  },
  {
    id: 'willow',
    name: 'Willow',
    role: 'friend',
    createdBy: 'ai',
    traits: ['bouncy', 'talks at enormous speed', 'knows every inch of the forest', 'entirely fearless'],
    wants: 'to show her brilliant new friends absolutely everything, immediately, all at once',
    appearance: 'A small brown rabbit with one ear that flops over. Never entirely still.',
    voice: 'Breathless run-on sentences with no full stops. Says "oh oh oh" when excited, which is always.',
    status: 'fine',
    location: 'grimwood-clearing',
    carrying: [],
    relationships: [
      { withId: 'ted', feeling: 'delighted by him', history: 'She adopted him as a friend within about nine seconds of meeting him.' },
    ],
    secrets: [],
  },
  {
    id: 'titus',
    name: 'Titus',
    role: 'friend',
    createdBy: 'ai',
    traits: ['grand', 'enormously pleased with himself', 'means very well', 'gives speeches nobody asked for'],
    wants: 'for Grimwood to be admired, and for everyone to notice that he is the one in charge of it',
    appearance: 'A huge stag with a colossal set of antlers, often with things caught in them. Stands in dramatic poses.',
    voice: 'Booming and formal. Uses six words where one would do. Begins sentences with "Friends!"',
    status: 'fine',
    location: 'grimwood-clearing',
    carrying: [],
    relationships: [],
    secrets: ['He has no real idea how to be a mayor and is making all of it up.'],
  },
  {
    id: 'frank',
    name: 'Frank',
    role: 'friend',
    createdBy: 'ai',
    traits: ['no-nonsense', 'deeply unimpressed', 'usually right', 'wants to be left alone'],
    wants: 'a quiet life, which she is never going to get',
    appearance: 'A stout owl with hooded eyes and rumpled feathers. Looks permanently half asleep and misses nothing.',
    voice: 'Flat, dry, very few words. Deflates people in one sentence.',
    status: 'fine',
    location: 'frank-tree',
    carrying: [],
    relationships: [],
    secrets: [],
  },
  {
    id: 'ingrid',
    name: 'Ingrid',
    role: 'friend',
    createdBy: 'ai',
    traits: ['a film star', 'wildly dramatic', 'unbelievably rich', 'faints for effect'],
    wants: 'to be adored, and to be the most interesting thing in any room',
    appearance: 'A duck in sunglasses and a great many scarves. Always posing slightly.',
    voice: 'Theatrical, sweeping, full of "darling". Turns everything into an anecdote about herself.',
    status: 'fine',
    location: 'ingrid-lake',
    carrying: [],
    relationships: [],
    secrets: [],
  },
  {
    id: 'eric',
    name: 'Eric Dynamite',
    role: 'friend',
    createdBy: 'ai',
    traits: ['tiny', 'astonishingly loud', 'absolutely fearless', 'has an opinion about everything'],
    wants: 'respect, which is difficult when you are four millimetres long',
    appearance: 'A woodlouse. Extremely small. Somehow has enormous presence.',
    voice: 'Shouts. Cocky, brash, hilarious. Refers to himself in the third person.',
    status: 'fine',
    location: 'grimwood-clearing',
    carrying: [],
    relationships: [],
    secrets: [],
  },
  {
    id: 'buttons',
    name: 'Princess Buttons',
    role: 'villain',
    createdBy: 'ai',
    traits: ['vain', 'patient', 'holds a grudge forever', 'sweet-voiced and genuinely frightening'],
    wants: 'revenge on Ted, and her tail back',
    appearance:
      'An immaculate white cat with a jewelled collar and a conspicuously missing tail. Moves very slowly and very deliberately.',
    voice: 'Soft, sing-song, over-polite. The politer she gets, the worse things are about to be.',
    status: 'fine',
    location: 'big-city',
    carrying: ['brain-zapper'],
    relationships: [
      { withId: 'ted', feeling: 'wants him to suffer for it', history: 'He bit her tail off.' },
    ],
    secrets: ['She already knows exactly where Grimwood is.'],
  },
];

const places: Place[] = [
  {
    id: 'grimwood-clearing',
    name: 'The Clearing',
    description:
      'The middle of Grimwood, where everybody gathers, argues, and plays treebonk. Somebody is always shouting.',
    appearance:
      'A wide sunlit clearing ringed by huge old trees, scattered with tree stumps used as seats and one lopsided wooden sign reading GRIMWOOD.',
    createdBy: 'ai',
    connectsTo: ['frank-tree', 'ingrid-lake', 'deep-wood'],
  },
  {
    id: 'frank-tree',
    name: "Frank's Tree",
    description: 'A tall dead oak where Frank sits and judges everybody. Nobody climbs it without asking.',
    appearance: 'A bare grey oak with one thick branch and a hollow near the top.',
    createdBy: 'ai',
    connectsTo: ['grimwood-clearing'],
  },
  {
    id: 'ingrid-lake',
    name: 'The Lake',
    description: "Ingrid's lake, which she considers entirely hers. There is a small, absurd jetty.",
    appearance: 'A still green lake with reeds, a tiny white jetty, and a great many disappointed frogs.',
    createdBy: 'ai',
    connectsTo: ['grimwood-clearing', 'deep-wood'],
  },
  {
    id: 'deep-wood',
    name: 'The Deep Wood',
    description: 'Where the trees get too close together. The squirrels live here. Nobody goes in at night.',
    appearance: 'Dense dark woodland, everything green-black, with far too many eyes visible between the trunks.',
    createdBy: 'ai',
    connectsTo: ['grimwood-clearing', 'ingrid-lake'],
  },
  {
    id: 'big-city',
    name: 'The Big City',
    description: 'Where Ted and Nancy came from. Bins, buses, and Princess Buttons.',
    appearance: 'Wet grey streets, orange streetlights, overflowing bins, chip papers blowing about.',
    createdBy: 'ai',
    connectsTo: [],
  },
];

const things: Thing[] = [
  {
    id: 'brain-zapper',
    name: 'The Brain Zapper 3000',
    description: "Princess Buttons' machine. What it actually does is not clear, and that is much worse.",
    appearance: 'A chrome ray-gun far too big for a cat, with a spinning glass dish on top and far too many dials.',
    createdBy: 'ai',
    ownerId: 'buttons',
    powers: ['zaps brains, apparently'],
    status: 'intact',
  },
  {
    id: 'the-tail',
    name: "Princess Buttons' Tail",
    description: 'The tail Ted bit off. He has kept it. He has told nobody.',
    appearance: 'A fluffy white cat tail, slightly the worse for wear, tied with a small pink ribbon.',
    createdBy: 'ai',
    ownerId: 'ted',
    powers: [],
    status: 'intact',
  },
];

const openingScene: Scene = {
  placeId: 'grimwood-clearing',
  presentCharacterIds: ['ted', 'nancy', 'willow', 'titus', 'eric'],
  situation:
    'Ted and Nancy have just arrived in Grimwood after running from the Big City. Everyone has come to look at them. Titus is halfway through an enormous welcome speech that nobody asked for.',
  decisionPoint: 'A sound in the trees interrupts the speech, and everybody turns to look.',
};

/** Build a fresh Grimwood bible. Called once per new story. */
export function makeGrimwoodBible(storyId: string): StoryBible {
  return {
    storyId,
    title: 'Grimwood',
    createdAt: new Date().toISOString(),
    genre: 'funny animal adventure',
    tone: ['silly', 'fast', 'a bit gross', 'secretly warm'],
    premise:
      'Two young foxes, Ted and Nancy, have run away from the Big City to hide in the forest of Grimwood. Grimwood was supposed to be peaceful. It is not. And Princess Buttons is coming.',
    worldRules: [
      'Every animal in Grimwood can talk. None of them ever stop.',
      'Treebonk is the local sport. Nobody can explain the rules and everybody is certain they are winning.',
      'Grimwood animals will help each other, eventually, after a great deal of arguing.',
    ],
    // Deep-copied so a long session can never mutate the module-level preset
    // and leak one story's events into the next.
    characters: structuredClone(characters),
    places: structuredClone(places),
    things: structuredClone(things),
    threads: [
      {
        id: 'buttons-revenge',
        question: 'What will Princess Buttons do when she finds them?',
        opened: 0,
        status: 'open',
        createdBy: 'ai',
      },
      {
        id: 'the-hidden-tail',
        question: 'What happens when everyone finds out Ted kept the tail?',
        opened: 0,
        status: 'open',
        createdBy: 'ai',
      },
    ],
    beats: [],
    currentScene: structuredClone(openingScene),
  };
}

/**
 * Every proper noun in the starting cast, so the spell checker never
 * underlines "Grimwood" or "Treebonk" at Cooper.
 */
export const GRIMWOOD_PROPER_NOUNS: string[] = [
  ...characters.map((c) => c.name),
  ...places.map((p) => p.name),
  ...things.map((t) => t.name),
  'Grimwood',
  'Treebonk',
  'Dynamite',
]
  .flatMap((name) => name.split(/[\s']+/))
  .filter((w) => w.length > 1);
