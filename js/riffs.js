// ═══════════════════════════════════════════════════════════════════════════
// RIFF LIBRARY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

// Each riff: tab lines (6 strings e→E top to bottom), note sequence for audio
// Note sequence: [{string (0=low E), fret, duration ms, technique}]
// Techniques: 'pick','bend','slide','hammer','pulloff','vibrato'

const RIFF_LIBRARY = [
  // ── MINOR PENTATONIC ────────────────────────────────────────────────────
  {
    scaleId: 'minpent',
    scaleName: 'Minor Pentatonic',
    riffs: [
      {
        title: 'Classic Blues-Rock Lick',
        key: 'E', mood: ['Blues','Rock','Hazel','Ronson'],
        description: 'The most essential minor pentatonic lick. Bend the 7th fret on the G string up a whole step — that\'s the money note. Let it ring with vibrato at the top. This is the foundation of Ronson, Hazel, and Dean Ween\'s entire vocabulary.',
        techniques: ['Whole step bend','Vibrato','Pull-off'],
        tab: `e|--------------------------------|
B|--------------------------------|
G|----7b9~~---7---5---------------|
D|--------------------7---5---7---|
A|--------------------------------|
E|--------------------------------|`,
        notes: [
          {si:3,f:7,dur:500,t:'bend',bendTo:2},{si:3,f:7,dur:200,t:'pick'},{si:3,f:5,dur:200,t:'pick'},
          {si:2,f:7,dur:180,t:'pick'},{si:2,f:5,dur:180,t:'pick'},{si:2,f:7,dur:300,t:'pick'}
        ]
      },
      {
        title: 'Pentatonic Box Climb',
        key: 'A', mood: ['Rock','Exercise','Dean Ween'],
        description: 'Runs straight up and down position 1 in A minor pentatonic. Use this as your warm-up. Keep each note even — use a metronome. Once clean, add a slight rake and let notes slightly overlap for a bluesier feel.',
        techniques: ['Alternate picking','Position 1 box'],
        tab: `e|---5---8---|
B|---5---8---|
G|---5---7---|
D|---5---7---|
A|---5---7---|
E|---5---8---|`,
        notes: [
          {si:0,f:5,dur:150,t:'pick'},{si:0,f:8,dur:150,t:'pick'},
          {si:1,f:5,dur:150,t:'pick'},{si:1,f:7,dur:150,t:'pick'},
          {si:2,f:5,dur:150,t:'pick'},{si:2,f:7,dur:150,t:'pick'},
          {si:3,f:5,dur:150,t:'pick'},{si:3,f:7,dur:150,t:'pick'},
          {si:4,f:5,dur:150,t:'pick'},{si:4,f:8,dur:150,t:'pick'},
          {si:5,f:5,dur:150,t:'pick'},{si:5,f:8,dur:300,t:'vibrato'},
        ]
      },
      {
        title: 'Call and Response Phrase',
        key: 'E', mood: ['Expressive','Space','Knopfler-style'],
        description: 'Play the first phrase — pause 2 full seconds — then answer it. The silence is as important as the notes. This teaches Hazel and Knopfler\'s most important skill: space. Do not fill the gap.',
        techniques: ['Space','Vibrato','Dynamic control'],
        tab: `e|---0---3b4~~---3---0---|  (pause 2 sec)
B|---0---3-----------0---|
G|---0-------------------|
D|-----------------------|
A|-----------------------|
E|-----------------------|`,
        notes: [
          {si:5,f:0,dur:200,t:'pick'},{si:4,f:0,dur:200,t:'pick'},{si:5,f:3,dur:600,t:'bend',bendTo:1},
          {si:5,f:3,dur:200,t:'pick'},{si:5,f:0,dur:400,t:'pick'},
          {si:4,f:0,dur:600,t:'vibrato'},
        ]
      },
    ]
  },

  // ── MAJOR PENTATONIC ────────────────────────────────────────────────────
  {
    scaleId: 'majpent',
    scaleName: 'Major Pentatonic',
    riffs: [
      {
        title: 'Knopfler Country Phrase',
        key: 'G', mood: ['Country','Melodic','Knopfler'],
        description: 'No pick — fingers only. Thumb on the low strings, index and middle on the treble. This is Knopfler\'s exact approach. Let every note ring and bleed into the next. The open G string drone underneath makes it sing.',
        techniques: ['Fingerpicking','Open string drone','Major pentatonic'],
        tab: `e|---3---5---3---0---|
B|---3-------3---0---|
G|---0---4---0---0---|
D|---0---5---0---0---|
A|---2---5---2---0---|
E|---3---3---3---2---|`,
        notes: [
          {si:0,f:3,dur:200,t:'pick'},{si:1,f:2,dur:200,t:'pick'},{si:5,f:3,dur:200,t:'pick'},
          {si:5,f:5,dur:200,t:'pick'},{si:4,f:5,dur:200,t:'pick'},{si:5,f:3,dur:200,t:'pick'},
          {si:5,f:0,dur:200,t:'pick'},{si:4,f:0,dur:200,t:'pick'},{si:3,f:0,dur:400,t:'vibrato'},
        ]
      },
      {
        title: 'Bright Ascending Run',
        key: 'D', mood: ['Bright','Uplifting','Major feel'],
        description: 'Pure major pentatonic brightness. This phrase resolves upward — it sounds finished and arrived. Notice how different it feels compared to the minor pentatonic. This is the sound of Sultans of Swing and Romeo and Juliet.',
        techniques: ['Ascending run','Major resolution'],
        tab: `e|---------10---12---14---|
B|---10---12---14---------|
G|---9---11---12----------|
D|---9---12---------------|
A|---9---12---------------|
E|---10---12--------------|`,
        notes: [
          {si:0,f:10,dur:160},{si:0,f:12,dur:160},{si:1,f:9,dur:160},{si:1,f:12,dur:160},
          {si:2,f:10,dur:160},{si:2,f:12,dur:160},{si:3,f:9,dur:160},{si:3,f:11,dur:160},
          {si:4,f:10,dur:160},{si:4,f:12,dur:160},{si:5,f:10,dur:400,t:'vibrato'},
        ]
      },
    ]
  },

  // ── BLUES SCALE ─────────────────────────────────────────────────────────
  {
    scaleId: 'blues',
    scaleName: 'Blues Scale',
    riffs: [
      {
        title: 'The Blue Note Bend',
        key: 'E', mood: ['Blues','Tension','Grit'],
        description: 'The flat 5 (Bb) is the blue note — fret 6 on the B string. Bend it up slightly (quarter step, not a full half step) and let it clash. Then release to A. That dissonance is the entire sound of blues guitar. Hazel and Dean Ween both use this constantly.',
        techniques: ['Quarter bend','Blue note','b5 tension'],
        tab: `e|-----------------------------------|
B|---5---6b~---6---5---3---5---3-----|
G|---5---5---------5---3---5---3-----|
D|-----------------------------------|
A|-----------------------------------|
E|-----------------------------------|`,
        notes: [
          {si:4,f:5,dur:200,t:'pick'},{si:4,f:6,dur:400,t:'bend',bendTo:0.5},
          {si:4,f:6,dur:200,t:'pick'},{si:4,f:5,dur:200,t:'pick'},
          {si:4,f:3,dur:200,t:'pick'},{si:4,f:5,dur:200,t:'pick'},{si:4,f:3,dur:400,t:'pick'},
        ]
      },
      {
        title: 'Slow Blues Cry',
        key: 'A', mood: ['Slow Blues','Hazel','Emotional'],
        description: 'This is Maggot Brain territory. Play each note at half the speed you think is right. The bend on fret 8 should take a full second to arrive at the top — then hold it there with wide, slow vibrato. Count to 3 before the next note.',
        techniques: ['Slow bend','Wide vibrato','Space'],
        tab: `e|---8b10~~~~~~~~~~---8---5-----------|
B|---8-----------------8---5---8------|
G|------------------------------------|
D|------------------------------------|
A|------------------------------------|
E|------------------------------------|`,
        notes: [
          {si:5,f:8,dur:800,t:'bend',bendTo:2},{si:5,f:8,dur:300,t:'vibrato'},
          {si:5,f:8,dur:250,t:'pick'},{si:5,f:5,dur:250,t:'pick'},
          {si:4,f:8,dur:250,t:'pick'},{si:4,f:5,dur:250,t:'pick'},{si:4,f:8,dur:600,t:'vibrato'},
        ]
      },
      {
        title: 'Shuffle Turnaround',
        key: 'E', mood: ['Shuffle','12-bar','Rock'],
        description: 'Classic 12-bar blues turnaround. The rhythm is shuffle — long-short, long-short. Feel the swing in it. This is the backbone of every blues and rock rhythm part ever recorded.',
        techniques: ['Shuffle feel','Turnaround','Rhythm'],
        tab: `e|--------------------------------|
B|--------------------------------|
G|--------------------------------|
D|---2---2---3---3---4---4---5----|
A|---2---2---3---3---4---4---5----|
E|---0---0---0---0---0---0---0----|`,
        notes: [
          {si:0,f:0,dur:120},{si:1,f:2,dur:120},{si:0,f:0,dur:120},{si:1,f:2,dur:240},
          {si:0,f:0,dur:120},{si:1,f:3,dur:120},{si:0,f:0,dur:120},{si:1,f:3,dur:240},
          {si:0,f:0,dur:120},{si:1,f:4,dur:120},{si:0,f:0,dur:120},{si:1,f:4,dur:240},
          {si:0,f:0,dur:120},{si:1,f:5,dur:400,t:'vibrato'},
        ]
      },
    ]
  },

  // ── NATURAL MINOR ───────────────────────────────────────────────────────
  {
    scaleId: 'natmin',
    scaleName: 'Natural Minor',
    riffs: [
      {
        title: 'Aeolian Descending Phrase',
        key: 'E', mood: ['Dark','Melodic','Mournful'],
        description: 'Descends through the full natural minor scale. The F# and C give it a more complete melodic character than the pentatonic — more notes to work with, more color. This is the phrasing style Ronson used in his composed solos.',
        techniques: ['Full scale run','Melodic descend','Classical phrasing'],
        tab: `e|---12---13---12---10---8---7---5---3---0---|
B|-------------------------------------------|
G|-------------------------------------------|
D|-------------------------------------------|
A|-------------------------------------------|
E|-------------------------------------------|`,
        notes: [
          {si:5,f:12,dur:180},{si:5,f:13,dur:180},{si:5,f:12,dur:180},{si:5,f:10,dur:180},
          {si:5,f:8,dur:180},{si:5,f:7,dur:180},{si:5,f:5,dur:180},{si:5,f:3,dur:180},{si:5,f:0,dur:500,t:'vibrato'},
        ]
      },
      {
        title: 'Dark Melodic Phrase',
        key: 'A', mood: ['Minor','Ronson','Tense'],
        description: 'Moves through the i, VI, VII progression (Am, F, G) using natural minor scale tones. This is the harmonic movement underneath a lot of classic rock — Bowie, Knopfler, Zappa all used it. The C note on the B string is what makes it feel minor and dark.',
        techniques: ['Position shift','i-VI-VII movement','Legato'],
        tab: `e|---8---10---8---5-----------5---8---|
B|---5-----------8---6---5---6--------|
G|------------------------------------|
D|------------------------------------|
A|------------------------------------|
E|------------------------------------|`,
        notes: [
          {si:5,f:8,dur:200},{si:5,f:10,dur:200},{si:5,f:8,dur:200},{si:5,f:5,dur:200},
          {si:4,f:8,dur:200},{si:4,f:6,dur:200},{si:4,f:5,dur:200},{si:4,f:6,dur:200},
          {si:5,f:5,dur:200},{si:5,f:8,dur:500,t:'vibrato'},
        ]
      },
    ]
  },

  // ── MAJOR SCALE ─────────────────────────────────────────────────────────
  {
    scaleId: 'majscl',
    scaleName: 'Major Scale',
    riffs: [
      {
        title: 'Sultans of Swing Intro Feel',
        key: 'D', mood: ['Knopfler','Fingerpicking','Harp-like'],
        description: 'Based on Knopfler\'s approach on Sultans of Swing — open string drone on D while the melody climbs above it. Use your fingers, no pick. Thumb on the low D string, index and middle on the melody. Let strings ring into each other.',
        techniques: ['Fingerpicking','Open string drone','Pull-off'],
        tab: `e|---10---12---14---14---12---10---|
B|---10---12---10---10---10---10---|
G|---9----11---11---11---9----9----|
D|---0----0----0----0----0----0----|
A|---------------------------------|
E|---------------------------------|`,
        notes: [
          {si:2,f:0,dur:100},{si:3,f:9,dur:200},{si:4,f:10,dur:200},{si:5,f:10,dur:200},
          {si:2,f:0,dur:100},{si:3,f:11,dur:200},{si:4,f:12,dur:200},{si:5,f:12,dur:200},
          {si:2,f:0,dur:100},{si:3,f:12,dur:200},{si:4,f:14,dur:200},{si:5,f:14,dur:400,t:'vibrato'},
        ]
      },
      {
        title: 'Classical Ascending Sequence',
        key: 'G', mood: ['Classical','Bright','Ronson'],
        description: 'Sequences through the G major scale in thirds — every two notes skip a scale degree. This is a classical technique that Ronson used to give his solos that composed, hymn-like quality. Practice slowly until the pattern feels automatic.',
        techniques: ['Diatonic thirds','Sequence','Classical movement'],
        tab: `e|---3---5---5---7---7---8---8---10---|
B|---3---3---5---5---7---7---8----8---|
G|---4---4---5---5---7---7---9----9---|
D|------------------------------------|
A|------------------------------------|
E|------------------------------------|`,
        notes: [
          {si:5,f:3,dur:150},{si:4,f:3,dur:150},{si:5,f:5,dur:150},{si:4,f:3,dur:150},
          {si:5,f:5,dur:150},{si:4,f:5,dur:150},{si:5,f:7,dur:150},{si:4,f:5,dur:150},
          {si:5,f:7,dur:150},{si:4,f:7,dur:150},{si:5,f:8,dur:150},{si:4,f:7,dur:150},
          {si:5,f:8,dur:150},{si:4,f:8,dur:400,t:'vibrato'},
        ]
      },
    ]
  },

  // ── MIXOLYDIAN ──────────────────────────────────────────────────────────
  {
    scaleId: 'mixo',
    scaleName: 'Mixolydian',
    riffs: [
      {
        title: 'Rock Vamp Phrase',
        key: 'A', mood: ['Rock','Zappa','Knopfler','Bluesy'],
        description: 'The flat 7 (G note) is what makes this Mixolydian and not just major. Emphasize it. This is the sound of hard rock guitar — one foot in major brightness, one foot in blues darkness. Zappa used this exact sound on Yo Mama.',
        techniques: ['b7 emphasis','Mixolydian character','Rock phrasing'],
        tab: `e|---5---7---8---7---5---7---5--------|
B|---5---7---8---7---5---7---5--------|
G|---4---6---7---6---4---6---4--------|
D|------------------------------------|
A|------------------------------------|
E|------------------------------------|`,
        notes: [
          {si:5,f:5,dur:150},{si:5,f:7,dur:150},{si:5,f:8,dur:300,t:'vibrato'},
          {si:5,f:7,dur:150},{si:5,f:5,dur:150},{si:5,f:7,dur:150},{si:5,f:5,dur:150},
          {si:4,f:5,dur:150},{si:4,f:7,dur:150},{si:4,f:8,dur:400,t:'vibrato'},
        ]
      },
      {
        title: 'Celtic Mixolydian Flow',
        key: 'D', mood: ['Celtic','Knopfler','Telegraph Road'],
        description: 'Knopfler\'s Telegraph Road uses this exact Mixolydian color. The G natural note (b7 of A Mixolydian) against the D bass creates that uniquely bittersweet folk-rock feeling. Play it fingerstyle with a slight swing.',
        techniques: ['b7 color','Celtic phrasing','Fingerstyle'],
        tab: `e|---10---12---10---9---10---12---14---|
B|---10---10---10---10---10---10---10--|
G|---9----11---9----9----9----11---11--|
D|---0----0----0----0----0----0----0---|
A|-------------------------------------|
E|-------------------------------------|`,
        notes: [
          {si:2,f:0,dur:100},{si:3,f:9,dur:200},{si:4,f:10,dur:300},
          {si:2,f:0,dur:100},{si:3,f:11,dur:200},{si:4,f:10,dur:200},
          {si:2,f:0,dur:100},{si:3,f:9,dur:200},{si:4,f:9,dur:200},
          {si:2,f:0,dur:100},{si:3,f:11,dur:200},{si:4,f:12,dur:400,t:'vibrato'},
        ]
      },
    ]
  },

  // ── DORIAN ──────────────────────────────────────────────────────────────
  {
    scaleId: 'dorian',
    scaleName: 'Dorian',
    riffs: [
      {
        title: 'Hazel Vamp Line',
        key: 'E', mood: ['Psychedelic','Hazel','Soulful','Hopeful'],
        description: 'The raised 6th (C#) is what makes Dorian sound soulful rather than just dark. Land on it — feel how it lifts the phrase. This is the note Hazel keeps coming back to in his Maggot Brain solo. Play it slow and let every note breathe.',
        techniques: ['Dorian raised 6th','Sustain','Hazel space'],
        tab: `e|---0---2---3---2---0---------------|
B|---0---2---3---2---0---3---2---0---|
G|---0---2-----------2---2---2---0---|
D|-----------------------------------|
A|-----------------------------------|
E|-----------------------------------|`,
        notes: [
          {si:5,f:0,dur:300},{si:5,f:2,dur:300},{si:5,f:3,dur:300,t:'vibrato'},
          {si:5,f:2,dur:200},{si:5,f:0,dur:200},
          {si:4,f:3,dur:300},{si:4,f:2,dur:200},{si:4,f:0,dur:500,t:'vibrato'},
        ]
      },
      {
        title: 'Funk-Rock Dorian Groove',
        key: 'A', mood: ['Funk','Groove','Dorian'],
        description: 'Dorian over a static A bass note — this is the harmonic world of a huge amount of rock and funk. The F# is the raised 6th that separates Dorian from natural minor. Snap the notes rhythmically — mute between notes with your palm for a choppier feel.',
        techniques: ['Palm mute','Rhythmic groove','Dorian color'],
        tab: `e|--------------------------------------|
B|---5---8---5---8---5---6---5---8------|
G|---5---7---5---7---5---7---4---7------|
D|---5---7---5---7---5---7---5---7------|
A|---0---0---0---0---0---0---0---0------|
E|--------------------------------------|`,
        notes: [
          {si:1,f:0,dur:100},{si:4,f:5,dur:150},{si:1,f:0,dur:80},{si:4,f:8,dur:150},
          {si:1,f:0,dur:100},{si:4,f:5,dur:150},{si:1,f:0,dur:80},{si:4,f:8,dur:150},
          {si:1,f:0,dur:100},{si:4,f:5,dur:150},{si:1,f:0,dur:80},{si:4,f:6,dur:150},
          {si:1,f:0,dur:100},{si:4,f:5,dur:300,t:'vibrato'},
        ]
      },
    ]
  },

  // ── PHRYGIAN ────────────────────────────────────────────────────────────
  {
    scaleId: 'phrygian',
    scaleName: 'Phrygian',
    riffs: [
      {
        title: 'Dark Tension Riff',
        key: 'E', mood: ['Dark','Exotic','Zappa','Atmospheric'],
        description: 'The flat 2nd (F natural) is the defining interval of Phrygian — that half-step above the root creates immediate tension and danger. Zappa used this for his darkest, most atmospheric passages. Let the F note ring and feel the unease.',
        techniques: ['b2 tension','Phrygian character','Dark atmosphere'],
        tab: `e|---0---1---0---3---0---1---0--------|
B|---0---1---0---3---0---1---0--------|
G|---0---2---0---4---0---2---0--------|
D|---2---2---2---4---2---2---2--------|
A|---2---0---2---0---2---0---2--------|
E|---0---0---0---0---0---0---0--------|`,
        notes: [
          {si:0,f:0,dur:150},{si:5,f:0,dur:150},
          {si:0,f:0,dur:150},{si:5,f:1,dur:300,t:'vibrato'},
          {si:0,f:0,dur:150},{si:5,f:0,dur:150},
          {si:0,f:2,dur:150},{si:5,f:3,dur:300,t:'vibrato'},
          {si:0,f:0,dur:150},{si:5,f:0,dur:400},
        ]
      },
      {
        title: 'Spanish-Flamenco Phrase',
        key: 'E', mood: ['Spanish','Exotic','Flamenco-rock'],
        description: 'Phrygian has a natural Spanish/flamenco quality because flamenco music is built on it. This riff uses the classic Phrygian descend (E-D-C-B-Am) heard in countless metal and exotic rock passages. Fast pull-offs on the way down.',
        techniques: ['Pull-offs','Phrygian descend','Spanish character'],
        tab: `e|---0---0---0---0---0---0---0---0----|
B|---1---1---0---0---1---1---0---0----|
G|---0---2---0---2---0---2---0---2----|
D|---2---2---2---2---0---0---0---0----|
A|---3---0---2---0---2---0---0---0----|
E|---0---0---3---0---2---0---1---0----|`,
        notes: [
          {si:0,f:0,dur:120},{si:0,f:0,dur:120},{si:1,f:3,dur:200},
          {si:0,f:0,dur:120},{si:1,f:2,dur:200},
          {si:0,f:0,dur:120},{si:1,f:2,dur:200},
          {si:0,f:0,dur:120},{si:1,f:1,dur:400,t:'vibrato'},
        ]
      },
    ]
  },

  // ── LYDIAN ──────────────────────────────────────────────────────────────
  {
    scaleId: 'lydian',
    scaleName: 'Lydian',
    riffs: [
      {
        title: 'Watermelon in Easter Hay Feel',
        key: 'E', mood: ['Zappa','Floating','Otherworldly','Emotional'],
        description: 'The #4 (A# instead of A) is what makes Lydian sound like it\'s floating above the ground. This is the scale Zappa used for Watermelon in Easter Hay — his most emotional piece. Each note should feel weightless. Play it slowly with your eyes closed.',
        techniques: ['#4 Lydian tone','Sustain','Zappa floating quality'],
        tab: `e|---4---6---4---2---4---6---9---11---|
B|---5---7---5---4---5---7---9----9---|
G|---4---6---4---4---4---6---9----9---|
D|------------------------------------|
A|------------------------------------|
E|------------------------------------|`,
        notes: [
          {si:5,f:4,dur:300},{si:5,f:6,dur:300},{si:5,f:4,dur:300},
          {si:5,f:2,dur:300},{si:5,f:4,dur:300},{si:5,f:6,dur:400,t:'vibrato'},
          {si:5,f:9,dur:300},{si:5,f:11,dur:600,t:'vibrato'},
        ]
      },
      {
        title: 'Lydian Shimmer Arpeggio',
        key: 'G', mood: ['Bright','Floating','Dreamy'],
        description: 'The Lydian mode\'s raised 4th creates a shimmer and brightness that major scale can\'t match. Each note here is chosen to emphasize that #4 (C#). Play it slowly, let each note ring into the next, and feel the floating quality Zappa chased his whole career.',
        techniques: ['Arpeggio','Lydian #4','Floating quality'],
        tab: `e|---3---5---6---7---5---3---2---3---|
B|---3---5---6---7---5---3---0---3---|
G|---4---4---6---7---4---4---0---4---|
D|---5---5---5---7---5---5---0---5---|
A|---5---5---5---5---5---5---2---5---|
E|---3---3---3---3---3---3---3---3---|`,
        notes: [
          {si:0,f:3,dur:120},{si:1,f:5,dur:120},{si:2,f:5,dur:120},{si:3,f:4,dur:120},
          {si:4,f:3,dur:120},{si:5,f:3,dur:120},{si:4,f:5,dur:120},{si:3,f:6,dur:120},
          {si:2,f:7,dur:120},{si:1,f:7,dur:120},{si:0,f:7,dur:400,t:'vibrato'},
        ]
      },
    ]
  },

  // ── HARMONIC MINOR ──────────────────────────────────────────────────────
  {
    scaleId: 'harmmin',
    scaleName: 'Harmonic Minor',
    riffs: [
      {
        title: 'Ronson Classical Phrase',
        key: 'E', mood: ['Classical','Dramatic','Ronson','Tension'],
        description: 'The raised 7th (D#) creates a dramatic pull back to the root. This is the note that makes harmonic minor sound classical and theatrical — the interval between the b6 and the raised 7th is an augmented 2nd, the most exotic interval in Western music.',
        techniques: ['Augmented 2nd','D# raised 7th','Classical drama'],
        tab: `e|---0---1---3---4---3---1---0---------|
B|---0---1---3---4---3---1---0---------|
G|---0---2---4---4---4---2---0---------|
D|---2---2---2---4---2---2---2---------|
A|---2---0---0---2---0---0---2---------|
E|---0---0---0---0---0---0---0---------|`,
        notes: [
          {si:0,f:0,dur:150},{si:5,f:0,dur:150},{si:5,f:1,dur:150},{si:5,f:3,dur:200},
          {si:5,f:4,dur:400,t:'vibrato'},{si:5,f:3,dur:150},{si:5,f:1,dur:150},
          {si:5,f:0,dur:600,t:'vibrato'},
        ]
      },
      {
        title: 'Middle Eastern Sweep',
        key: 'A', mood: ['Exotic','Dramatic','Harmonic Minor'],
        description: 'The augmented 2nd between G (b7) and G# (raised 7th) in A harmonic minor creates that distinctly Middle Eastern / classical sound. Emphasize the jump between those two notes. This phrase was a Zappa compositional device — the exotic pull.',
        techniques: ['Augmented 2nd jump','Exotic color','Position 1'],
        tab: `e|---5---7---8---9---8---7---5--------|
B|---5---6---9---9---9---6---5--------|
G|---5---7---7---9---7---7---5--------|
D|---5---7---7---7---7---7---5--------|
A|---5---7---7---8---7---7---5--------|
E|---5---7---8---9---8---7---5--------|`,
        notes: [
          {si:0,f:5,dur:150},{si:0,f:7,dur:150},{si:0,f:8,dur:150},{si:0,f:9,dur:400,t:'vibrato'},
          {si:0,f:8,dur:150},{si:0,f:7,dur:150},{si:0,f:5,dur:150},
          {si:1,f:5,dur:150},{si:1,f:7,dur:150},{si:1,f:8,dur:400,t:'vibrato'},
        ]
      },
    ]
  },

  // ── LYDIAN DOMINANT ─────────────────────────────────────────────────────
  {
    scaleId: 'lydmixo',
    scaleName: 'Lydian Dominant',
    riffs: [
      {
        title: 'Zappa Advanced Vamp Phrase',
        key: 'E', mood: ['Zappa','Advanced','Bright-Bluesy'],
        description: 'Lydian Dominant = Lydian #4 + flat 7. Bright but unresolved. This is Zappa\'s most advanced scalar blend — it sounds both colorful and bluesy simultaneously. The A# (#4) and D (b7) together create his signature late-period harmonic flavor.',
        techniques: ['#4 Lydian','b7 Mixolydian','Zappa blend'],
        tab: `e|---4---6---9---11---9---6---4---2---|
B|---5---7---9----9---9---7---5---5---|
G|---4---6---9----9---9---6---4---4---|
D|------------------------------------|
A|------------------------------------|
E|------------------------------------|`,
        notes: [
          {si:5,f:4,dur:200},{si:5,f:6,dur:200},{si:5,f:9,dur:300,t:'vibrato'},
          {si:5,f:11,dur:400,t:'vibrato'},{si:5,f:9,dur:200},
          {si:5,f:6,dur:200},{si:5,f:4,dur:200},{si:5,f:2,dur:500,t:'vibrato'},
        ]
      },
    ]
  },

  // ── DIMINISHED ──────────────────────────────────────────────────────────
  {
    scaleId: 'diminished',
    scaleName: 'Diminished (HW)',
    riffs: [
      {
        title: 'Zappa Angular Run',
        key: 'E', mood: ['Angular','Atonal','Zappa','Outside'],
        description: 'The half-whole diminished scale is symmetrical — the same pattern repeats every 3 frets. This creates a disorienting, angular quality Zappa loved. The run sounds "outside" and unsettling. Play it fast and confidently — commit to the weirdness.',
        techniques: ['Symmetrical scale','Outside playing','Rapid run'],
        tab: `e|---0---1---3---4---6---7---9---10---|
B|---0---1---3---4---6---7---9---10---|
G|---1---2---4---5---7---8---10--11---|
D|---1---2---4---5---7---8---10--11---|
A|---0---1---3---4---6---7---9---10---|
E|---0---1---3---4---6---7---9---10---|`,
        notes: [
          {si:0,f:0,dur:100},{si:0,f:1,dur:100},{si:0,f:3,dur:100},{si:0,f:4,dur:100},
          {si:1,f:3,dur:100},{si:1,f:4,dur:100},{si:2,f:4,dur:100},{si:2,f:5,dur:100},
          {si:3,f:4,dur:100},{si:3,f:5,dur:100},{si:4,f:6,dur:100},{si:4,f:7,dur:100},
          {si:5,f:6,dur:100},{si:5,f:7,dur:100},{si:5,f:9,dur:400,t:'vibrato'},
        ]
      },
    ]
  },

  // ── WHOLE TONE ──────────────────────────────────────────────────────────
  {
    scaleId: 'wholetone',
    scaleName: 'Whole Tone',
    riffs: [
      {
        title: 'Floating Zappa Phrase',
        key: 'C', mood: ['Dreamy','Zappa','Floating','Surreal'],
        description: 'Every interval is equal — there is no sense of gravity or resolution. The whole tone scale floats permanently. Zappa used this for surreal, dreamlike passages. Play it slowly and let each note blur into the next. There is no "home" — that is the point.',
        techniques: ['Whole tone equality','No resolution','Sustained blur'],
        tab: `e|---3---5---7---9---11---3---5---7---|
B|---3---5---7---9---11---3---5---7---|
G|---4---6---8---10---0---4---6---8---|
D|---5---7---9---11---1---5---7---9---|
A|---3---5---7---9----11--3---5---7---|
E|---3---5---7---9----11--3---5---7---|`,
        notes: [
          {si:0,f:3,dur:300},{si:0,f:5,dur:300},{si:0,f:7,dur:300},{si:0,f:9,dur:300},
          {si:0,f:11,dur:300},{si:1,f:11,dur:300},{si:1,f:9,dur:300},
          {si:1,f:7,dur:300},{si:1,f:5,dur:300},{si:1,f:3,dur:600,t:'vibrato'},
        ]
      },
    ]
  },

  // ── MINOR BLUES EXT ─────────────────────────────────────────────────────
  {
    scaleId: 'bluesext',
    scaleName: 'Minor Blues Ext',
    riffs: [
      {
        title: 'Full Blues Vocabulary',
        key: 'E', mood: ['Blues','Full vocabulary','Passing tones'],
        description: 'This uses all the passing tones of the extended blues scale — the chromatic movement between Bb and B is where the tension and release lives. Play the Bb as a quarter-tone bend (barely push it up). The C is a passing tone — don\'t land on it, use it as a bridge.',
        techniques: ['Chromatic passing','Quarter bend','Bb-B movement'],
        tab: `e|---0---3---4---3---0---|
B|---0---3---4---3---0---|
G|---0---2---3---2---0---|
D|---0---2---3---2---0---|
A|---0---2---3---2---0---|
E|---0---3---4---3---0---|`,
        notes: [
          {si:0,f:0,dur:150},{si:0,f:3,dur:150},{si:0,f:4,dur:200,t:'bend',bendTo:0.5},
          {si:0,f:3,dur:150},{si:0,f:0,dur:400,t:'vibrato'},
          {si:5,f:0,dur:150},{si:5,f:3,dur:150},{si:5,f:4,dur:200,t:'bend',bendTo:0.5},
          {si:5,f:3,dur:150},{si:5,f:0,dur:500,t:'vibrato'},
        ]
      },
    ]
  },
];

