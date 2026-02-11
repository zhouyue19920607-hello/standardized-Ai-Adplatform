import ColorThief from 'colorthief';
import chroma from 'chroma-js';
import { ColorScheme } from '../types';

/**
 * 色彩和谐度评估
 * 基于色彩理论，评估颜色的视觉和谐度
 */
function getColorHarmonyScore(rgb: [number, number, number]): number {
    const color = chroma(rgb);
    const hsl = color.hsl();
    const hue = hsl[0] || 0;
    const saturation = hsl[1];
    const lightness = hsl[2];

    // 品牌友好色相（蓝色、紫色、粉色系更受欢迎）
    const brandFriendlyHues = [
        { range: [200, 260], score: 1.0 },  // 蓝色-紫色
        { range: [300, 340], score: 0.95 }, // 粉红-品红
        { range: [160, 200], score: 0.85 }, // 青色
        { range: [0, 30], score: 0.8 },     // 红色
        { range: [330, 360], score: 0.8 },  // 深粉
    ];

    let hueScore = 0.6; // 默认分数
    for (const { range, score } of brandFriendlyHues) {
        if (hue >= range[0] && hue <= range[1]) {
            hueScore = score;
            break;
        }
    }

    return hueScore;
}

/**
 * 计算颜色的情绪吸引力
 * 评估颜色是否能引起积极的情绪反应
 */
function getEmotionalAppeal(rgb: [number, number, number]): number {
    const color = chroma(rgb);
    const hsl = color.hsl();
    const hue = hsl[0] || 0;
    const saturation = hsl[1];
    const lightness = hsl[2];

    // 饱和度评分：中高饱和度最佳（0.5-0.85）
    let satScore = 0;
    if (saturation >= 0.5 && saturation <= 0.85) {
        satScore = 1.0;
    } else if (saturation >= 0.35 && saturation < 0.5) {
        satScore = 0.7 + (saturation - 0.35) * 2;
    } else if (saturation > 0.85) {
        satScore = 1.0 - (saturation - 0.85) * 2;
    } else {
        satScore = saturation / 0.35 * 0.7;
    }

    // 亮度评分：中等亮度最佳（0.45-0.65）
    let lightScore = 0;
    if (lightness >= 0.45 && lightness <= 0.65) {
        lightScore = 1.0;
    } else if (lightness < 0.45) {
        lightScore = Math.max(0.3, lightness / 0.45);
    } else {
        lightScore = Math.max(0.3, (1 - lightness) / 0.35);
    }

    // 避免灰色和棕色（低饱和度的黄橙色）
    let grayPenalty = 1.0;
    if (saturation < 0.2) {
        grayPenalty = 0.3; // 严重惩罚灰色
    } else if (saturation < 0.35 && hue >= 20 && hue <= 60) {
        grayPenalty = 0.5; // 惩罚棕色
    }

    return satScore * 0.5 + lightScore * 0.5 * grayPenalty;
}

/**
 * 综合审美评分系统
 * 结合多个维度评估颜色的整体美观度
 */
function getAestheticScore(rgb: [number, number, number]): number {
    const harmonyScore = getColorHarmonyScore(rgb);
    const emotionalScore = getEmotionalAppeal(rgb);

    // 色彩纯度评估（避免过于混浊的颜色）
    const color = chroma(rgb);
    const lab = color.lab();
    const chromaValue = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
    const purityScore = Math.min(chromaValue / 80, 1.0); // 归一化色度值

    // 综合评分：和谐度40% + 情绪吸引力40% + 纯度20%
    const finalScore = harmonyScore * 0.4 + emotionalScore * 0.4 + purityScore * 0.2;

    return finalScore;
}

/**
 * 增强版色值优化：基于 HCL 空间
 */
export function optimizeColor(rgb: [number, number, number], type: 'icon' | 'gradient' = 'icon'): string {
    const color = chroma(rgb);
    const hue = color.get('hcl.h');
    const chromaVal = color.get('hcl.c');
    const luminance = color.get('hcl.l');

    let finalChroma = chromaVal;
    let finalLuminance = luminance;

    if (type === 'icon') {
        // 图标底圈：确保饱和度和明度足够高，产生“果冻感”
        // 范围：色度 [40, 80]，明度 [50, 80]
        finalChroma = Math.max(45, Math.min(chromaVal * 1.5, 90));
        finalLuminance = Math.max(55, Math.min(luminance, 85));
    } else {
        // 渐变色带：作为背景氛围，需要更柔和、更明亮或更有深度
        // 范围：色度略低，明度适中偏高以防太暗
        finalChroma = Math.max(30, Math.min(chromaVal * 1.1, 70));
        finalLuminance = Math.max(40, Math.min(luminance, 75));
    }

    // 针对亮黄色/青色特殊处理，防止刺眼
    if (hue > 50 && hue < 180 && finalLuminance > 85) finalLuminance = 80;

    return chroma.hcl(hue, finalChroma, finalLuminance).hex().toUpperCase();
}

/**
 * 原 getHomePaletteSync 保持兼容性
 */
