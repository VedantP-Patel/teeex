// src/components/deskPet/petProgression.ts
export interface CoatPalette {
    id: string;
    label: string;
    unlockLevel: number;
    furFill: string;
    furStroke: string;
    stripeColor?: string;
    chestFill: string;
    earPink: string;
    eyeColor: string;
}

export interface AccessoryUnlock {
    id: string;
    label: string;
    unlockLevel: number;
}

export const PRESTIGE_COAT_SKINS: CoatPalette[] = [
    {
        id: 'blueprint',
        label: 'Blueprint Grid',
        unlockLevel: 3,
        furFill: '#1e3a8a',
        furStroke: '#93c5fd',
        stripeColor: '#60a5fa',
        chestFill: '#dbeafe',
        earPink: '#38bdf8',
        eyeColor: '#fde047',
    },
    {
        id: 'solarized',
        label: 'Solarized Parchment',
        unlockLevel: 5,
        furFill: '#eee8d5',
        furStroke: '#586e75',
        stripeColor: '#93a1a1',
        chestFill: '#fdf6e3',
        earPink: '#d33682',
        eyeColor: '#2aa198',
    },
    {
        id: 'gold-tex',
        label: 'Knuth Gold Foil',
        unlockLevel: 8,
        furFill: '#f59e0b',
        furStroke: '#78350f',
        stripeColor: '#d97706',
        chestFill: '#fef3c7',
        earPink: '#fb7185',
        eyeColor: '#10b981',
    },
];

export const PRESTIGE_ACCESSORIES: AccessoryUnlock[] = [
    { id: 'monocle', label: 'Brass Monocle', unlockLevel: 2 },
    { id: 'laurel', label: 'Q.E.D. Laurel', unlockLevel: 4 },
    { id: 'knuth-visor', label: 'Typesetter Visor', unlockLevel: 7 },
];

export function computeScholarLevel(xp: number): {
    level: number;
    title: string;
    nextLevelXp: number;
    progressRatio: number;
} {
    const safeXp = Math.max(0, Math.floor(xp));
    const level = Math.min(12, Math.floor(Math.sqrt(safeXp / 50)) + 1);
    const currentFloor = Math.pow(level - 1, 2) * 50;
    const nextLevelXp = Math.pow(level, 2) * 50;
    const span = Math.max(1, nextLevelXp - currentFloor);
    const progressRatio = Math.min(1, (safeXp - currentFloor) / span);

    const titles: Record<number, string> = {
        1: 'Novice Typesetter',
        2: 'Macro Apprentice',
        3: 'TikZ Draftsman',
        4: 'BibTeX Archivist',
        5: 'Theorem Prover',
        6: 'Layout Architect',
        7: 'TeX Wizard',
        8: 'Grand Fellow of San Serriffe',
    };

    return {
        level,
        title: titles[level] ?? 'Emeritus TeX Laureate',
        nextLevelXp,
        progressRatio,
    };
}

export function getNewlyUnlockedRewards(prevXp: number, nextXp: number): string[] {
    const prevLvl = computeScholarLevel(prevXp).level;
    const nextLvl = computeScholarLevel(nextXp).level;
    if (nextLvl <= prevLvl) return [];

    const unlocked: string[] = [];
    for (const coat of PRESTIGE_COAT_SKINS) {
        if (coat.unlockLevel > prevLvl && coat.unlockLevel <= nextLvl) {
            unlocked.push(`Coat: ${coat.label}`);
        }
    }
    for (const acc of PRESTIGE_ACCESSORIES) {
        if (acc.unlockLevel > prevLvl && acc.unlockLevel <= nextLvl) {
            unlocked.push(`Attire: ${acc.label}`);
        }
    }
    return unlocked;
}