// ── Build riff UI ─────────────────────────────────────────────────────────
let activeRiffPlayers = {};

function buildRiffLibrary() {
  const tabsEl = document.getElementById('riff-scale-tabs');
  const panelsEl = document.getElementById('riff-panels');
  tabsEl.innerHTML=''; panelsEl.innerHTML='';

  RIFF_LIBRARY.forEach((scaleGroup, gi) => {
    const sc = ALL_SCALES.find(s=>s.id===scaleGroup.scaleId);
    const isZappa = sc && sc.zappa;

    // Tab button
    const tab = document.createElement('button');
    tab.className = 'riff-tab-btn' + (gi===0?' active':'') + (isZappa?' zappa-tab':'');
    tab.textContent = scaleGroup.scaleName;
    tab.onclick = () => {
      document.querySelectorAll('.riff-tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.riff-panel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`riff-panel-${gi}`).classList.add('active');
    };
    tabsEl.appendChild(tab);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'riff-panel' + (gi===0?' active':'');
    panel.id = `riff-panel-${gi}`;

    const grid = document.createElement('div');
    grid.className = 'riff-grid';

    scaleGroup.riffs.forEach((riff, ri) => {
      const riffId = `${gi}-${ri}`;
      const card = document.createElement('div');
      card.className = 'riff-card';

      const moodTags = riff.mood.map(m=>`<span class="riff-mood-tag">${m}</span>`).join('');
      const techList = riff.techniques.map(t=>`<span class="technique">${t}</span>`).join(' · ');

      card.innerHTML = `
        <div class="riff-card-header">
          <div>
            <div class="riff-card-title">${riff.title}</div>
            <div class="riff-card-meta">Key of ${riff.key} · ${scaleGroup.scaleName}<br>${moodTags}</div>
          </div>
          <button class="riff-play-btn" id="riff-btn-${riffId}" onclick="toggleRiffPlay('${riffId}')">▶ Play</button>
        </div>
        <div class="riff-tab-display" id="riff-tab-${riffId}">${riff.tab}</div>
        <div class="speed-row">
          <label>Tempo</label>
          <input type="range" id="riff-speed-${riffId}" min="0.3" max="2.0" step="0.1" value="1.0"
            oninput="document.getElementById('riff-speed-val-${riffId}').textContent=this.value+'x'">
          <span id="riff-speed-val-${riffId}">1.0x</span>
        </div>
        <div class="riff-description">
          <div style="margin-bottom:4px">${techList}</div>
          ${riff.description}
        </div>
      `;
      grid.appendChild(card);
    });

    panel.appendChild(grid);
    panelsEl.appendChild(panel);
  });
}

// ── Riff playback engine ──────────────────────────────────────────────────
function toggleRiffPlay(riffId) {
  if (activeRiffPlayers[riffId]) {
    stopRiffPlay(riffId);
  } else {
    // Stop any other playing riffs
    Object.keys(activeRiffPlayers).forEach(id => stopRiffPlay(id));
    startRiffPlay(riffId);
  }
}

function startRiffPlay(riffId) {
  const [gi, ri] = riffId.split('-').map(Number);
  const riff = RIFF_LIBRARY[gi].riffs[ri];
  const btn = document.getElementById(`riff-btn-${riffId}`);
  const speedEl = document.getElementById(`riff-speed-${riffId}`);
  const speed = speedEl ? parseFloat(speedEl.value) : 1.0;
  const vol = parseInt(document.getElementById('vol-slider').value)/100;

  btn.textContent = '■ Stop';
  btn.classList.add('playing');

  getAudioCtx();
  let noteIdx = 0;
  let loopCount = 0;

  function playNext() {
    if (!activeRiffPlayers[riffId]) return;
    if (noteIdx >= riff.notes.length) {
      noteIdx = 0; loopCount++;
      if (loopCount >= 3) { stopRiffPlay(riffId); return; }
    }
    const note = riff.notes[noteIdx];
    const dur = Math.round(note.dur / speed);
    const ctx = getAudioCtx();
    const freq = fretToHz(note.si, note.f);
    const technique = note.t || 'pick';
    const noteVol = technique === 'bend' ? vol*0.9 : technique === 'vibrato' ? vol*0.85 : vol*0.75;

    if (technique === 'bend') {
      playBendNote(ctx.currentTime, freq, dur/1000, noteVol, note.bendTo);
    } else if (technique === 'vibrato') {
      playVibratoNote(ctx.currentTime, freq, dur/1000, noteVol);
    } else {
      playPluck(ctx.currentTime, freq, noteVol);
    }

    noteIdx++;
    activeRiffPlayers[riffId] = setTimeout(playNext, dur);
  }

  activeRiffPlayers[riffId] = true;
  playNext();
}

function stopRiffPlay(riffId) {
  if (activeRiffPlayers[riffId]) {
    clearTimeout(activeRiffPlayers[riffId]);
    delete activeRiffPlayers[riffId];
  }
  const btn = document.getElementById(`riff-btn-${riffId}`);
  if (btn) { btn.textContent='▶ Play'; btn.classList.remove('playing'); }
}

buildRiffLibrary();