export function getHomePaletteSync(rgb: [number, number, number]): string {
    return optimizeColor(rgb, 'icon');
}

/**
 * 从图像区域提取调色板并选择最佳颜色
 */
async function extractColorsFromRegion(
    img: HTMLImageElement,
    startY: number,
    height: number
): Promise<[number, number, number][]> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const targetWidth = 375;
    const targetHeight = Math.min(height, 150);
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.drawImage(
        img,
        0, startY, img.width, height,
        0, 0, targetWidth, targetHeight
    );

    return new Promise((resolve) => {
        const tempImg = new Image();
        tempImg.src = canvas.toDataURL();
        tempImg.onload = () => {
            const colorThief = new ColorThief();
            try {
                const palette = colorThief.getPalette(tempImg, 10);
                resolve(palette as [number, number, number][]);
            } catch (e) {
                console.error('[SmartColor] ColorThief failed:', e);
                resolve([[37, 99, 235]]);
            }
        };
        tempImg.onerror = () => resolve([[37, 99, 235]]);
    });
}

/**
 * 增强版智能取色：提取一组高质量配色方案
 */
export async function extractSmartPalette(imageUrl: string, options?: { bottomRegionHeight?: number, strictDominance?: boolean }): Promise<ColorScheme[]> {
    console.log('[SmartColor] 🎨 提取智能配色方案...');
    const bottomHeight = options?.bottomRegionHeight || 0.2;
    const bottomStart = 1.0 - bottomHeight;
    const strictDominance = options?.strictDominance || false;

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = imageUrl;
        img.onload = async () => {
            try {
                // 定义不同的提取区域
                const centerRegion = { name: '主体', startY: img.height * 0.3, height: img.height * 0.4 };
                const bottomRegion = { name: '底部', startY: img.height * bottomStart, height: img.height * bottomHeight };

                // 提取各区域颜色候选集
                const [centerRawColors, bottomRawColors] = await Promise.all([
                    extractColorsFromRegion(img, centerRegion.startY, centerRegion.height),
                    extractColorsFromRegion(img, bottomRegion.startY, bottomRegion.height)
                ]);

                // 评分并排序
                const scoredCenter = centerRawColors
                    .map(rgb => ({ rgb, score: getAestheticScore(rgb) }))
                    .sort((a, b) => b.score - a.score);

                // 对于底部颜色，如果要求严格匹配（用于无缝衔接），则优先保留支配色（即ColorThief提取的顺序）
                // 否则按美学评分排序
                let scoredBottom;
                if (strictDominance) {
                    scoredBottom = bottomRawColors.map(rgb => ({ rgb, score: 1.0 })); // Keep original dominance order
                } else {
                    scoredBottom = bottomRawColors
                        .map(rgb => ({ rgb, score: getAestheticScore(rgb) }))
                        .sort((a, b) => b.score - a.score);
                }

                const finalPalette: ColorScheme[] = [];

                // 策略：Icon 取自中心主体，Gradient 严格取自底部
                for (let i = 0; i < 5; i++) {
                    const cIdx = i % Math.max(1, scoredCenter.length);
                    // Cycle through bottom candidates 
                    const bIdx = i % Math.max(1, scoredBottom.length);

                    const centerRgb = scoredCenter[cIdx]?.rgb || [0, 122, 255];
                    // Cycle through bottom candidates 
                    // Previously locked to [0] for strict mode, now allow cycling but prefer top 3 to avoid noise
                    const bottomRgb = strictDominance
                        ? (scoredBottom[bIdx % Math.min(3, scoredBottom.length)]?.rgb || [255, 255, 255])
                        : (scoredBottom[bIdx]?.rgb || [255, 255, 255]);

                    // Icon: High saturation, readable
                    const iconColor = optimizeColor(centerRgb, 'icon');

                    // Gradient: 
                    // If strict dominance (seamless mode), use raw color but DARKEN it STRONGLY as requested.
                    // Darken by 2.0 (was 1.0) ensures it's very dark.
                    let gradientColor: string;
                    if (strictDominance) {
                        gradientColor = chroma(bottomRgb).darken(2.5).hex().toUpperCase();
                    } else {
                        gradientColor = optimizeColor(bottomRgb, 'gradient');
                    }

                    finalPalette.push({ iconColor, gradientColor });
                }

                console.log(`[SmartColor] 提取了 ${finalPalette.length} 组配色方案 (Bottom 20% Strict)`);
                resolve(finalPalette);
            } catch (e) {
                console.error('[SmartColor] Palette extraction failed:', e);
                resolve([{ iconColor: '#007AFF', gradientColor: '#003F80' }]);
            }
        };
        img.onerror = () => resolve([{ iconColor: '#007AFF', gradientColor: '#003F80' }]);
    });
}

/**
 * 兼容旧接口：默认返回最佳颜色
 */
export async function extractSmartColor(imageUrl: string): Promise<{ hexColor: string, gradientColor: string }> {
    const palette = await extractSmartPalette(imageUrl);
    return { hexColor: palette[0].iconColor, gradientColor: palette[0].gradientColor };
}
