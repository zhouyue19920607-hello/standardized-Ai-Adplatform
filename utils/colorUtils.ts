
/**
 * Hex 转 HSB (HSV)
 */
export function hexToHsb(hex: string) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');

    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return { h: h * 360, s, b: v };
}

/**
 * HSB 转 Hex
 */
export function hsbToHex(h: number, s: number, b: number) {
    let r = 0, g = 0, bl = 0;
    const i = Math.floor(h / 60);
    const f = h / 60 - i;
    const p = b * (1 - s);
    const q = b * (1 - f * s);
    const t = b * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = b; g = t; bl = p; break;
        case 1: r = q; g = b; bl = p; break;
        case 2: r = p; g = b; bl = t; break;
        case 3: r = p; g = q; bl = b; break;
        case 4: r = t; g = p; bl = b; break;
        case 5: r = b; g = p; bl = q; break;
    }

    const toHex = (n: number) => {
        const hex = Math.round(n * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(bl)}`.toUpperCase();
}

/**
 * 获取基于 HSB 规则的渐变色 (S:100%, B:10%)
 */
export function getDerivedGradientColor(baseHex: string) {
    const { h } = hexToHsb(baseHex);
    return hsbToHex(h, 1.0, 0.1);
}

/**
 * Hex 转 RGB
 */
export function hexToRgb(hex: string) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
    };
}
