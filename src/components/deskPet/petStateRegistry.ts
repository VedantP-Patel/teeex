// src/components/deskPet/petStateRegistry.ts
export type PetCategory = 'academic' | 'feline' | 'mischief' | 'toys' | 'wellness';
export type BubbleVariant = 'success' | 'warning' | 'fail' | 'knuth';
export type EyeMode = 'sleep' | 'slow-blink' | 'loaf' | 'dizzy' | 'glare' | 'happy' | 'fail' | 'normal';
export type MouthMode = 'yawn' | 'hiss' | 'blep' | 'flehmen' | 'default';
export type EditorCursorContext = 'math' | 'tikz' | 'table' | 'figure' | 'bib' | 'preamble' | 'text';
export type CircadianBucket = 'morning' | 'afternoon' | 'evening' | 'lateNight';

export type PropLayerType =
    | 'none'
    | 'resting'
    | 'typing-paws'
    | 'compiling-scholar'
    | 'knuth-texbook'
    | 'knuth-check'
    | 'box-sit'
    | 'fish-feast'
    | 'knock-mug'
    | 'coffee-sip'
    | 'origami-crane'
    | 'paper-shred'
    | 'hairball-cough'
    | 'keyboard-sprawl'
    | 'swat-cursor'
    | 'belly-flop'
    | 'ear-scratch'
    | 'face-wash'
    | 'butterfly-bat'
    | 'yoga-stretch'
    | 'facepalm-paw'
    | 'knead-dough'
    | 'cello-leg'
    | 'qed-celebration'
    | 'focus-scholar'
    | 'loaf'
    | 'lifted-scruff'
    | 'tape-measure'
    | 'magnifier';

export interface PetStateSpec {
    id: string;
    label: string;
    category: PetCategory;
    durationMs: number;
    bubble?: {
        icon: string;
        text: string;
        variant: BubbleVariant;
    };
    eyeMode: EyeMode;
    mouthMode: MouthMode;
    propLayer: PropLayerType;
    jukeboxVisible?: boolean;
    circadianWeight?: Partial<Record<CircadianBucket, number>>;
    contextAffinity?: EditorCursorContext[];
}

