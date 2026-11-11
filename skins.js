// Shared skin-tone presets for both renderers. Interior anatomy (mucosa,
// ribs, womb lining, cavity) stays pink at every tone — it's mucosa — so a
// preset only recolors her outer body and his shaft/balls.
//
// Each entry: her body fill + outline, his shaft/glans fills + outlines.
// Outlines are hand-picked darker, warmer companions rather than derived,
// matching the original anime palette's contrast.

export const SKIN_TONES = {
    anime: {
        label: 'Anime pink',
        her: { skin: '#f7cdd2', skinLine: '#b25a72' },
        him: { shaft: '#f3bfa9', shaftLine: '#b06550', glans: '#eb9f9d', glansLine: '#c96b62' },
    },
    fair: {
        label: 'Fair',
        her: { skin: '#f9e2d2', skinLine: '#c07d6e' },
        him: { shaft: '#f5d8c2', shaftLine: '#a8705a', glans: '#eeb3a2', glansLine: '#c67a68' },
    },
    light: {
        label: 'Light',
        her: { skin: '#f2cdad', skinLine: '#a96d55' },
        him: { shaft: '#eec4a2', shaftLine: '#9c6247', glans: '#e3a189', glansLine: '#b96f55' },
    },
    tan: {
        label: 'Tan',
        her: { skin: '#dfab84', skinLine: '#8f5741' },
        him: { shaft: '#d7a077', shaftLine: '#85512f', glans: '#c98a67', glansLine: '#9d5c41' },
    },
    brown: {
        label: 'Brown',
        her: { skin: '#b97f5b', skinLine: '#6e4130' },
        him: { shaft: '#af744f', shaftLine: '#623b26', glans: '#a26547', glansLine: '#774431' },
    },
    deep: {
        label: 'Deep',
        her: { skin: '#8b5b41', skinLine: '#4d2d1f' },
        him: { shaft: '#7d5037', shaftLine: '#40291b', glans: '#734630', glansLine: '#50301f' },
    },
};

export function herTone(name) { return (SKIN_TONES[name] || SKIN_TONES.anime).her; }
export function himTone(name) { return (SKIN_TONES[name] || SKIN_TONES.anime).him; }
