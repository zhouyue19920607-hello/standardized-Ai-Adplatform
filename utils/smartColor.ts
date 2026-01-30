import ColorThief from 'colorthief';
import chroma from 'chroma-js';

/**
 * 对应参考 HTML 中的 getHomePalette 逻辑
 * 实现 HCL 空间的颜色校正与补偿
 */
export function getHomePaletteSync(rgb: [number, number, number]): string {
    const mainColor = chroma(rgb);
    const mainHue = mainColor.get('hcl.h');
    const mainChroma = mainColor.get('hcl.c');
    const mainLuminance = mainColor.get('hcl.l');

    // HCL 空间数学模型校正
    let finalChroma = 0.0002 * Math.pow(mainChroma, 3) - 0.0347 * Math.pow(mainChroma, 2) + 2.0053 * mainChroma + 18.413;
    let finalLuminance = -0.0047 * Math.pow(mainLuminance, 2) + (1 - 0.3217) * mainLuminance + 39.273;

    // 特殊区域颜色补正
    if (mainLuminance > 64 && mainLuminance < 74) {
        finalLuminance -= 12;
    } else if (mainLuminance > 54 && mainLuminance < 64) {
        finalLuminance += 12;
    }

    const finalColor = chroma.hcl(mainHue, finalChroma, finalLuminance).hex();
    return finalColor.toUpperCase();
}

/**
 * 从图片 URL (DataURL) 中提取主色调并计算派生色
 * 模拟 HTML 中的裁剪取色逻辑
 */
export async function extractSmartColor(imageUrl: string): Promise<{ hexColor: string }> {
    console.log('[SmartColor] Starting extraction for:', imageUrl.substring(0, 50) + '...');
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = imageUrl;
        img.onload = () => {
            console.log('[SmartColor] Image loaded successfully:', img.width, 'x', img.height);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;

            // 按照参考 HTML 的比例裁剪底部约 35% 区域 (106/300)
            const targetWidth = 375;
            const targetHeight = 106;
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            // 裁剪逻辑: 从原图底部 194/300 处开始截取
            const sourceY = (194 / 300) * img.height;
            const sourceHeight = (106 / 300) * img.height;

            console.log('[SmartColor] Cropping region:', { sourceY, sourceHeight, targetWidth, targetHeight });

            ctx.drawImage(
                img,
                0, sourceY, img.width, sourceHeight,
                0, 0, targetWidth, targetHeight
            );

            // 参考 HTML 逻辑：将 Canvas 转回 Image 再给 ColorThief
            const tempImg = new Image();
            tempImg.src = canvas.toDataURL();
            tempImg.onload = () => {
                const colorThief = new ColorThief();
                try {
                    const dominantRgb = colorThief.getColor(tempImg);
                    console.log('[SmartColor] Dominant RGB found:', dominantRgb);
                    const finalHex = getHomePaletteSync(dominantRgb);
                    console.log('[SmartColor] Final HEX (HCL Corrected):', finalHex);
                    resolve({ hexColor: finalHex });
                } catch (e) {
                    console.error('[SmartColor] ColorThief failed:', e);
                    resolve({ hexColor: '#2563EB' });
                }
            };
            tempImg.onerror = () => {
                console.error('[SmartColor] Temp image load failed');
                resolve({ hexColor: '#2563EB' });
            };
        };
        img.onerror = (e) => {
            console.error('[SmartColor] Original image load failed:', e);
            resolve({ hexColor: '#2563EB' });
        };
    });
}