export const PET_STATE_REGISTRY: Record<string, PetStateSpec> = {
    idle: {
        id: 'idle',
        label: 'Idle Perch',
        category: 'feline',
        durationMs: 0,
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: false,
    },
    walk: {
        id: 'walk',
        label: 'Ledge Patrol',
        category: 'feline',
        durationMs: 3200,
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: false,
    },
    loaf: {
        id: 'loaf',
        label: 'Loaf Mode',
        category: 'feline',
        durationMs: 0,
        eyeMode: 'loaf',
        mouthMode: 'default',
        propLayer: 'loaf',
        jukeboxVisible: true,
    },
    sleep: {
        id: 'sleep',
        label: 'Catnap',
        category: 'wellness',
        durationMs: 0,
        eyeMode: 'sleep',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'lifted-scruff': {
        id: 'lifted-scruff',
        label: 'Scruff Carry',
        category: 'feline',
        durationMs: 0,
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'lifted-scruff',
        jukeboxVisible: false,
    },
    'typing-paws': {
        id: 'typing-paws',
        label: 'Bongo Typing',
        category: 'academic',
        durationMs: 900,
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'typing-paws',
        jukeboxVisible: true,
    },
    'compiling-scholar': {
        id: 'compiling-scholar',
        label: 'Typesetting',
        category: 'academic',
        durationMs: 0,
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'compiling-scholar',
        jukeboxVisible: true,
    },
    'compile-success': {
        id: 'compile-success',
        label: 'Q.E.D. Build',
        category: 'academic',
        durationMs: 3500,
        bubble: { icon: '\u2728', text: 'Q.E.D.', variant: 'success' },
        eyeMode: 'happy',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'compile-warning': {
        id: 'compile-warning',
        label: 'Margin Check',
        category: 'academic',
        durationMs: 3800,
        bubble: { icon: '\u{1F4D0}', text: 'Margins ok', variant: 'warning' },
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'tape-measure',
        jukeboxVisible: true,
        contextAffinity: ['tikz', 'table', 'figure'],
    },
    'compile-fail': {
        id: 'compile-fail',
        label: 'Log Detective',
        category: 'academic',
        durationMs: 4500,
        bubble: { icon: '\u2753', text: 'Jump to error', variant: 'fail' },
        eyeMode: 'fail',
        mouthMode: 'default',
        propLayer: 'magnifier',
        jukeboxVisible: true,
    },
    'qed-celebration': {
        id: 'qed-celebration',
        label: 'Q.E.D. Medal',
        category: 'academic',
        durationMs: 3600,
        bubble: { icon: '\u{1F3C6}', text: 'Q.E.D. Complete!', variant: 'success' },
        eyeMode: 'happy',
        mouthMode: 'default',
        propLayer: 'qed-celebration',
        jukeboxVisible: true,
    },
    'focus-scholar': {
        id: 'focus-scholar',
        label: 'LaTeX Zen',
        category: 'academic',
        durationMs: 4000,
        bubble: { icon: '\u{1F9D8}', text: 'LaTeX Zen Focus', variant: 'success' },
        eyeMode: 'slow-blink',
        mouthMode: 'default',
        propLayer: 'focus-scholar',
        jukeboxVisible: true,
        contextAffinity: ['math', 'preamble'],
    },
    'knuth-texbook': {
        id: 'knuth-texbook',
        label: 'The TeXbook',
        category: 'academic',
        durationMs: 3600,
        bubble: { icon: '\u{1F4D6}', text: 'The TeXbook', variant: 'knuth' },
        eyeMode: 'happy',
        mouthMode: 'default',
        propLayer: 'knuth-texbook',
        jukeboxVisible: true,
        contextAffinity: ['preamble', 'math'],
    },
    'knuth-check': {
        id: 'knuth-check',
        label: '$2.56 Check',
        category: 'academic',
        durationMs: 3600,
        bubble: { icon: '\u{1F3C6}', text: '$2.56 Bug Reward', variant: 'knuth' },
        eyeMode: 'happy',
        mouthMode: 'default',
        propLayer: 'knuth-check',
        jukeboxVisible: true,
    },
    'coffee-sip': {
        id: 'coffee-sip',
        label: 'Espresso Break',
        category: 'wellness',
        durationMs: 3200,
        bubble: { icon: '\u2615', text: '*Sip...*', variant: 'success' },
        eyeMode: 'slow-blink',
        mouthMode: 'default',
        propLayer: 'coffee-sip',
        jukeboxVisible: true,
        circadianWeight: { morning: 2.2, lateNight: 2.5 },
    },
    'origami-crane': {
        id: 'origami-crane',
        label: 'Origami Fold',
        category: 'toys',
        durationMs: 3200,
        bubble: { icon: '\u{1F54A}\uFE0F', text: 'Origami fold', variant: 'success' },
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'origami-crane',
        jukeboxVisible: true,
        contextAffinity: ['tikz', 'figure'],
    },
    'paper-shred': {
        id: 'paper-shred',
        label: 'Shred Bad Math',
        category: 'mischief',
        durationMs: 2800,
        bubble: { icon: '\u{1F4C4}', text: 'Shredding bad math', variant: 'warning' },
        eyeMode: 'glare',
        mouthMode: 'default',
        propLayer: 'paper-shred',
        jukeboxVisible: true,
        contextAffinity: ['math'],
    },
    'hairball-cough': {
        id: 'hairball-cough',
        label: 'Unclosed Brace',
        category: 'mischief',
        durationMs: 2600,
        bubble: { icon: '\u{1F4E6}', text: '*Agh!* (unclosed brace)', variant: 'warning' },
        eyeMode: 'fail',
        mouthMode: 'yawn',
        propLayer: 'hairball-cough',
        jukeboxVisible: true,
    },
    'keyboard-sprawl': {
        id: 'keyboard-sprawl',
        label: 'Keyboard Sprawl',
        category: 'mischief',
        durationMs: 3400,
        bubble: { icon: '\u2328\uFE0F', text: 'Pet me now!', variant: 'warning' },
        eyeMode: 'slow-blink',
        mouthMode: 'default',
        propLayer: 'keyboard-sprawl',
        jukeboxVisible: true,
        circadianWeight: { afternoon: 1.8, evening: 1.6 },
    },
    'knock-mug': {
        id: 'knock-mug',
        label: 'Mug Tap',
        category: 'mischief',
        durationMs: 2400,
        bubble: { icon: '\u2615', text: 'Oops! (mug tap)', variant: 'warning' },
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'knock-mug',
        jukeboxVisible: true,
    },
    'swat-cursor': {
        id: 'swat-cursor',
        label: 'Cursor Swat',
        category: 'mischief',
        durationMs: 1800,
        bubble: { icon: '\u{1F43E}', text: 'Swat!', variant: 'success' },
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'swat-cursor',
        jukeboxVisible: true,
    },
    'box-sit': {
        id: 'box-sit',
        label: '\\hbox Sit',
        category: 'toys',
        durationMs: 3400,
        eyeMode: 'loaf',
        mouthMode: 'default',
        propLayer: 'box-sit',
        jukeboxVisible: true,
    },
    'fish-feast': {
        id: 'fish-feast',
        label: 'Golden Fish',
        category: 'toys',
        durationMs: 2800,
        eyeMode: 'happy',
        mouthMode: 'default',
        propLayer: 'fish-feast',
        jukeboxVisible: true,
    },
    'belly-flop': {
        id: 'belly-flop',
        label: 'Belly Flop',
        category: 'feline',
        durationMs: 2600,
        eyeMode: 'happy',
        mouthMode: 'default',
        propLayer: 'belly-flop',
        jukeboxVisible: true,
    },
    'ear-scratch': {
        id: 'ear-scratch',
        label: 'Ear Scratch',
        category: 'feline',
        durationMs: 2200,
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'ear-scratch',
        jukeboxVisible: true,
    },
    'nap-yawn': {
        id: 'nap-yawn',
        label: 'Big Yawn',
        category: 'wellness',
        durationMs: 2400,
        eyeMode: 'sleep',
        mouthMode: 'yawn',
        propLayer: 'resting',
        jukeboxVisible: true,
        circadianWeight: { morning: 2.0, lateNight: 2.0 },
    },
    'face-wash': {
        id: 'face-wash',
        label: 'Face Wash',
        category: 'feline',
        durationMs: 2600,
        eyeMode: 'slow-blink',
        mouthMode: 'default',
        propLayer: 'face-wash',
        jukeboxVisible: true,
    },
    'butterfly-bat': {
        id: 'butterfly-bat',
        label: 'Butterfly Bat',
        category: 'toys',
        durationMs: 2800,
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'butterfly-bat',
        jukeboxVisible: true,
    },
    'yoga-stretch': {
        id: 'yoga-stretch',
        label: 'Arch Stretch',
        category: 'wellness',
        durationMs: 2400,
        eyeMode: 'sleep',
        mouthMode: 'default',
        propLayer: 'yoga-stretch',
        jukeboxVisible: true,
        circadianWeight: { morning: 2.4 },
    },
    'facepalm-paw': {
        id: 'facepalm-paw',
        label: 'Syntax Facepalm',
        category: 'mischief',
        durationMs: 2600,
        bubble: { icon: '\u{1F926}', text: '*Sigh* (LaTeX syntax)', variant: 'fail' },
        eyeMode: 'sleep',
        mouthMode: 'default',
        propLayer: 'facepalm-paw',
        jukeboxVisible: true,
    },
    'knead-dough': {
        id: 'knead-dough',
        label: 'Making Biscuits',
        category: 'feline',
        durationMs: 3200,
        bubble: { icon: '\u{1F950}', text: 'Making biscuits', variant: 'success' },
        eyeMode: 'slow-blink',
        mouthMode: 'default',
        propLayer: 'knead-dough',
        jukeboxVisible: true,
    },
    'cello-leg': {
        id: 'cello-leg',
        label: 'Cello Groom',
        category: 'feline',
        durationMs: 2800,
        bubble: { icon: '\u{1F3BB}', text: 'Cello groom pose', variant: 'success' },
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'cello-leg',
        jukeboxVisible: true,
    },
    'slow-blink': {
        id: 'slow-blink',
        label: 'Trust Blink',
        category: 'feline',
        durationMs: 2400,
        bubble: { icon: '\u{1F496}', text: 'Cat love & trust', variant: 'success' },
        eyeMode: 'slow-blink',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'cheek-bunt': {
        id: 'cheek-bunt',
        label: 'Cheek Bunt',
        category: 'feline',
        durationMs: 2200,
        bubble: { icon: '\u{1F970}', text: 'Scent marked', variant: 'success' },
        eyeMode: 'happy',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    blep: {
        id: 'blep',
        label: 'Tiny Blep',
        category: 'feline',
        durationMs: 2600,
        bubble: { icon: '\u{1F445}', text: '*Blep*', variant: 'success' },
        eyeMode: 'normal',
        mouthMode: 'blep',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'midnight-zoomies': {
        id: 'midnight-zoomies',
        label: '3 AM Zoomies',
        category: 'feline',
        durationMs: 3000,
        bubble: { icon: '\u{1F680}', text: '3 AM Zoomies!', variant: 'success' },
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
        circadianWeight: { lateNight: 3.0 },
    },
    'math-zoomies': {
        id: 'math-zoomies',
        label: 'Integral Zoomies',
        category: 'academic',
        durationMs: 3000,
        bubble: { icon: '\u{1F4D0}', text: '\\int Zoomies!', variant: 'success' },
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
        contextAffinity: ['math'],
    },
    'peek-a-boo': {
        id: 'peek-a-boo',
        label: 'Peek-a-Boo',
        category: 'feline',
        durationMs: 2600,
        bubble: { icon: '\u{1F440}', text: 'Peek-a-boo!', variant: 'success' },
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'airplane-ears': {
        id: 'airplane-ears',
        label: 'Airplane Ears',
        category: 'mischief',
        durationMs: 2400,
        bubble: { icon: '\u2708\uFE0F', text: 'Unimpressed', variant: 'warning' },
        eyeMode: 'glare',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'annoyed-hiss': {
        id: 'annoyed-hiss',
        label: 'Spicy Hiss',
        category: 'mischief',
        durationMs: 2000,
        bubble: { icon: '\u{1F63E}', text: '*Hisss!*', variant: 'fail' },
        eyeMode: 'glare',
        mouthMode: 'hiss',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'swat-aggressive': {
        id: 'swat-aggressive',
        label: 'Bap Attack',
        category: 'mischief',
        durationMs: 1800,
        bubble: { icon: '\u{1F4A5}', text: '*WHAP!*', variant: 'fail' },
        eyeMode: 'glare',
        mouthMode: 'default',
        propLayer: 'swat-cursor',
        jukeboxVisible: true,
    },
    'tail-thump': {
        id: 'tail-thump',
        label: 'Tail Thump',
        category: 'mischief',
        durationMs: 2200,
        bubble: { icon: '\u{1F941}', text: '*Thump...*', variant: 'warning' },
        eyeMode: 'glare',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'cold-shoulder': {
        id: 'cold-shoulder',
        label: 'Cold Shoulder',
        category: 'mischief',
        durationMs: 2600,
        bubble: { icon: '\u2744\uFE0F', text: 'Hmph.', variant: 'warning' },
        eyeMode: 'glare',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'glare-judge': {
        id: 'glare-judge',
        label: 'Code Judge',
        category: 'mischief',
        durationMs: 2600,
        bubble: { icon: '\u{1F441}\uFE0F', text: 'Judging your code', variant: 'warning' },
        eyeMode: 'glare',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'dizzy-wobble': {
        id: 'dizzy-wobble',
        label: 'Dizzy Spin',
        category: 'feline',
        durationMs: 2400,
        bubble: { icon: '\u{1F4AB}', text: 'Woah dizzy!', variant: 'warning' },
        eyeMode: 'dizzy',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'drama-flop': {
        id: 'drama-flop',
        label: 'Drama Flop',
        category: 'feline',
        durationMs: 2800,
        bubble: { icon: '\u{1F3AD}', text: 'The melodrama!', variant: 'success' },
        eyeMode: 'sleep',
        mouthMode: 'default',
        propLayer: 'belly-flop',
        jukeboxVisible: true,
    },
    'pounce-prep': {
        id: 'pounce-prep',
        label: 'Butt Wiggle',
        category: 'toys',
        durationMs: 1200,
        bubble: { icon: '\u{1F3AF}', text: 'Butt wiggle locked on', variant: 'success' },
        eyeMode: 'normal',
        mouthMode: 'default',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
    'laser-pounce': {
        id: 'laser-pounce',
        label: 'Laser Pounce',
        category: 'toys',
        durationMs: 1400,
        bubble: { icon: '\u26A1', text: 'Pounce!', variant: 'success' },
        eyeMode: 'happy',
        mouthMode: 'default',
        propLayer: 'swat-cursor',
        jukeboxVisible: true,
    },
    'flehmen-sniff': {
        id: 'flehmen-sniff',
        label: 'Flehmen Sniff',
        category: 'feline',
        durationMs: 2200,
        eyeMode: 'normal',
        mouthMode: 'flehmen',
        propLayer: 'resting',
        jukeboxVisible: true,
    },
};

export function getCircadianBucket(date: Date = new Date()): CircadianBucket {
    const hour = date.getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 23) return 'evening';
    return 'lateNight';
}

export function selectContextualIdleState(params: {
    cursorContext: EditorCursorContext;
    recentStates: string[];
    now?: Date;
    rng?: () => number;
}): string {
    const { cursorContext, recentStates, now = new Date(), rng = Math.random } = params;
    const bucket = getCircadianBucket(now);

    const candidates = Object.values(PET_STATE_REGISTRY).filter(
        (s) => s.jukeboxVisible && s.durationMs > 0 && !s.id.startsWith('compile-') && s.id !== 'typing-paws'
    );

    const weighted = candidates.map((spec) => {
        let weight = 1.0;
        if (spec.circadianWeight?.[bucket]) {
            weight *= spec.circadianWeight[bucket]!;
        }
        if (spec.contextAffinity?.includes(cursorContext)) {
            weight *= 2.4;
        }
        const recencyIndex = recentStates.lastIndexOf(spec.id);
        if (recencyIndex !== -1) {
            const distanceFromEnd = recentStates.length - 1 - recencyIndex;
            weight *= distanceFromEnd === 0 ? 0.05 : distanceFromEnd < 3 ? 0.35 : 0.75;
        }
        return { id: spec.id, weight };
    });

    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) return 'slow-blink';

    let pick = rng() * totalWeight;
    for (const item of weighted) {
        pick -= item.weight;
        if (pick <= 0) return item.id;
    }
    return weighted[weighted.length - 1].id;
}