import React, { useEffect, useRef, useState } from 'react';
import {
    ASSETS_URL,
    cutoutImageWithAigc,
    cutoutVideoWithAigc,
    CreativeTemplateItem,
    CreativeTemplateSettings,
    animateImageWithAigc,
    editImageWithAigc,
    exportVideoWithSize,
    generateImageWithAigc,
    generateVideoWithAigc,
    getCreativeSettings,
    getCreativeTemplates,
    uploadRawAsset,
} from '../services/api';
import { hexToRgb } from '../utils/colorUtils';
import { extractSmartPalette } from '../utils/smartColor';
import CreativeTemplateHoverCard from './CreativeTemplateHoverCard';
import SideRays from './SideRays';

type UploadStatus = 'idle' | 'valid' | 'adapted' | 'invalid';

interface UploadState {
    file: File | null;
    url: string | null;
    status: UploadStatus;
    message: string;
    whiteRemovalMode?: 'none' | 'local-key' | 'provider-cutout';
}

interface MagazineAsset {
    id: string;
    file: File;
    url: string;
    type: 'image' | 'video';
    message: string;
}

interface SpotlightCardAsset {
    id: string;
    file: File;
    url: string;
    message: string;
}

type SpotlightAiTarget = 'large' | `small-${0 | 1 | 2}`;
type PolyAiTarget = 'base' | `card-${0 | 1 | 2 | 3}`;
type CreativeUploadTarget =
    | 'asset'
    | 'splash'
    | 'magazine'
    | 'spotlight-small'
    | 'spotlight-large'
    | 'spotlight-splash'
    | 'break-frame'
    | 'break-splash'
    | 'break-focal'
    | 'poly-base'
    | 'poly-cards'
    | 'poly-focal'
    | 'refresh-icons'
    | 'refresh-bottom-nav'
    | 'linked-opening'
    | 'linked-focal';

const emptyUpload: UploadState = {
    file: null,
    url: null,
    status: 'idle',
    message: '等待上传',
    whiteRemovalMode: 'none',
};

const defaultCreativeSettings: CreativeTemplateSettings = {
    interactionType: 'bubble-slide',
    cropAreaEnabled: true,
    platforms: ['xiuxiu'],
};

const interactionOptions = [
    { id: 'bubble-slide', label: '气泡滑动' },
    { id: 'twist', label: '扭动' },
    { id: 'up-slide', label: '上滑' },
] as const;

const platformOptions = [
    { id: 'xiuxiu', label: '秀秀', icon: '/icons/meitu_mask_icon.png' },
    { id: 'meiyan', label: '美颜', icon: '/icons/beauty_mask_icon.png' },
    { id: 'wink', label: 'Wink', icon: '/icons/wink_mask_icon.png' },
] as const;

const dynamicSplashPlatformMasks: Record<CreativeTemplateSettings['platforms'][number], string> = {
    xiuxiu: '/creative-masks/dynamic-splash-xiuxiu.png',
    meiyan: '/creative-masks/dynamic-splash-meiyan.png',
    wink: '/creative-masks/dynamic-splash-wink.png',
};

const SPOTLIGHT_GALLERY_INTERACTION_PATH = '/creative-masks/spotlight-gallery-interaction.png';
const SHOW_REFRESH_BOTTOM_NAV_UPLOAD = false;
const LINKED_TEMPLATE_ID = 'linked-super-video-panorama';

const defaultCreativeCategories = [
    {
        id: 'splash',
        label: '开屏创意模版',
        icon: 'wb_sunny',
        templates: [
            { id: 'dynamic-splash', label: '炫动开屏' },
            { id: 'magazine-flip', label: '杂志翻页' },
            { id: 'slide-splash', label: '聚光开屏' },
        ],
    },
    {
        id: 'home',
        label: '首页创意模版',
        icon: 'home_app_logo',
        templates: [
            { id: 'break-frame-focal-3d', label: '秀秀-破框焦点视窗3D' },
            { id: 'meiyan-break-frame-focal-3d', label: '美颜-破框焦点视窗3D' },
            { id: 'polymorphic-flip-card', label: '多态翻卡' },
            { id: 'jumping-focal-window', label: '跃动焦点视窗' },
            { id: 'refresh-ui-bottom-nav', label: '焕新UI' },
        ],
    },
    {
        id: 'linked',
        label: '联动创意模版',
        icon: 'hub',
        templates: [
            { id: LINKED_TEMPLATE_ID, label: '联动超视频-全景视频模版' },
        ],
    },
];

const defaultCreativeTemplates: CreativeTemplateItem[] = [
    {
        id: 'dynamic-splash',
        groupId: 'splash',
        groupName: '开屏创意模版',
        name: '炫动开屏',
        dimensions: '1440 x 2340 / 5s',
        preview_video_path: '/template-previews/dynamic-splash.mp4',
        enabled: true,
    },
    {
        id: 'magazine-flip',
        groupId: 'splash',
        groupName: '开屏创意模版',
        name: '杂志翻页',
        dimensions: '1440 x 2340 / 3-5素材',
        preview_video_path: '/template-previews/magazine-flip.mp4',
        enabled: true,
    },
    {
        id: 'slide-splash',
        groupId: 'splash',
        groupName: '开屏创意模版',
        name: '聚光开屏',
        dimensions: '小卡 275 x 370 / 大卡 897 x 370 / 开屏 1440 x 2340',
        preview_video_path: '/template-previews/slide-splash.mp4',
        interaction_asset_path: SPOTLIGHT_GALLERY_INTERACTION_PATH,
        enabled: true,
    },
    {
        id: 'break-frame-focal-3d',
        groupId: 'home',
        groupName: '首页创意模版',
        name: '秀秀-破框焦点视窗3D',
        dimensions: '预览 1126 x 2436 / 破框 1126 x 1890 / 焦点 1126 x 900',
        preview_video_path: '/template-previews/break-frame-focal-3d.mp4',
        enabled: true,
    },
    {
        id: 'meiyan-break-frame-focal-3d',
        groupId: 'home',
        groupName: '首页创意模版',
        name: '美颜-破框焦点视窗3D',
        dimensions: '预览 1126 x 2436 / 破框 1126 x 1890 / 焦点 1126 x 900',
        preview_video_path: '/template-previews/meiyan-break-frame-focal-3d.mp4',
        enabled: true,
    },
    {
        id: 'polymorphic-flip-card',
        groupId: 'home',
        groupName: '首页创意模版',
        name: '多态翻卡',
        dimensions: '预览 1126 x 2436 / 破框 1126 x 1890 / 焦点 1126 x 900',
        preview_video_path: '/template-previews/polymorphic-flip-card.mp4',
        enabled: true,
    },
    {
        id: 'jumping-focal-window',
        groupId: 'home',
        groupName: '首页创意模版',
        name: '跃动焦点视窗',
        dimensions: '预览 1126 x 2436 / 破框 1126 x 906 / 焦点 1126 x 900',
        preview_video_path: '/template-previews/jumping-focal-window.mp4',
        enabled: true,
    },
    {
        id: 'refresh-ui-bottom-nav',
        groupId: 'home',
        groupName: '首页创意模版',
        name: '焕新UI',
        dimensions: 'icon 底图 1228 x 674 / 等比缩小 1028 x 565 后裁进 6 个 icon',
        preview_video_path: '/template-previews/refresh-ui-bottom-nav.mp4',
        enabled: true,
    },
    {
        id: LINKED_TEMPLATE_ID,
        groupId: 'linked',
        groupName: '联动创意模版',
        name: '联动超视频-全景视频模版',
        dimensions: '开屏 1440 x 2340 / 8s；焦点 1126 x 900；输出 1126 x 2436',
        preview_video_path: '/template-previews/linked-super-video-panorama.mp4',
        enabled: true,
    },
];

const implementedCreativeTemplateIds = new Set(
    defaultCreativeCategories.flatMap((group) => group.templates.map((template) => template.id)),
);

const categoryIcons: Record<string, string> = {
    splash: 'wb_sunny',
    home: 'home_app_logo',
    linked: 'hub',
};

const isBreakFrameLikeTemplateId = (id?: string | null) => (
    Boolean(id && (
        id.includes('break-frame-focal-3d') ||
        id === 'polymorphic-flip-card' ||
        id === 'jumping-focal-window' ||
        id === 'refresh-ui-bottom-nav'
    ))
);

const isLinkedSuperVideoTemplateId = (id?: string | null) => id === LINKED_TEMPLATE_ID;

const buildCreativeCategories = (templates: CreativeTemplateItem[]) => {
    const enabledTemplates = templates.filter((item) => item.enabled !== false && implementedCreativeTemplateIds.has(item.id));
    if (!enabledTemplates.length) return defaultCreativeCategories;

    const groups = enabledTemplates.reduce((acc, tpl) => {
        if (!acc[tpl.groupId]) {
            acc[tpl.groupId] = {
                id: tpl.groupId,
                label: tpl.groupName,
                icon: categoryIcons[tpl.groupId] || 'category',
                templates: [] as Array<{ id: string; label: string }>,
            };
        }
        acc[tpl.groupId].templates.push({ id: tpl.id, label: tpl.name });
        return acc;
    }, {} as Record<string, typeof defaultCreativeCategories[number]>);

    return Object.values(groups);
};

const pendantMotionNotes = {
    maxItems: 8,
    placement: '8 个挂件按参考图组成一整块错落挂件组',
    overflow: '整块挂件组从画布上方滑入，5 秒内从画布下方完全滑出',
    animation: '所有挂件大小随机，随机范围为基础尺寸的 30%',
};

const CANVAS_W = 1440;
const CANVAS_H = 2340;
const PENDANT_SIZE = 450;
const PENDANT_DISPLAY_SIZE_RATIO = 0.55;
const PENDANT_GROUP_START_Y = -CANVAS_H - PENDANT_SIZE;
const PENDANT_GROUP_END_Y = CANVAS_H + PENDANT_SIZE * 1.25;
const MAGAZINE_MIN_ASSETS = 3;
const MAGAZINE_MAX_ASSETS = 5;
const MAGAZINE_FRAME_MS = 1500;
const SPOTLIGHT_SMALL_W = 275;
const SPOTLIGHT_SMALL_H = 370;
const SPOTLIGHT_LARGE_W = 897;
const SPOTLIGHT_LARGE_H = 370;
const SPOTLIGHT_DURATION = 5000;
const SPOTLIGHT_SIDE_MARGIN = 272;
const SPOTLIGHT_BOTTOM_MARGIN = 227;
const BREAK_FRAME_W = 1126;
const BREAK_FRAME_H = 1890;
const JUMPING_FRAME_H = 906;
const REFRESH_TOP_ICON_W = 600;
const REFRESH_TOP_ICON_H = 335;
const REFRESH_BOTTOM_ICON_W = 288;
const REFRESH_BOTTOM_ICON_H = 315;
const REFRESH_ICON_SHEET_W = 1228;
const REFRESH_ICON_SHEET_H = 674;
const REFRESH_ICON_LAYER_W = 1028;
const REFRESH_ICON_LAYER_H = 565;
const REFRESH_BOTTOM_NAV_W = 1126;
const REFRESH_BOTTOM_NAV_H = 252;
const BREAK_FOCAL_W = 1126;
const BREAK_FOCAL_H = 900;
const BREAK_CANVAS_W = 1126;
const BREAK_CANVAS_H = 2436;
const BREAK_FOCAL_Y = 0;
const BREAK_FRAME_Y = 0;
const BREAK_DURATION = 5000;
const LINKED_OPENING_DURATION = 8000;
const LINKED_FULL_OPENING_DURATION = 5000;
const LINKED_TRANSITION_DURATION = 500;
const LINKED_PANORAMA_OPENING_H = Math.round(BREAK_CANVAS_W * (CANVAS_H / CANVAS_W));
const LINKED_OPENING_DURATION_TOLERANCE = 0.3;
const BREAK_AI_DURATION_RULE = '每一破框只能维持1.5s';
const getCreativePreviewAspectRatio = (templateId?: string | null) => (
    isBreakFrameLikeTemplateId(templateId) || isLinkedSuperVideoTemplateId(templateId)
        ? `${BREAK_CANVAS_W} / ${BREAK_CANVAS_H}`
        : `${CANVAS_W} / ${CANVAS_H}`
);
const CREATIVE_EFFECT_PREVIEW_ASPECT_RATIO = `${CANVAS_W} / ${CANVAS_H}`;
const FOCAL_UI_SOURCE_W = 473;
const FOCAL_UI_SOURCE_H = 1024;
const FOCAL_UI_SCALE_X = BREAK_CANVAS_W / FOCAL_UI_SOURCE_W;
const FOCAL_UI_SCALE_Y = BREAK_CANVAS_H / FOCAL_UI_SOURCE_H;
const REFRESH_TOP_ICON_SLOTS = [
    { x: 20, y: 282, width: 213, height: 99 },
    { x: 242, y: 282, width: 212, height: 99 },
].map((slot) => ({
    x: slot.x * FOCAL_UI_SCALE_X,
    y: slot.y * FOCAL_UI_SCALE_Y,
    width: slot.width * FOCAL_UI_SCALE_X,
    height: slot.height * FOCAL_UI_SCALE_Y,
    radius: 40,
}));
const REFRESH_BOTTOM_ICON_SLOTS = [
    { x: 20, y: 392, width: 102, height: 90 },
    { x: 131, y: 392, width: 101, height: 90 },
    { x: 242, y: 392, width: 102, height: 90 },
    { x: 352, y: 392, width: 102, height: 90 },
].map((slot) => ({
    x: slot.x * FOCAL_UI_SCALE_X,
    y: slot.y * FOCAL_UI_SCALE_Y,
    width: slot.width * FOCAL_UI_SCALE_X,
    height: slot.height * FOCAL_UI_SCALE_Y,
    radius: 40,
}));
const getRefreshSlotRadius = (slot: { width: number; height: number; radius: number }) => (
    Math.min(slot.radius, slot.width / 2, slot.height / 2)
);
const getRefreshPreviewBorderRadius = (slot: { width: number; height: number; radius: number }) => {
    const radius = getRefreshSlotRadius(slot);
    return `${(radius / slot.width) * 100}% / ${(radius / slot.height) * 100}%`;
};
const getRefreshIconLayerFrame = () => {
    const slots = [...REFRESH_TOP_ICON_SLOTS, ...REFRESH_BOTTOM_ICON_SLOTS];
    const minX = Math.min(...slots.map((slot) => slot.x));
    const bottomY = Math.min(...REFRESH_BOTTOM_ICON_SLOTS.map((slot) => slot.y));
    const sheetScale = REFRESH_ICON_LAYER_W / REFRESH_ICON_SHEET_W;
    const sourceBottomRowY = (REFRESH_ICON_SHEET_H - REFRESH_BOTTOM_ICON_H) * sheetScale;
    return {
        x: minX,
        y: bottomY - sourceBottomRowY,
        width: REFRESH_ICON_LAYER_W,
        height: REFRESH_ICON_LAYER_H,
    };
};
const getRefreshSheetPreviewImageStyle = (
    slot: { x: number; y: number; width: number; height: number; radius: number },
): React.CSSProperties => ({
    position: 'absolute',
    ...(() => {
        const layer = getRefreshIconLayerFrame();
        return {
            width: `${(layer.width / slot.width) * 100}%`,
            height: `${(layer.height / slot.height) * 100}%`,
            left: `${((layer.x - slot.x) / slot.width) * 100}%`,
            top: `${((layer.y - slot.y) / slot.height) * 100}%`,
        };
    })(),
    objectFit: 'fill',
    maxWidth: 'none',
    maxHeight: 'none',
});
const getRefreshIconMaskStyle = (): React.CSSProperties => {
    const layer = getRefreshIconLayerFrame();
    const slots = [...REFRESH_TOP_ICON_SLOTS, ...REFRESH_BOTTOM_ICON_SLOTS];
    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${layer.width}" height="${layer.height}" viewBox="0 0 ${layer.width} ${layer.height}">`,
        ...slots.map((slot) => (
            `<rect x="${slot.x - layer.x}" y="${slot.y - layer.y}" width="${slot.width}" height="${slot.height}" rx="${getRefreshSlotRadius(slot)}" ry="${getRefreshSlotRadius(slot)}" fill="white"/>`
        )),
        '</svg>',
    ].join('');
    const maskUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    return {
        WebkitMaskImage: maskUrl,
        maskImage: maskUrl,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
    };
};
const getRefreshIconLayerPreviewStyle = (): React.CSSProperties => {
    const layer = getRefreshIconLayerFrame();
    return {
        left: `${(layer.x / BREAK_CANVAS_W) * 100}%`,
        top: `${(layer.y / BREAK_CANVAS_H) * 100}%`,
        width: `${(layer.width / BREAK_CANVAS_W) * 100}%`,
        height: `${(layer.height / BREAK_CANVAS_H) * 100}%`,
        ...getRefreshIconMaskStyle(),
    };
};
const drawRefreshIconLayer = (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
) => {
    const layer = getRefreshIconLayerFrame();
    const slots = [...REFRESH_TOP_ICON_SLOTS, ...REFRESH_BOTTOM_ICON_SLOTS];
    ctx.save();
    ctx.beginPath();
    slots.forEach((slot) => {
        ctx.roundRect(slot.x, slot.y, slot.width, slot.height, getRefreshSlotRadius(slot));
    });
    ctx.clip();
    ctx.drawImage(source, layer.x, layer.y, layer.width, layer.height);
    ctx.restore();
};
const POLY_CARD_W = 840;
const POLY_CARD_H = 360;
const POLY_CARD_X = 143;
const POLY_CARD_Y = 260;
const POLY_CARD_FRAME_MS = 1500;
const POLY_CARD_GAP = 25;
const POLY_CARD_SIDE_SCALE = 0.8;
const POLY_CARD_SIDE_W = POLY_CARD_W * POLY_CARD_SIDE_SCALE;
const POLY_CARD_SIDE_H = POLY_CARD_H * POLY_CARD_SIDE_SCALE;
const POLY_CARD_FLIP_MS = 1200;
const POLY_CARD_FINAL_HOLD_MS = 900;

const getPolyCarouselFrame = (position: number) => {
    const absPosition = Math.abs(position);
    const scale = 1 - Math.min(absPosition, 1) * (1 - POLY_CARD_SIDE_SCALE);
    const width = POLY_CARD_W * scale;
    const height = POLY_CARD_H * scale;
    const rightSideX = POLY_CARD_X + POLY_CARD_W + POLY_CARD_GAP;
    const leftSideX = POLY_CARD_X - POLY_CARD_SIDE_W - POLY_CARD_GAP;
    let x = POLY_CARD_X;

    if (position > 0 && position <= 1) {
        x = POLY_CARD_X + (rightSideX - POLY_CARD_X) * position;
    } else if (position > 1) {
        x = rightSideX + (position - 1) * (POLY_CARD_SIDE_W + POLY_CARD_GAP);
    } else if (position < 0 && position >= -1) {
        x = POLY_CARD_X + (POLY_CARD_X - leftSideX) * position;
    } else if (position < -1) {
        x = leftSideX + (position + 1) * (POLY_CARD_SIDE_W + POLY_CARD_GAP);
    }

    return {
        x,
        y: POLY_CARD_Y + (POLY_CARD_H - height) / 2,
        width,
        height,
        opacity: absPosition > 2.15 ? 0 : 1,
        zIndex: Math.round((3 - Math.min(absPosition, 3)) * 10),
    };
};

const getPolyFinalFrame = (progress: number) => {
    const eased = easeInOutCubic(Math.max(0, Math.min(1, progress)));
    return {
        x: POLY_CARD_X * (1 - eased),
        y: POLY_CARD_Y * (1 - eased),
        width: POLY_CARD_W + (BREAK_FOCAL_W - POLY_CARD_W) * eased,
        height: POLY_CARD_H + (BREAK_FOCAL_H - POLY_CARD_H) * eased,
        radius: 42 * (1 - eased) + 8 * eased,
    };
};
const defaultBreakColorSchemes = [
    { id: 'aurora', label: '极光蓝紫', iconColor: '#6C63FF', gradientColor: '#35D5FF' },
    { id: 'pop', label: '活力粉橙', iconColor: '#FF3D8B', gradientColor: '#FFB13B' },
    { id: 'fresh', label: '清透绿青', iconColor: '#13C8A8', gradientColor: '#7CFFCB' },
];

const getApproxAigcVideoTarget = (targetWidth: number, targetHeight: number) => {
    const ratio = targetWidth / targetHeight;
    if (ratio < 0.75) {
        return { width: 720, height: 1280, ratio: '9:16', label: '9:16 竖版近似比例' };
    }
    if (ratio < 1.45) {
        return { width: 1280, height: 1024, ratio: '5:4', label: '5:4 近似比例' };
    }
    if (ratio < 2.2) {
        return { width: 1280, height: 720, ratio: '16:9', label: '16:9 横版近似比例' };
    }
    return { width: 1280, height: 288, ratio: '40:9', label: '40:9 超宽近似比例' };
};

const isPngFile = (file: File) => file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
const isCutoutSourceImageFile = (file: File) => {
    const fileName = file.name.toLowerCase();
    return file.type.startsWith('image/') || /\.(png|webp|jpe?g)$/i.test(fileName);
};

interface PendantFrame {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
}

interface PendantSeed {
    x: number;
    y: number;
    scale: number;
}

const seededRandom = (index: number, salt = 0) => {
    const x = Math.sin(index * 999 + salt * 37.17) * 10000;
    return x - Math.floor(x);
};

const pendantPattern = [
    { x: 930, y: 120 },
    { x: 590, y: 420 },
    { x: 190, y: 700 },
    { x: 910, y: 980 },
    { x: 500, y: 1260 },
    { x: -65, y: 1540 },
    { x: 780, y: 1740 },
    { x: 460, y: 2040 },
];

const getPendantSeeds = (): PendantSeed[] => (
    pendantPattern.map((point, index) => ({
        x: point.x,
        y: point.y,
        scale: 0.7 + seededRandom(index, 1) * 0.6,
    }))
);

const getPendantGroupOffsetY = (progress: number) => (
    PENDANT_GROUP_START_Y + progress * (PENDANT_GROUP_END_Y - PENDANT_GROUP_START_Y)
);

const getPendantFrame = (
    seed: PendantSeed,
    progress: number
): PendantFrame => {
    const groupY = getPendantGroupOffsetY(progress);
    return {
        x: seed.x,
        y: groupY + seed.y,
        scale: seed.scale,
        rotation: 0,
        opacity: 1,
    };
};

const getPendantGroupPreviewStyle = (): React.CSSProperties => ({
    '--pendant-group-start': `${(PENDANT_GROUP_START_Y / CANVAS_H) * 100}%`,
    '--pendant-group-end': `${(PENDANT_GROUP_END_Y / CANVAS_H) * 100}%`,
} as React.CSSProperties);

const getPendantPreviewStyle = (
    seed: PendantSeed,
): React.CSSProperties => {
    return {
        left: `${(seed.x / CANVAS_W) * 100}%`,
        top: `${(seed.y / CANVAS_H) * 100}%`,
        width: `${(PENDANT_SIZE / CANVAS_W) * 100 * seed.scale * PENDANT_DISPLAY_SIZE_RATIO}%`,
        opacity: 1,
    };
};

const getImageSize = (file: File): Promise<{ width: number; height: number }> => (
    new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
            URL.revokeObjectURL(url);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('图片无法读取'));
        };
        img.src = url;
    })
);

const getVideoMeta = (file: File): Promise<{ width: number; height: number; duration: number }> => (
    new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            resolve({
                width: video.videoWidth,
                height: video.videoHeight,
                duration: video.duration,
            });
            URL.revokeObjectURL(url);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('视频无法读取'));
        };
        video.src = url;
    })
);

const loadImage = (url: string): Promise<HTMLImageElement> => (
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('素材加载失败'));
        img.src = url;
    })
);

const loadVideoElement = async (url: string, shouldPlay = true): Promise<HTMLVideoElement> => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.loop = shouldPlay;
    await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('视频素材加载失败'));
    });
    if (shouldPlay) {
        await video.play().catch(() => undefined);
    } else {
        video.pause();
        try {
            video.currentTime = 0;
        } catch {
            // Some browsers disallow seeking before the first frame is fully ready.
        }
    }
    return video;
};

const freezeVideoOnFirstFrame = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    video.pause();
    if (video.currentTime !== 0) {
        try {
            video.currentTime = 0;
        } catch {
            // Keep the currently loaded frame if seeking is not available.
        }
    }
};

const drawCover = (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sourceW: number,
    sourceH: number,
    targetW: number,
    targetH: number
) => {
    const scale = Math.max(targetW / sourceW, targetH / sourceH);
    const w = sourceW * scale;
    const h = sourceH * scale;
    ctx.drawImage(source, (targetW - w) / 2, (targetH - h) / 2, w, h);
};

const drawCoverAt = (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sourceW: number,
    sourceH: number,
    x: number,
    y: number,
    targetW: number,
    targetH: number
) => {
    const scale = Math.max(targetW / sourceW, targetH / sourceH);
    const w = sourceW * scale;
    const h = sourceH * scale;
    ctx.drawImage(source, x + (targetW - w) / 2, y + (targetH - h) / 2, w, h);
};

const drawContain = (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sourceW: number,
    sourceH: number,
    targetW: number,
    targetH: number,
    x: number,
    y: number
) => {
    const scale = Math.min(targetW / sourceW, targetH / sourceH);
    const w = sourceW * scale;
    const h = sourceH * scale;
    ctx.drawImage(source, x + (targetW - w) / 2, y + (targetH - h) / 2, w, h);
};

const softenWhiteBackgroundInCanvas = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const { data } = imageData;

    for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];
        if (a === 0) continue;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max - min;
        const whiteness = (r + g + b) / 3;

        if (saturation <= 20 && whiteness >= 246) {
            data[index + 3] = 0;
            continue;
        }

        if (saturation <= 36 && whiteness >= 232) {
            const alphaScale = Math.max(0, Math.min(1, (246 - whiteness) / 14));
            data[index + 3] = Math.round(a * alphaScale);
        }
    }

    ctx.putImageData(imageData, 0, 0);
};

const drawContainWithWhiteRemoval = (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sourceW: number,
    sourceH: number,
    targetW: number,
    targetH: number,
    x: number,
    y: number
) => {
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(1, Math.round(targetW));
    offscreen.height = Math.max(1, Math.round(targetH));
    const offscreenCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!offscreenCtx) {
        drawContain(ctx, source, sourceW, sourceH, targetW, targetH, x, y);
        return;
    }

    offscreenCtx.clearRect(0, 0, offscreen.width, offscreen.height);
    const scale = Math.min(targetW / sourceW, targetH / sourceH);
    const drawWidth = sourceW * scale;
    const drawHeight = sourceH * scale;
    offscreenCtx.drawImage(
        source,
        (targetW - drawWidth) / 2,
        (targetH - drawHeight) / 2,
        drawWidth,
        drawHeight
    );
    softenWhiteBackgroundInCanvas(offscreenCtx, offscreen.width, offscreen.height);
    ctx.drawImage(offscreen, x, y, targetW, targetH);
};

const easeOutCubic = (value: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3);
const easeInOutCubic = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const resolveApiAssetUrl = (url: string) => (
    url.startsWith('http') ? url : `${ASSETS_URL}${url}`
);

const fileFromGeneratedUrl = async (url: string, filename: string, fallbackType: string) => {
    const response = await fetch(resolveApiAssetUrl(url));
    if (!response.ok) throw new Error('AI 生成素材下载失败');
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || fallbackType });
};

const imageFileFromUrlAtSize = async (url: string, filename: string, width: number, height: number) => {
    const image = await loadImage(resolveApiAssetUrl(url));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建图片适配画布');
    ctx.clearRect(0, 0, width, height);
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('图片适配失败')), 'image/png');
    });
    return {
        file: new File([blob], filename, { type: 'image/png' }),
        url: URL.createObjectURL(blob),
    };
};

const getSpotlightSmallFrame = (index: number, elapsed: number) => {
    const availableW = CANVAS_W - SPOTLIGHT_SIDE_MARGIN * 2;
    const gap = (availableW - SPOTLIGHT_SMALL_W * 3) / 2;
    const targetX = SPOTLIGHT_SIDE_MARGIN + index * (SPOTLIGHT_SMALL_W + gap);
    const targetY = CANVAS_H - SPOTLIGHT_BOTTOM_MARGIN - SPOTLIGHT_SMALL_H;
    const enterStart = index * 160;
    const enterProgress = easeOutCubic((elapsed - enterStart) / 520);
    const mergeProgress = easeInOutCubic((elapsed - 1050) / 650);
    const largeX = SPOTLIGHT_SIDE_MARGIN;
    const largeY = CANVAS_H - SPOTLIGHT_BOTTOM_MARGIN - SPOTLIGHT_LARGE_H;
    const largeCenterX = largeX + SPOTLIGHT_LARGE_W / 2;
    const largeCenterY = largeY + SPOTLIGHT_LARGE_H / 2;
    const overshoot = Math.sin(enterProgress * Math.PI) * 22;
    const baseX = targetX;
    const baseY = CANVAS_H + 160 + (targetY - CANVAS_H - 160) * enterProgress - overshoot;
    const baseCenterX = baseX + SPOTLIGHT_SMALL_W / 2;
    const baseCenterY = baseY + SPOTLIGHT_SMALL_H / 2;
    const scale = 1 - mergeProgress * 0.32;
    const width = SPOTLIGHT_SMALL_W * scale;
    const height = SPOTLIGHT_SMALL_H * scale;
    const centerX = baseCenterX + (largeCenterX - baseCenterX) * mergeProgress;
    const centerY = baseCenterY + (largeCenterY - baseCenterY) * mergeProgress;

    return {
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
        opacity: enterProgress * (1 - mergeProgress),
    };
};

const getSpotlightLargeFrame = (elapsed: number) => {
    const progress = easeOutCubic((elapsed - 1280) / 260);
    const width = SPOTLIGHT_LARGE_W;
    const height = SPOTLIGHT_LARGE_H;
    return {
        x: SPOTLIGHT_SIDE_MARGIN,
        y: CANVAS_H - SPOTLIGHT_BOTTOM_MARGIN - SPOTLIGHT_LARGE_H,
        width,
        height,
        opacity: progress,
    };
};

const ConfigWorkspace: React.FC = () => {
    const assetInputRef = useRef<HTMLInputElement>(null);
    const pendantReferenceInputRef = useRef<HTMLInputElement>(null);
    const splashInputRef = useRef<HTMLInputElement>(null);
    const magazineInputRef = useRef<HTMLInputElement>(null);
    const spotlightSmallInputRef = useRef<HTMLInputElement>(null);
    const spotlightLargeInputRef = useRef<HTMLInputElement>(null);
    const spotlightAiReferenceInputRef = useRef<HTMLInputElement>(null);
    const spotlightSplashInputRef = useRef<HTMLInputElement>(null);
    const breakFrameInputRef = useRef<HTMLInputElement>(null);
    const breakSplashInputRef = useRef<HTMLInputElement>(null);
    const breakFocalInputRef = useRef<HTMLInputElement>(null);
    const polyBaseInputRef = useRef<HTMLInputElement>(null);
    const polyCardsInputRef = useRef<HTMLInputElement>(null);
    const polyAiReferenceInputRef = useRef<HTMLInputElement>(null);
    const polyFocalInputRef = useRef<HTMLInputElement>(null);
    const refreshIconsInputRef = useRef<HTMLInputElement>(null);
    const refreshAiReferenceInputRef = useRef<HTMLInputElement>(null);
    const refreshBottomNavInputRef = useRef<HTMLInputElement>(null);
    const refreshBottomNavAiReferenceInputRef = useRef<HTMLInputElement>(null);
    const linkedOpeningInputRef = useRef<HTMLInputElement>(null);
    const linkedFocalInputRef = useRef<HTMLInputElement>(null);
    const [expandedCategory, setExpandedCategory] = useState<string | null>('splash');
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>('dynamic-splash');
    const [categories, setCategories] = useState(defaultCreativeCategories);
    const [creativeTemplates, setCreativeTemplates] = useState<CreativeTemplateItem[]>(defaultCreativeTemplates);
    const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
    const [lockedPreviewTemplateId, setLockedPreviewTemplateId] = useState<string | null>(null);
    const [asset, setAsset] = useState<UploadState>(emptyUpload);
    const [pendantReference, setPendantReference] = useState<UploadState>(emptyUpload);
    const [splash, setSplash] = useState<UploadState>(emptyUpload);
    const [magazineAssets, setMagazineAssets] = useState<MagazineAsset[]>([]);
    const [magazineActiveIndex, setMagazineActiveIndex] = useState(0);
    const [magazineDragOffset, setMagazineDragOffset] = useState(0);
    const [isMagazineDragging, setIsMagazineDragging] = useState(false);
    const [spotlightSmallCards, setSpotlightSmallCards] = useState<SpotlightCardAsset[]>([]);
    const [spotlightLargeCard, setSpotlightLargeCard] = useState<UploadState>(emptyUpload);
    const [spotlightSplash, setSpotlightSplash] = useState<UploadState>(emptyUpload);
    const [spotlightPreviewElapsed, setSpotlightPreviewElapsed] = useState(0);
    const [spotlightAiPrompt, setSpotlightAiPrompt] = useState('');
    const [spotlightAiReference, setSpotlightAiReference] = useState<UploadState>(emptyUpload);
    const [spotlightAiTarget, setSpotlightAiTarget] = useState<SpotlightAiTarget | null>(null);
    const [breakFrameAsset, setBreakFrameAsset] = useState<UploadState>(emptyUpload);
    const [breakSplash, setBreakSplash] = useState<UploadState>(emptyUpload);
    const [breakFocal, setBreakFocal] = useState<UploadState>(emptyUpload);
    const [breakFirstPrompt, setBreakFirstPrompt] = useState('');
    const [breakSecondPrompt, setBreakSecondPrompt] = useState('');
    const [breakFirstReference, setBreakFirstReference] = useState<UploadState>(emptyUpload);
    const [breakSecondReference, setBreakSecondReference] = useState<UploadState>(emptyUpload);
    const [breakIconColor, setBreakIconColor] = useState('#7C5CFF');
    const [breakGradientColor, setBreakGradientColor] = useState('#7C5CFF');
    const [breakColorSchemes, setBreakColorSchemes] = useState(defaultBreakColorSchemes);
    const [breakFirstStartSecond, setBreakFirstStartSecond] = useState(3);
    const [breakSecondStartSecond, setBreakSecondStartSecond] = useState(7);
    const [jumpingFrameAsset, setJumpingFrameAsset] = useState<UploadState>(emptyUpload);
    const [jumpingFocal, setJumpingFocal] = useState<UploadState>(emptyUpload);
    const [jumpingPrompt, setJumpingPrompt] = useState('');
    const [jumpingReference, setJumpingReference] = useState<UploadState>(emptyUpload);
    const [jumpingIconColor, setJumpingIconColor] = useState('#7C5CFF');
    const [jumpingGradientColor, setJumpingGradientColor] = useState('#7C5CFF');
    const [jumpingColorSchemes, setJumpingColorSchemes] = useState(defaultBreakColorSchemes);
    const [polyBase, setPolyBase] = useState<UploadState>(emptyUpload);
    const [polyCards, setPolyCards] = useState<SpotlightCardAsset[]>([]);
    const [polyAiPrompt, setPolyAiPrompt] = useState('');
    const [polyAiReference, setPolyAiReference] = useState<UploadState>(emptyUpload);
    const [polyAiTarget, setPolyAiTarget] = useState<PolyAiTarget | null>(null);
    const [polyFocal, setPolyFocal] = useState<UploadState>(emptyUpload);
    const [polyPreviewElapsed, setPolyPreviewElapsed] = useState(0);
    const [refreshIconSheet, setRefreshIconSheet] = useState<UploadState>(emptyUpload);
    const [refreshAiPrompt, setRefreshAiPrompt] = useState('');
    const [refreshAiReference, setRefreshAiReference] = useState<UploadState>(emptyUpload);
    const [refreshBottomNav, setRefreshBottomNav] = useState<UploadState>(emptyUpload);
    const [refreshBottomNavAiPrompt, setRefreshBottomNavAiPrompt] = useState('');
    const [refreshBottomNavAiReference, setRefreshBottomNavAiReference] = useState<UploadState>(emptyUpload);
    const [linkedOpeningVideo, setLinkedOpeningVideo] = useState<UploadState>(emptyUpload);
    const [linkedFocalVideo, setLinkedFocalVideo] = useState<UploadState>(emptyUpload);
    const [prompt, setPrompt] = useState('');
    const [interactionType, setInteractionType] = useState<CreativeTemplateSettings['interactionType']>(defaultCreativeSettings.interactionType);
    const [cropAreaEnabled, setCropAreaEnabled] = useState(defaultCreativeSettings.cropAreaEnabled);
    const [selectedPlatforms, setSelectedPlatforms] = useState<CreativeTemplateSettings['platforms']>(defaultCreativeSettings.platforms);
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiGeneratingKey, setAiGeneratingKey] = useState<string | null>(null);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);
    const [saveMessage, setSaveMessage] = useState('');
    const [dragTarget, setDragTarget] = useState<CreativeUploadTarget | null>(null);
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const previewVideoRef = useRef<HTMLVideoElement>(null);
    const breakFocalPreviewVideoRef = useRef<HTMLVideoElement>(null);
    const breakFramePreviewVideoRef = useRef<HTMLVideoElement>(null);
    const magazineDragStartXRef = useRef<number | null>(null);
    const magazineDragOffsetRef = useRef(0);
    const [breakPreviewElapsed, setBreakPreviewElapsed] = useState(0);

    useEffect(() => {
        let mounted = true;
        Promise.allSettled([getCreativeSettings(), getCreativeTemplates()])
            .then(([settingsResult, templatesResult]) => {
                if (!mounted) return;

                if (settingsResult.status === 'fulfilled') {
                    const creative = settingsResult.value.creativeTemplateSettings || defaultCreativeSettings;
                    setInteractionType(creative.interactionType || defaultCreativeSettings.interactionType);
                    setCropAreaEnabled(creative.cropAreaEnabled ?? defaultCreativeSettings.cropAreaEnabled);
                    setSelectedPlatforms(creative.platforms?.length ? [creative.platforms[0]] : defaultCreativeSettings.platforms);
                } else {
                    setInteractionType(defaultCreativeSettings.interactionType);
                    setCropAreaEnabled(defaultCreativeSettings.cropAreaEnabled);
                    setSelectedPlatforms(defaultCreativeSettings.platforms);
                }

                if (templatesResult.status === 'fulfilled' && templatesResult.value.length) {
                    const mergedTemplates = defaultCreativeTemplates.map((fallback) => {
                        const remote = templatesResult.value.find((item) => item.id === fallback.id);
                        return remote ? { ...fallback, ...remote } : fallback;
                    });
                    setCreativeTemplates(mergedTemplates);
                    setCategories(buildCreativeCategories(mergedTemplates));
                } else {
                    setCreativeTemplates(defaultCreativeTemplates);
                    setCategories(buildCreativeCategories(defaultCreativeTemplates));
                }

                if (settingsResult.status !== 'fulfilled' || templatesResult.status !== 'fulfilled') {
                    setSaveMessage('后台模版配置读取失败，已使用默认配置');
                }
            })
            .catch(() => {
                if (!mounted) return;
                setCreativeTemplates(defaultCreativeTemplates);
                setCategories(buildCreativeCategories(defaultCreativeTemplates));
                setSaveMessage('后台模版配置读取失败，已使用默认配置');
            });

        return () => {
            mounted = false;
        };
    }, []);

    const activePreviewTemplateId = hoveredTemplateId || lockedPreviewTemplateId;
    const hoveredPreviewTemplate = creativeTemplates.find((tpl) => tpl.id === activePreviewTemplateId) || null;
    const hoveredPreviewVideoUrl = hoveredPreviewTemplate?.preview_video_path || null;

    useEffect(() => {
        if (expandedTemplate !== 'magazine-flip') {
            setMagazineActiveIndex(0);
            setMagazineDragOffset(0);
            setIsMagazineDragging(false);
            magazineDragStartXRef.current = null;
            magazineDragOffsetRef.current = 0;
            return;
        }
        setMagazineActiveIndex((current) => Math.min(Math.max(0, current), Math.max(0, magazineAssets.length - 1)));
        setMagazineDragOffset(0);
        setIsMagazineDragging(false);
        magazineDragStartXRef.current = null;
        magazineDragOffsetRef.current = 0;
    }, [expandedTemplate, magazineAssets.length]);

    useEffect(() => {
        if (expandedTemplate !== 'slide-splash') {
            setSpotlightPreviewElapsed(0);
            return undefined;
        }

        const startedAt = performance.now();
        let frameId = 0;
        const tick = (now: number) => {
            setSpotlightPreviewElapsed((now - startedAt) % SPOTLIGHT_DURATION);
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [expandedTemplate]);

    useEffect(() => {
        if (expandedTemplate !== 'polymorphic-flip-card' || polyCards.length <= 1) {
            setPolyPreviewElapsed(0);
            return undefined;
        }

        const carouselDuration = Math.max(1, polyCards.length - 1) * POLY_CARD_FRAME_MS;
        const loopDuration = carouselDuration + POLY_CARD_FLIP_MS + POLY_CARD_FINAL_HOLD_MS;
        const startedAt = performance.now();
        let frameId = 0;
        const tick = (now: number) => {
            setPolyPreviewElapsed((now - startedAt) % loopDuration);
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [expandedTemplate, polyCards.length]);

    useEffect(() => {
        const isBreakLikeTemplate = isBreakFrameLikeTemplateId(expandedTemplate) && expandedTemplate !== 'refresh-ui-bottom-nav';
        if (!isBreakLikeTemplate || generatedVideoUrl) {
            setBreakPreviewElapsed(0);
            return undefined;
        }

        const startedAt = performance.now();
        const isJumpingFrame = expandedTemplate === 'jumping-focal-window';
        const firstTriggerSecond = Math.max(3, Math.round(breakFirstStartSecond));
        const secondTriggerSecond = Math.max(7, firstTriggerSecond + 4, Number(breakSecondStartSecond) || 7);
        const secondTriggerMs = isJumpingFrame ? 0 : secondTriggerSecond * 1000;
        const loopDuration = isJumpingFrame ? BREAK_DURATION : Math.max(BREAK_DURATION, (secondTriggerSecond + 2) * 1000);
        let frameId = 0;
        const tick = (now: number) => {
            const focalVideo = breakFocalPreviewVideoRef.current;
            const focalDuration = focalVideo && Number.isFinite(focalVideo.duration) ? focalVideo.duration * 1000 : 0;
            if (focalVideo && !focalVideo.paused && focalDuration >= secondTriggerMs + 350) {
                setBreakPreviewElapsed(focalVideo.currentTime * 1000);
            } else {
                setBreakPreviewElapsed((now - startedAt) % loopDuration);
            }
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [expandedTemplate, generatedVideoUrl, breakFocal.url, jumpingFocal.url, breakFirstStartSecond, breakSecondStartSecond]);

    const selectPlatform = (platform: CreativeTemplateSettings['platforms'][number]) => {
        setSelectedPlatforms([platform]);
    };

    const togglePreviewPlayback = () => {
        const video = previewVideoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play();
            setIsPreviewPlaying(true);
        } else {
            video.pause();
            setIsPreviewPlaying(false);
        }
    };

    const handleMagazinePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (expandedTemplate !== 'magazine-flip' || magazineAssets.length <= 1 || generatedVideoUrl) return;
        event.preventDefault();
        magazineDragStartXRef.current = event.clientX;
        magazineDragOffsetRef.current = 0;
        setMagazineDragOffset(0);
        setIsMagazineDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handleMagazinePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (magazineDragStartXRef.current === null || magazineAssets.length <= 1) return;
        const width = event.currentTarget.getBoundingClientRect().width || 1;
        const nextOffset = Math.max(-1, Math.min(1, (event.clientX - magazineDragStartXRef.current) / width));
        magazineDragOffsetRef.current = nextOffset;
        setMagazineDragOffset(nextOffset);
    };

    const finishMagazineDrag = () => {
        if (magazineDragStartXRef.current === null) return;
        const offset = magazineDragOffsetRef.current;
        const threshold = 0.22;
        if (magazineAssets.length > 1 && Math.abs(offset) >= threshold) {
            setMagazineActiveIndex((current) => {
                if (offset < 0) return (current + 1) % magazineAssets.length;
                return (current - 1 + magazineAssets.length) % magazineAssets.length;
            });
        }
        magazineDragStartXRef.current = null;
        magazineDragOffsetRef.current = 0;
        setMagazineDragOffset(0);
        setIsMagazineDragging(false);
    };

    const handleMagazinePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        finishMagazineDrag();
        event.currentTarget.releasePointerCapture?.(event.pointerId);
    };

    const handleTemplateSelect = (templateId: string) => {
        setLockedPreviewTemplateId(templateId);
        if (templateId === expandedTemplate) return;
        resetOutput();
        setError('');
        setIsPreviewPlaying(true);
        setExpandedTemplate(templateId);
    };

    const resetOutput = () => {
        if (generatedVideoUrl?.startsWith('blob:')) URL.revokeObjectURL(generatedVideoUrl);
        setGeneratedVideoUrl(null);
    };

    const clearUploadState = (
        state: UploadState,
        setter: React.Dispatch<React.SetStateAction<UploadState>>,
    ) => {
        if (state.url) URL.revokeObjectURL(state.url);
        setter(emptyUpload);
        setError('');
        resetOutput();
    };

    const loadImageForDownload = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('图片读取失败，无法下载 PNG'));
        image.src = url;
    });

    const loadVideoFrameForDownload = (url: string) => new Promise<HTMLVideoElement>((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve(video);
        };
        video.onloadeddata = () => {
            if (video.currentTime === 0) requestAnimationFrame(done);
            else video.currentTime = 0;
        };
        video.onseeked = done;
        video.onerror = () => reject(new Error('视频读取失败，无法下载 PNG'));
        video.src = url;
    });

    const downloadUploadStateAsPng = async (
        state: UploadState,
        options: { width?: number; height?: number; filename?: string } = {},
    ) => {
        if (!state.url) return;
        setError('');
        try {
            const sourceUrl = state.url.startsWith('/static') ? `${ASSETS_URL}${state.url}` : state.url;
            const isVideo = state.file?.type.startsWith('video/');
            if (isVideo) {
                const video = await loadVideoFrameForDownload(sourceUrl);
                const sourceWidth = video.videoWidth || options.width || CANVAS_W;
                const sourceHeight = video.videoHeight || options.height || CANVAS_H;
                const width = Math.max(1, Math.round(options.width || sourceWidth));
                const height = Math.max(1, Math.round(options.height || sourceHeight));
                const exportSource = state.url.startsWith('/static')
                    ? state.url
                    : state.file
                        ? (await uploadRawAsset(state.file)).url
                        : '';
                if (!exportSource) throw new Error('视频素材未上传，无法导出对应尺寸视频');
                const exported = await exportVideoWithSize({
                    url: exportSource,
                    width,
                    height,
                    maxDurationSec: 5,
                });
                const link = document.createElement('a');
                link.href = resolveApiAssetUrl(exported.url);
                link.download = options.filename?.replace(/\.png$/i, '.mp4') || `${state.file?.name?.replace(/\.[^.]+$/, '') || 'creative-video'}-${width}x${height}.mp4`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                return;
            }
            const source = isVideo
                ? await loadVideoFrameForDownload(sourceUrl)
                : await loadImageForDownload(sourceUrl);
            const sourceWidth = isVideo
                ? ((source as HTMLVideoElement).videoWidth || options.width || PENDANT_SIZE)
                : ((source as HTMLImageElement).naturalWidth || options.width || PENDANT_SIZE);
            const sourceHeight = isVideo
                ? ((source as HTMLVideoElement).videoHeight || options.height || PENDANT_SIZE)
                : ((source as HTMLImageElement).naturalHeight || options.height || PENDANT_SIZE);
            const width = Math.max(1, Math.round(options.width || sourceWidth));
            const height = Math.max(1, Math.round(options.height || sourceHeight));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建 PNG 下载画布');
            ctx.clearRect(0, 0, width, height);
            const scale = Math.min(width / sourceWidth, height / sourceHeight);
            const drawWidth = sourceWidth * scale;
            const drawHeight = sourceHeight * scale;
            const drawX = (width - drawWidth) / 2;
            const drawY = (height - drawHeight) / 2;
            ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG 导出失败')), 'image/png');
            });
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = options.filename || `${state.file?.name?.replace(/\.[^.]+$/, '') || 'creative-asset'}-${width}x${height}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(objectUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'PNG 下载失败');
        }
    };

    const cutoutUploadStateAsPng = async (
        state: UploadState,
        setState: React.Dispatch<React.SetStateAction<UploadState>>,
        key: string,
        options: { width?: number; height?: number; filename?: string } = {},
    ) => {
        if (!state.url || state.file?.type.startsWith('video/')) return;
        setError('');
        resetOutput();
        setAiGeneratingKey(key);

        try {
            const sourceUrl = state.url.startsWith('/static')
                ? state.url
                : state.file
                    ? (await uploadRawAsset(state.file)).url
                    : '';
            if (!sourceUrl) throw new Error('素材未上传，无法抠图');

            const result = await cutoutImageWithAigc({
                imageUrl: sourceUrl,
                width: options.width,
                height: options.height,
                fit: options.width && options.height ? 'contain' : undefined,
            });
            const filename = options.filename || `${state.file?.name?.replace(/\.[^.]+$/, '') || 'creative-asset'}-cutout.png`;
            const nextFile = await fileFromGeneratedUrl(result.resultUrl, filename, 'image/png');
            const nextUrl = URL.createObjectURL(nextFile);
            setState((current) => {
                if (current.url && current.url.startsWith('blob:')) URL.revokeObjectURL(current.url);
                return {
                    ...current,
                    file: nextFile,
                    url: nextUrl,
                    status: current.status === 'invalid' ? 'adapted' : current.status,
                    message: `${current.message || '图片素材'} / 已抠成透明 PNG`,
                    whiteRemovalMode: 'local-key',
                };
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : '图片抠图失败');
        } finally {
            setAiGeneratingKey((current) => current === key ? null : current);
        }
    };

    const uploadRemoveButton = (
        state: UploadState,
        onRemove: () => void,
        title = '删除素材',
        downloadOptions: { width?: number; height?: number; filename?: string } = {},
        cutoutOptions?: {
            key: string;
            setState: React.Dispatch<React.SetStateAction<UploadState>>;
            width?: number;
            height?: number;
            filename?: string;
        },
    ) => state.url ? (
        <div className="absolute right-3 top-3 z-20 flex flex-col gap-2">
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onRemove();
                }}
                className="h-7 w-7 rounded-full bg-black/75 text-white/85 shadow-lg shadow-black/30 border border-white/10 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all"
                title={title}
                aria-label={title}
            >
                <span className="material-symbols-outlined text-[15px]">close</span>
            </button>
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    void downloadUploadStateAsPng(state, downloadOptions);
                }}
                className="h-7 w-7 rounded-full bg-black/75 text-white/85 shadow-lg shadow-black/30 border border-white/10 flex items-center justify-center hover:bg-primary hover:text-white transition-all"
                title="下载素材"
                aria-label="下载素材"
            >
                <span className="material-symbols-outlined text-[15px]">download</span>
            </button>
            {cutoutOptions && !state.file?.type.startsWith('video/') && (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        void cutoutUploadStateAsPng(state, cutoutOptions.setState, cutoutOptions.key, {
                            width: cutoutOptions.width,
                            height: cutoutOptions.height,
                            filename: cutoutOptions.filename,
                        });
                    }}
                    disabled={aiGeneratingKey === cutoutOptions.key}
                    className="h-7 w-7 rounded-full bg-black/75 text-white/85 shadow-lg shadow-black/30 border border-white/10 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all disabled:cursor-wait disabled:opacity-60"
                    title="抠成透明 PNG"
                    aria-label="抠成透明 PNG"
                >
                    <span className={`material-symbols-outlined text-[15px] ${aiGeneratingKey === cutoutOptions.key ? 'animate-spin' : ''}`}>
                        {aiGeneratingKey === cutoutOptions.key ? 'progress_activity' : 'auto_fix_high'}
                    </span>
                </button>
            )}
        </div>
    ) : null;

    const renderAiButtonContent = (key: string, label: string) => (
        <>
            {aiGeneratingKey === key && <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>}
            <span>{aiGeneratingKey === key ? '生成中...' : label}</span>
        </>
    );

    const getAiGeneratingLabel = (key: string | null) => {
        if (!key) return 'AI 正在生成素材';
        if (key.includes('i2v') || key.includes('image') || key.includes('break')) return 'AI 正在生成视频';
        if (key.includes('cutout')) return 'AI 正在抠图处理';
        return 'AI 正在生成图片';
    };

    const matchesAiLoadingKey = (patterns: string | string[]) => {
        if (!aiGeneratingKey) return false;
        const list = Array.isArray(patterns) ? patterns : [patterns];
        return list.some((pattern) => pattern.endsWith('*')
            ? aiGeneratingKey.startsWith(pattern.slice(0, -1))
            : aiGeneratingKey === pattern);
    };

    const renderAiLoadingOverlay = (patterns: string | string[], label?: string) => {
        if (!matchesAiLoadingKey(patterns)) return null;
        return (
            <div className="absolute inset-0 z-30 rounded-[18px] border border-primary/20 bg-zinc-950/80 backdrop-blur-xl flex items-center justify-center overflow-hidden pointer-events-none">
                <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent animate-pulse" />
                <div className="absolute -left-10 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-primary/15 blur-2xl animate-pulse" />
                <div className="absolute -right-8 bottom-0 h-24 w-24 rounded-full bg-cyan-300/10 blur-2xl animate-pulse" />
                <div className="relative flex flex-col items-center gap-3 px-6 text-center">
                    <div className="relative h-14 w-14">
                        <div className="absolute inset-0 rounded-full border border-primary/30 animate-ping" />
                        <div className="absolute inset-1 rounded-full border-2 border-zinc-700 border-t-primary animate-spin" />
                        <div className="absolute inset-4 rounded-full bg-primary shadow-[0_0_22px_rgba(255,46,99,0.55)]" />
                    </div>
                    <div>
                        <p className="text-[12px] font-black text-white tracking-wide">{label || getAiGeneratingLabel(aiGeneratingKey)}</p>
                        <p className="mt-1 text-[9px] font-bold text-zinc-500">处理中，请稍等，完成后会自动写入素材</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-bounce [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:240ms]" />
                    </div>
                </div>
            </div>
        );
    };

    const updateAsset = async (file: File) => {
        setError('');
        resetOutput();
        if (!isCutoutSourceImageFile(file)) {
            setAsset({ file: null, url: null, status: 'invalid', message: '挂件素材仅支持图片' });
            return;
        }

        try {
            const size = await getImageSize(file);
            const isTransparentReady = isPngFile(file);
            const isValid = isTransparentReady && size.width === 450 && size.height === 450;
            if (isValid) {
                const url = URL.createObjectURL(file);
                setAsset({
                    file,
                    url,
                    status: 'valid',
                    message: 'PNG 450 x 450，符合 MR 标准',
                    whiteRemovalMode: 'none',
                });
                return;
            }

            const previewUrl = URL.createObjectURL(file);
            setAsset({
                file,
                url: previewUrl,
                status: 'adapted',
                message: `当前 ${size.width} x ${size.height}，正在自动抠成透明 PNG 450 x 450`,
            });
            setAiGeneratingKey('cutout-pendant-upload');

            const uploaded = await uploadRawAsset(file);
            const result = await cutoutImageWithAigc({
                imageUrl: uploaded.url,
                width: PENDANT_SIZE,
                height: PENDANT_SIZE,
                fit: 'contain',
            });
            const methodLabel = result.method === 'sod-subject-mask' ? '主体抠图' : '本地白底透明化';
            if (result.method !== 'sod-subject-mask') {
                setError('主体抠图不可用，已降级为本地白底透明化；如原图不是白底，背景可能无法完全去除。');
            }
            const nextFile = await fileFromGeneratedUrl(
                result.resultUrl,
                `${file.name.replace(/\.[^.]+$/, '') || 'pendant'}-${PENDANT_SIZE}x${PENDANT_SIZE}-cutout.png`,
                'image/png'
            );
            const nextUrl = URL.createObjectURL(nextFile);
            URL.revokeObjectURL(previewUrl);
            setAsset({
                file: nextFile,
                url: nextUrl,
                status: 'valid',
                message: `${methodLabel}已生成透明 PNG 450 x 450，符合 MR 标准`,
                whiteRemovalMode: result.method === 'sod-subject-mask' ? 'provider-cutout' : 'local-key',
            });
        } catch (err) {
            setAsset({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '图片读取失败' });
        } finally {
            setAiGeneratingKey((current) => current === 'cutout-pendant-upload' ? null : current);
        }
    };

    const updateSplash = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);

        try {
            if (file.type.startsWith('image/')) {
                const size = await getImageSize(file);
                const isValid = size.width === 1440 && size.height === 2340;
                setSplash({
                    file,
                    url,
                    status: isValid ? 'valid' : 'adapted',
                    message: isValid ? '开屏尺寸 1440 x 2340，符合规范' : `当前 ${size.width} x ${size.height}，生成时将 AI 扩展适配至 1440 x 2340`,
                });
                return;
            }

            if (file.type.startsWith('video/')) {
                const meta = await getVideoMeta(file);
                if (meta.duration > 5) {
                    URL.revokeObjectURL(url);
                    setSplash({ file: null, url: null, status: 'invalid', message: `视频时长 ${meta.duration.toFixed(1)}s，需控制在 5s 以内` });
                    return;
                }
                const isValid = meta.width === 1440 && meta.height === 2340;
                setSplash({
                    file,
                    url,
                    status: isValid ? 'valid' : 'adapted',
                    message: isValid ? '视频 5s 内且尺寸合规' : `视频 ${meta.width} x ${meta.height}，生成时将 AI 扩展适配至 1440 x 2340`,
                });
                return;
            }

            URL.revokeObjectURL(url);
            setSplash({ file: null, url: null, status: 'invalid', message: '开屏素材仅支持图片或 5s 内视频' });
        } catch (err) {
            URL.revokeObjectURL(url);
            setSplash({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '开屏素材读取失败' });
        }
    };

    const updateLinkedOpeningVideo = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);

        try {
            if (!file.type.startsWith('video/')) {
                URL.revokeObjectURL(url);
                setLinkedOpeningVideo({ file: null, url: null, status: 'invalid', message: '开屏素材仅支持视频' });
                return;
            }

            const meta = await getVideoMeta(file);
            const hasValidSize = meta.width === CANVAS_W && meta.height === CANVAS_H;
            const hasValidDuration = Number.isFinite(meta.duration) && Math.abs(meta.duration - (LINKED_OPENING_DURATION / 1000)) <= LINKED_OPENING_DURATION_TOLERANCE;

            if (!hasValidSize || !hasValidDuration) {
                URL.revokeObjectURL(url);
                setLinkedOpeningVideo({
                    file: null,
                    url: null,
                    status: 'invalid',
                    message: !hasValidSize
                        ? `视频 ${meta.width} x ${meta.height}，需为 1440 x 2340`
                        : `视频时长 ${meta.duration.toFixed(1)}s，需为 8s`,
                });
                return;
            }

            setLinkedOpeningVideo({
                file,
                url,
                status: 'valid',
                message: '开屏视频 1440 x 2340 / 8s，符合联动规范',
            });
        } catch (err) {
            URL.revokeObjectURL(url);
            setLinkedOpeningVideo({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '开屏视频读取失败' });
        }
    };

    const updateLinkedFocalVideo = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);

        try {
            if (!file.type.startsWith('video/')) {
                URL.revokeObjectURL(url);
                setLinkedFocalVideo({ file: null, url: null, status: 'invalid', message: '焦点视窗素材仅支持视频' });
                return;
            }

            const meta = await getVideoMeta(file);
            if (meta.width !== BREAK_FOCAL_W || meta.height !== BREAK_FOCAL_H) {
                URL.revokeObjectURL(url);
                setLinkedFocalVideo({
                    file: null,
                    url: null,
                    status: 'invalid',
                    message: `视频 ${meta.width} x ${meta.height}，需为 1126 x 900`,
                });
                return;
            }

            setLinkedFocalVideo({
                file,
                url,
                status: 'valid',
                message: `焦点视窗视频 1126 x 900 / ${meta.duration.toFixed(1)}s`,
            });
        } catch (err) {
            URL.revokeObjectURL(url);
            setLinkedFocalVideo({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '焦点视窗视频读取失败' });
        }
    };

    const addMagazineFiles = async (files: FileList | File[]) => {
        setError('');
        resetOutput();
        const incoming = Array.from(files).slice(0, MAGAZINE_MAX_ASSETS - magazineAssets.length);
        if (!incoming.length) return;

        const nextAssets: MagazineAsset[] = [];
        for (const file of incoming) {
            const url = URL.createObjectURL(file);
            try {
                if (file.type.startsWith('image/')) {
                    const size = await getImageSize(file);
                    if (size.width !== CANVAS_W || size.height !== CANVAS_H) {
                        URL.revokeObjectURL(url);
                        setError(`「${file.name}」尺寸为 ${size.width} x ${size.height}，需上传 1440 x 2340px`);
                        continue;
                    }
                    nextAssets.push({
                        id: `${Date.now()}-${file.name}-${nextAssets.length}`,
                        file,
                        url,
                        type: 'image',
                        message: '图片 1440 x 2340',
                    });
                    continue;
                }

                if (file.type.startsWith('video/')) {
                    const meta = await getVideoMeta(file);
                    if (meta.width !== CANVAS_W || meta.height !== CANVAS_H) {
                        URL.revokeObjectURL(url);
                        setError(`「${file.name}」尺寸为 ${meta.width} x ${meta.height}，需上传 1440 x 2340px`);
                        continue;
                    }
                    if (meta.duration > 5) {
                        URL.revokeObjectURL(url);
                        setError(`「${file.name}」视频时长 ${meta.duration.toFixed(1)}s，需控制在 5s 以内`);
                        continue;
                    }
                    nextAssets.push({
                        id: `${Date.now()}-${file.name}-${nextAssets.length}`,
                        file,
                        url,
                        type: 'video',
                        message: `视频 ${meta.duration.toFixed(1)}s`,
                    });
                    continue;
                }

                URL.revokeObjectURL(url);
                setError(`「${file.name}」仅支持图片或视频`);
            } catch (err) {
                URL.revokeObjectURL(url);
                setError(err instanceof Error ? err.message : '素材读取失败');
            }
        }

        setMagazineAssets((current) => [...current, ...nextAssets].slice(0, MAGAZINE_MAX_ASSETS));
    };

    const removeMagazineAsset = (id: string) => {
        setMagazineAssets((current) => {
            const target = current.find((item) => item.id === id);
            if (target) URL.revokeObjectURL(target.url);
            return current.filter((item) => item.id !== id);
        });
        resetOutput();
    };

    const addSpotlightSmallCards = async (files: FileList | File[]) => {
        setError('');
        resetOutput();
        const incoming = Array.from(files).slice(0, 3 - spotlightSmallCards.length);
        if (!incoming.length) return;

        const nextCards: SpotlightCardAsset[] = [];
        for (const file of incoming) {
            const url = URL.createObjectURL(file);
            try {
                if (!isPngFile(file)) {
                    URL.revokeObjectURL(url);
                    setError(`「${file.name}」小卡素材仅支持 PNG`);
                    continue;
                }
                const size = await getImageSize(file);
                const isValidSize = size.width === SPOTLIGHT_SMALL_W && size.height === SPOTLIGHT_SMALL_H;
                if (!isValidSize) {
                    setError(`「${file.name}」尺寸为 ${size.width} x ${size.height}，建议小卡使用宽 275 x 高 370px`);
                }
                nextCards.push({
                    id: `${Date.now()}-${file.name}-${nextCards.length}`,
                    file,
                    url,
                    message: isValidSize ? 'PNG 275 x 370' : `当前 ${size.width} x ${size.height}`,
                });
            } catch (err) {
                URL.revokeObjectURL(url);
                setError(err instanceof Error ? err.message : '小卡素材读取失败');
            }
        }

        setSpotlightSmallCards((current) => [...current, ...nextCards].slice(0, 3));
    };

    const removeSpotlightSmallCard = (id: string) => {
        setSpotlightSmallCards((current) => {
            const target = current.find((item) => item.id === id);
            if (target) URL.revokeObjectURL(target.url);
            return current.filter((item) => item.id !== id);
        });
        resetOutput();
    };

    const upsertSpotlightSmallCardAt = (index: number, card: SpotlightCardAsset) => {
        setSpotlightSmallCards((current) => {
            const next = [...current];
            if (next[index]) URL.revokeObjectURL(next[index].url);
            next[index] = card;
            return next.filter(Boolean).slice(0, 3);
        });
        resetOutput();
    };

    const updateSpotlightLargeCard = async (file: File) => {
        setError('');
        resetOutput();
        if (!isPngFile(file)) {
            setSpotlightLargeCard({ file: null, url: null, status: 'invalid', message: '大卡素材仅支持 PNG' });
            return;
        }

        const url = URL.createObjectURL(file);
        try {
            const size = await getImageSize(file);
            const isValid = size.width === SPOTLIGHT_LARGE_W && size.height === SPOTLIGHT_LARGE_H;
            if (!isValid) URL.revokeObjectURL(url);
            setSpotlightLargeCard({
                file: isValid ? file : null,
                url: isValid ? url : null,
                status: isValid ? 'valid' : 'invalid',
                message: isValid ? 'PNG 897 x 370，符合规范' : `当前 ${size.width} x ${size.height}，需 897 x 370px`,
            });
        } catch (err) {
            URL.revokeObjectURL(url);
            setSpotlightLargeCard({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '大卡素材读取失败' });
        }
    };

    const updateSpotlightSplash = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);

        try {
            if (file.type.startsWith('image/')) {
                const size = await getImageSize(file);
                const isValid = size.width === CANVAS_W && size.height === CANVAS_H;
                if (!isValid) URL.revokeObjectURL(url);
                setSpotlightSplash({
                    file: isValid ? file : null,
                    url: isValid ? url : null,
                    status: isValid ? 'valid' : 'invalid',
                    message: isValid ? '图片 1440 x 2340，符合规范' : `当前 ${size.width} x ${size.height}，需 1440 x 2340px`,
                });
                return;
            }

            if (file.type.startsWith('video/')) {
                const meta = await getVideoMeta(file);
                const isValid = meta.width === CANVAS_W && meta.height === CANVAS_H && meta.duration <= 5;
                if (!isValid) URL.revokeObjectURL(url);
                setSpotlightSplash({
                    file: isValid ? file : null,
                    url: isValid ? url : null,
                    status: isValid ? 'valid' : 'invalid',
                    message: isValid ? `视频 ${meta.duration.toFixed(1)}s，符合规范` : `视频需 1440 x 2340 且 5s 内，当前 ${meta.width} x ${meta.height} / ${meta.duration.toFixed(1)}s`,
                });
                return;
            }

            URL.revokeObjectURL(url);
            setSpotlightSplash({ file: null, url: null, status: 'invalid', message: '开屏素材仅支持图片或视频' });
        } catch (err) {
            URL.revokeObjectURL(url);
            setSpotlightSplash({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '开屏素材读取失败' });
        }
    };

    const getSpotlightAiTargetLabel = (target: SpotlightAiTarget | null) => (
        target === null ? '未选择素材' : target === 'large' ? '大卡素材' : `小卡 ${Number(target.replace('small-', '')) + 1}`
    );

    const updateSpotlightAiReference = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        try {
            if (!file.type.startsWith('image/')) {
                URL.revokeObjectURL(url);
                setSpotlightAiReference({ file: null, url: null, status: 'invalid', message: '参考图仅支持图片' });
                return;
            }
            setSpotlightAiReference((current) => {
                if (current.url) URL.revokeObjectURL(current.url);
                return {
                    file,
                    url,
                    status: 'valid',
                    message: '图生图参考图已上传',
                };
            });
        } catch (err) {
            URL.revokeObjectURL(url);
            setSpotlightAiReference({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '参考图读取失败' });
        }
    };

    const removeSpotlightAiReference = () => {
        clearUploadState(spotlightAiReference, setSpotlightAiReference);
    };

    const generateSelectedSpotlightAsset = async () => {
        if (!spotlightAiTarget) {
            setError('请先点击小卡或大卡素材，再使用 AI 生成。');
            return;
        }

        const target = spotlightAiTarget;
        const isLargeTarget = target === 'large';
        const smallIndex = isLargeTarget ? -1 : Number(target.replace('small-', ''));
        if (!isLargeTarget && smallIndex > spotlightSmallCards.length) {
            setError(`请按顺序先上传或生成小卡 ${spotlightSmallCards.length + 1}`);
            return;
        }

        const generationKey = `spotlight-${target}`;
        const text = spotlightAiPrompt.trim() || '聚光开屏素材';
        setError('');
        resetOutput();
        setAiGeneratingKey(generationKey);

        try {
            const referenceUpload = spotlightAiReference.file
                ? await uploadRawAsset(spotlightAiReference.file)
                : null;
            const promptText = isLargeTarget
                ? [
                    text,
                    '生成一张适合 App 聚光开屏的大卡横向营销图片',
                    '画面干净，有明确主体，高级商业视觉，不要文字，不要 UI 截图，不要 logo'
                ].join('，')
                : [
                    text,
                    `第 ${smallIndex + 1} 张聚光小卡`,
                    '生成一张适合 App 聚光开屏的小卡竖向营销图片',
                    '主体居中清晰，构图简洁，高级商业视觉，不要文字，不要 UI 截图，不要 logo'
                ].join('，');
            const result = referenceUpload
                ? await editImageWithAigc({
                    imageUrl: referenceUpload.url,
                    prompt: promptText,
                    ratio: isLargeTarget ? '16:9' : '3:4',
                })
                : await generateImageWithAigc({
                    prompt: promptText,
                    ratio: isLargeTarget ? '16:9' : '3:4',
                });

            if (isLargeTarget) {
                const fitted = await imageFileFromUrlAtSize(result.resultUrl, 'spotlight-large-ai.png', SPOTLIGHT_LARGE_W, SPOTLIGHT_LARGE_H);
                setSpotlightLargeCard((current) => {
                    if (current.url) URL.revokeObjectURL(current.url);
                    return {
                        file: fitted.file,
                        url: fitted.url,
                        status: 'valid',
                        message: `${referenceUpload ? '美图图生图' : '美图文生图'}已生成 897 x 370`,
                    };
                });
            } else {
                const fitted = await imageFileFromUrlAtSize(result.resultUrl, `spotlight-small-${smallIndex + 1}-ai.png`, SPOTLIGHT_SMALL_W, SPOTLIGHT_SMALL_H);
                upsertSpotlightSmallCardAt(smallIndex, {
                    id: `spotlight-ai-small-${smallIndex + 1}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    file: fitted.file,
                    url: fitted.url,
                    message: `${referenceUpload ? '美图图生图' : '美图文生图'}已生成 275 x 370`,
                });
            }

            setSpotlightAiTarget(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : '聚光开屏 AI 生成失败');
        } finally {
            setAiGeneratingKey((current) => current === generationKey ? null : current);
        }
    };

    const updateBreakFrameAsset = async (file: File) => {
        setError('');
        resetOutput();
        const isJumpingFrame = expandedTemplate === 'jumping-focal-window';
        const frameHeight = isJumpingFrame ? JUMPING_FRAME_H : BREAK_FRAME_H;
        const setFrameAsset = isJumpingFrame ? setJumpingFrameAsset : setBreakFrameAsset;
        if (!isCutoutSourceImageFile(file)) {
            setFrameAsset({ file: null, url: null, status: 'invalid', message: '破框素材仅支持图片' });
            return;
        }

        const url = URL.createObjectURL(file);
        try {
            const size = await getImageSize(file);
            const isValid = size.width === BREAK_FRAME_W && size.height === frameHeight;
            setFrameAsset({
                file,
                url,
                status: isValid ? 'valid' : 'adapted',
                message: isValid
                    ? `PNG/WEBP 1126 x ${frameHeight}，符合规范`
                    : `当前 ${size.width} x ${size.height}，可点击抠成透明 PNG 并放入 1126 x ${frameHeight} 容器`,
            });
        } catch (err) {
            URL.revokeObjectURL(url);
            setFrameAsset({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '破框素材读取失败' });
        }
    };

    const updateBreakSplash = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        try {
            if (file.type.startsWith('image/')) {
                const size = await getImageSize(file);
                const isValid = size.width === BREAK_CANVAS_W && size.height === BREAK_CANVAS_H;
                setBreakSplash({
                    file,
                    url,
                    status: isValid ? 'valid' : 'adapted',
                    message: isValid ? '背景 1126 x 2436，符合焦点视窗规范' : `当前 ${size.width} x ${size.height}，生成时 AI 适配至 1126 x 2436`,
                });
                return;
            }
            if (file.type.startsWith('video/')) {
                const meta = await getVideoMeta(file);
                if (meta.duration > 5) {
                    URL.revokeObjectURL(url);
                    setBreakSplash({ file: null, url: null, status: 'invalid', message: `视频时长 ${meta.duration.toFixed(1)}s，需 5s 内` });
                    return;
                }
                setBreakSplash({
                    file,
                    url,
                    status: meta.width === BREAK_CANVAS_W && meta.height === BREAK_CANVAS_H ? 'valid' : 'adapted',
                    message: meta.width === BREAK_CANVAS_W && meta.height === BREAK_CANVAS_H ? `背景视频 ${meta.duration.toFixed(1)}s，符合规范` : `视频 ${meta.width} x ${meta.height}，生成时 AI 适配至 1126 x 2436`,
                });
                return;
            }
            URL.revokeObjectURL(url);
            setBreakSplash({ file: null, url: null, status: 'invalid', message: '背景素材仅支持图片或视频' });
        } catch (err) {
            URL.revokeObjectURL(url);
            setBreakSplash({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '背景素材读取失败' });
        }
    };

    const updateBreakFocal = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        const isJumpingFrame = expandedTemplate === 'jumping-focal-window';
        const setFocalAsset = isJumpingFrame ? setJumpingFocal : setBreakFocal;
        const setColorSchemes = isJumpingFrame ? setJumpingColorSchemes : setBreakColorSchemes;
        const setIconColor = isJumpingFrame ? setJumpingIconColor : setBreakIconColor;
        const setGradientColor = isJumpingFrame ? setJumpingGradientColor : setBreakGradientColor;
        try {
            if (file.type.startsWith('image/')) {
                const size = await getImageSize(file);
                const isValid = size.width === BREAK_FOCAL_W && size.height === BREAK_FOCAL_H;
                setFocalAsset({
                    file,
                    url,
                    status: isValid ? 'valid' : 'adapted',
                    message: isValid ? '焦点视窗 1126 x 900' : `当前 ${size.width} x ${size.height}，生成时 AI 适配至 1126 x 900`,
                });
                await updateBreakColorSchemesFromSource(url, 'image', {
                    setColorSchemes,
                    setIconColor,
                    setGradientColor,
                });
                return;
            }
            if (file.type.startsWith('video/')) {
                const meta = await getVideoMeta(file);
                setFocalAsset({
                    file,
                    url,
                    status: meta.width === BREAK_FOCAL_W && meta.height === BREAK_FOCAL_H ? 'valid' : 'adapted',
                    message: meta.width === BREAK_FOCAL_W && meta.height === BREAK_FOCAL_H ? `焦点视频 ${meta.duration.toFixed(1)}s` : `视频 ${meta.width} x ${meta.height}，生成时 AI 适配`,
                });
                await updateBreakColorSchemesFromSource(url, 'video', {
                    setColorSchemes,
                    setIconColor,
                    setGradientColor,
                });
                return;
            }
            URL.revokeObjectURL(url);
            setFocalAsset({ file: null, url: null, status: 'invalid', message: '焦点视窗素材仅支持图片或视频' });
        } catch (err) {
            URL.revokeObjectURL(url);
            setFocalAsset({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '焦点视窗读取失败' });
        }
    };

    const updatePolyBase = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        try {
            if (!file.type.startsWith('image/')) {
                URL.revokeObjectURL(url);
                setPolyBase({ file: null, url: null, status: 'invalid', message: '底图仅支持图片' });
                return;
            }
            const size = await getImageSize(file);
            const isValid = size.width === BREAK_FOCAL_W && size.height === BREAK_FOCAL_H;
            setPolyBase({
                file,
                url,
                status: isValid ? 'valid' : 'invalid',
                message: isValid ? '底图 1126 x 900，符合规范' : `当前 ${size.width} x ${size.height}，需 1126 x 900px`,
            });
            if (!isValid) URL.revokeObjectURL(url);
        } catch (err) {
            URL.revokeObjectURL(url);
            setPolyBase({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '底图读取失败' });
        }
    };

    const updatePolyFocal = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        try {
            if (file.type.startsWith('image/')) {
                const size = await getImageSize(file);
                const isValid = size.width === BREAK_FOCAL_W && size.height === BREAK_FOCAL_H;
                setPolyFocal({
                    file,
                    url,
                    status: isValid ? 'valid' : 'invalid',
                    message: isValid ? '焦点视窗 1126 x 900，符合规范' : `当前 ${size.width} x ${size.height}，需 1126 x 900px`,
                });
                if (!isValid) URL.revokeObjectURL(url);
                return;
            }
            if (file.type.startsWith('video/')) {
                const meta = await getVideoMeta(file);
                const isValid = meta.width === BREAK_FOCAL_W && meta.height === BREAK_FOCAL_H;
                setPolyFocal({
                    file,
                    url,
                    status: isValid ? 'valid' : 'invalid',
                    message: isValid ? `焦点视窗视频 1126 x 900，${meta.duration.toFixed(1)}s` : `当前 ${meta.width} x ${meta.height}，需 1126 x 900px`,
                });
                if (!isValid) URL.revokeObjectURL(url);
                return;
            }
            URL.revokeObjectURL(url);
            setPolyFocal({ file: null, url: null, status: 'invalid', message: '焦点视窗素材仅支持图片或视频' });
        } catch (err) {
            URL.revokeObjectURL(url);
            setPolyFocal({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '焦点视窗读取失败' });
        }
    };

    const addPolyCards = async (fileList: FileList) => {
        setError('');
        resetOutput();
        const files = Array.from(fileList).slice(0, 4);
        const nextCards: SpotlightCardAsset[] = [];

        for (const file of files) {
            const url = URL.createObjectURL(file);
            try {
                if (!file.type.startsWith('image/')) {
                    URL.revokeObjectURL(url);
                    continue;
                }
                const size = await getImageSize(file);
                if (size.width !== POLY_CARD_W || size.height !== POLY_CARD_H) {
                    URL.revokeObjectURL(url);
                    setError(`翻卡图片需 840 x 360px，${file.name} 当前 ${size.width} x ${size.height}`);
                    continue;
                }
                nextCards.push({
                    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
                    file,
                    url,
                    message: '840 x 360，符合规范',
                });
            } catch (err) {
                URL.revokeObjectURL(url);
                setError(err instanceof Error ? err.message : '翻卡图片读取失败');
            }
        }

        setPolyCards((current) => [...current, ...nextCards].slice(0, 4));
    };

    const removePolyCard = (id: string) => {
        setPolyCards((current) => {
            const target = current.find((item) => item.id === id);
            if (target) URL.revokeObjectURL(target.url);
            return current.filter((item) => item.id !== id);
        });
        resetOutput();
    };

    const replacePolyCards = (nextCards: SpotlightCardAsset[]) => {
        setPolyCards((current) => {
            current.forEach((item) => URL.revokeObjectURL(item.url));
            return nextCards;
        });
        resetOutput();
    };

    const upsertPolyCardAt = (index: number, card: SpotlightCardAsset) => {
        setPolyCards((current) => {
            const next = [...current];
            if (next[index]) URL.revokeObjectURL(next[index].url);
            next[index] = card;
            return next.filter(Boolean).slice(0, 4);
        });
        resetOutput();
    };

    const getNextPolyAiTarget = (current: PolyAiTarget): PolyAiTarget => {
        if (current === 'base') return 'card-0';
        const index = Number(current.replace('card-', ''));
        return index >= 3 ? 'card-3' : (`card-${index + 1}` as PolyAiTarget);
    };

    const getPolyAiTargetLabel = (target: PolyAiTarget | null) => (
        target === null ? '未选择素材' : target === 'base' ? '底图素材' : `翻卡图片 ${Number(target.replace('card-', '')) + 1}`
    );

    const updatePolyAiReference = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        try {
            if (!file.type.startsWith('image/')) {
                URL.revokeObjectURL(url);
                setPolyAiReference({ file: null, url: null, status: 'invalid', message: '参考图仅支持图片' });
                return;
            }
            setPolyAiReference((current) => {
                if (current.url) URL.revokeObjectURL(current.url);
                return {
                    file,
                    url,
                    status: 'valid',
                    message: '图生图参考图已上传',
                };
            });
        } catch (err) {
            URL.revokeObjectURL(url);
            setPolyAiReference({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '参考图读取失败' });
        }
    };

    const removePolyAiReference = () => {
        clearUploadState(polyAiReference, setPolyAiReference);
    };

    const createPolyCardBlob = async (
        label: string,
        index: number,
        referenceImage?: HTMLImageElement,
    ) => {
        const canvas = document.createElement('canvas');
        canvas.width = POLY_CARD_W;
        canvas.height = POLY_CARD_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建多态翻卡图片');

        const palettes = [
            ['#1D2B64', '#3BC8FF', '#F8CDDA'],
            ['#132A13', '#56AB2F', '#F2FF8F'],
            ['#311847', '#A4508B', '#FFB86C'],
            ['#141E30', '#557C93', '#FCE38A'],
        ];
        const palette = palettes[index % palettes.length];
        const gradient = ctx.createLinearGradient(0, 0, POLY_CARD_W, POLY_CARD_H);
        gradient.addColorStop(0, palette[0]);
        gradient.addColorStop(0.52, palette[1]);
        gradient.addColorStop(1, palette[2]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, POLY_CARD_W, POLY_CARD_H);

        if (referenceImage) {
            ctx.save();
            ctx.globalAlpha = 0.78;
            const offset = 18 * index;
            drawCoverAt(ctx, referenceImage, referenceImage.naturalWidth, referenceImage.naturalHeight, 420 - offset, -18, 440, 396);
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = `rgba(255,255,255,${0.12 + index * 0.03})`;
            ctx.fillRect(0, 0, POLY_CARD_W, POLY_CARD_H);
            ctx.restore();
        }

        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = 0; i < 6; i += 1) {
            ctx.beginPath();
            ctx.arc(84 + i * 132, 270 - i * 24 + index * 8, 42 + i * 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.beginPath();
        ctx.roundRect(42, 68, 380, 190, 38);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '900 54px PingFang SC, sans-serif';
        ctx.fillText(label || `多态卡片 ${index + 1}`, 76, 142);
        ctx.font = '700 28px PingFang SC, sans-serif';
        ctx.fillText(`CARD 0${index + 1}`, 80, 204);

        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((result) => result ? resolve(result) : reject(new Error('多态翻卡图片生成失败')), 'image/png');
        });
    };

    const generatePolyCardsByPrompt = async (source: 'text' | 'image') => {
        const generationKey = `poly-${source}`;
        if (source === 'image' && !polyAiReference.file) {
            setError('请先上传多态翻卡图生图参考图');
            return;
        }
        const shouldUseReference = !!polyAiReference.file;
        setError('');
        resetOutput();
        const text = polyAiPrompt.trim() || '多态翻卡';
        setAiGeneratingKey(generationKey);
        try {
            const labels = ['第一态', '第二态', '第三态', '最终态'];
            const referenceUpload = shouldUseReference
                ? await uploadRawAsset(polyAiReference.file)
                : null;
            const results = await Promise.all(labels.map((label, index) => {
                const promptText = [
                    text,
                    label,
                    '生成一张适合 App 首页多态翻卡的横向营销图片',
                    '画面干净，有明确主体，高级商业视觉，不要文字，不要 UI 截图'
                ].join('，');
                return referenceUpload
                    ? editImageWithAigc({ imageUrl: referenceUpload.url, prompt: promptText, ratio: '7:3' })
                    : generateImageWithAigc({ prompt: promptText, ratio: '7:3' });
            }));
            const nextCards = await Promise.all(results.map(async (result, index) => {
                const file = await fileFromGeneratedUrl(result.resultUrl, `poly-ai-card-${index + 1}.png`, 'image/png');
                return {
                    id: `poly-ai-card-${index + 1}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    file,
                    url: result.resultUrl,
                    message: referenceUpload ? '美图图生图已生成翻卡图片' : '美图文生图已生成翻卡图片',
                };
            }));
            replacePolyCards(nextCards);
        } catch (err) {
            setError(err instanceof Error ? err.message : '多态翻卡 AI 图片生成失败');
        } finally {
            setAiGeneratingKey((current) => current === generationKey ? null : current);
        }
    };

    const generateSelectedPolyAsset = async () => {
        if (!polyAiTarget) {
            setError('请先点击底图素材或某张翻卡图片，再使用 AI 生成。');
            return;
        }
        const generationKey = `poly-${polyAiTarget}`;
        const text = polyAiPrompt.trim() || '多态翻卡';
        const target = polyAiTarget;
        const isBaseTarget = target === 'base';
        const cardIndex = isBaseTarget ? -1 : Number(target.replace('card-', ''));
        if (!isBaseTarget && cardIndex > polyCards.length) {
            setError(`请按顺序先上传或生成翻卡图片 ${polyCards.length + 1}`);
            return;
        }
        setError('');
        resetOutput();
        setAiGeneratingKey(generationKey);

        try {
            const referenceUpload = polyAiReference.file
                ? await uploadRawAsset(polyAiReference.file)
                : null;
            const promptText = isBaseTarget
                ? [
                    text,
                    '生成一张适合 App 首页多态翻卡的底图背景',
                    '完整横向画面，整体连贯，适合作为卡片翻转前的视觉底座',
                    '不要分格，不要按钮，不要 UI 元素，不要 App 截图，不要文字，不要 logo',
                    '高级、清晰、商业视觉'
                ].join('，')
                : [
                    text,
                    `第 ${cardIndex + 1} 张翻卡图片`,
                    '生成一张适合 App 首页多态翻卡的横向营销图片',
                    '画面干净，有明确主体，高级商业视觉，不要文字，不要 UI 截图'
                ].join('，');
            const result = referenceUpload
                ? await editImageWithAigc({
                    imageUrl: referenceUpload.url,
                    prompt: promptText,
                    ratio: isBaseTarget ? '4:3' : '16:9',
                })
                : await generateImageWithAigc({
                    prompt: promptText,
                    ratio: isBaseTarget ? '4:3' : '16:9',
                });

            if (isBaseTarget) {
                const fitted = await imageFileFromUrlAtSize(result.resultUrl, 'poly-base-ai.png', BREAK_FOCAL_W, BREAK_FOCAL_H);
                setPolyBase((current) => {
                    if (current.url) URL.revokeObjectURL(current.url);
                    return {
                        file: fitted.file,
                        url: fitted.url,
                        status: 'valid',
                        message: `${referenceUpload ? '美图图生图' : '美图文生图'}已生成底图 1126 x 900`,
                    };
                });
            } else {
                const fitted = await imageFileFromUrlAtSize(result.resultUrl, `poly-card-${cardIndex + 1}-ai.png`, POLY_CARD_W, POLY_CARD_H);
                upsertPolyCardAt(cardIndex, {
                    id: `poly-ai-card-${cardIndex + 1}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    file: fitted.file,
                    url: fitted.url,
                    message: `${referenceUpload ? '美图图生图' : '美图文生图'}已生成 840 x 360`,
                });
            }

            setPolyAiTarget(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : '多态翻卡 AI 生成失败');
        } finally {
            setAiGeneratingKey((current) => current === generationKey ? null : current);
        }
    };

    const updateRefreshIconSheet = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        try {
            if (file.type.startsWith('image/')) {
                const size = await getImageSize(file);
                const isValid = size.width === REFRESH_ICON_SHEET_W && size.height === REFRESH_ICON_SHEET_H;
                if (!isValid) {
                    URL.revokeObjectURL(url);
                    setRefreshIconSheet((current) => {
                        if (current.url) URL.revokeObjectURL(current.url);
                        return {
                            file: null,
                            url: null,
                            status: 'invalid',
                            message: `当前 ${size.width} x ${size.height}，需 1228 x 674px`,
                        };
                    });
                    return;
                }
                setRefreshIconSheet((current) => {
                    if (current.url) URL.revokeObjectURL(current.url);
                    return {
                        file,
                        url,
                        status: 'valid',
                        message: 'icon 底图 1228 x 674，符合规范',
                    };
                });
                return;
            }
            if (file.type.startsWith('video/')) {
                const meta = await getVideoMeta(file);
                const isValid = meta.width === REFRESH_ICON_SHEET_W && meta.height === REFRESH_ICON_SHEET_H;
                if (!isValid) {
                    URL.revokeObjectURL(url);
                    setRefreshIconSheet((current) => {
                        if (current.url) URL.revokeObjectURL(current.url);
                        return {
                            file: null,
                            url: null,
                            status: 'invalid',
                            message: `视频 ${meta.width} x ${meta.height}，需 1228 x 674px`,
                        };
                    });
                    return;
                }
                setRefreshIconSheet((current) => {
                    if (current.url) URL.revokeObjectURL(current.url);
                    return {
                        file,
                        url,
                        status: 'valid',
                        message: `icon 视频 1228 x 674，${meta.duration.toFixed(1)}s`,
                    };
                });
                return;
            }
            URL.revokeObjectURL(url);
            setRefreshIconSheet({ file: null, url: null, status: 'invalid', message: 'icon 底图仅支持图片或视频' });
        } catch (err) {
            URL.revokeObjectURL(url);
            setRefreshIconSheet({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : 'icon 底图读取失败' });
        }
    };

    const updateRefreshAiReference = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        try {
            if (!file.type.startsWith('image/')) {
                URL.revokeObjectURL(url);
                setRefreshAiReference({ file: null, url: null, status: 'invalid', message: '参考图仅支持图片' });
                return;
            }
            setRefreshAiReference((current) => {
                if (current.url) URL.revokeObjectURL(current.url);
                return {
                    file,
                    url,
                    status: 'valid',
                    message: '参考图已上传',
                };
            });
        } catch (err) {
            URL.revokeObjectURL(url);
            setRefreshAiReference({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '参考图读取失败' });
        }
    };

    const removeRefreshIconSheet = () => {
        setRefreshIconSheet((current) => {
            if (current.url) URL.revokeObjectURL(current.url);
            return emptyUpload;
        });
        setError('');
        resetOutput();
    };

    const downloadRefreshIconSlot = async (
        slot: { x: number; y: number; width: number; height: number; radius: number },
        filename: string,
    ) => {
        if (!refreshIconSheet.url || !refreshIconSheet.file) return;
        setError('');
        try {
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(slot.width);
            canvas.height = Math.round(slot.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建 icon 导出画布');

            const layer = getRefreshIconLayerFrame();
            const source = refreshIconSheet.file.type.startsWith('video/')
                ? await loadVideoElement(refreshIconSheet.url, false)
                : await loadImage(refreshIconSheet.url);
            const scaleX = canvas.width / slot.width;
            const scaleY = canvas.height / slot.height;
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(0, 0, slot.width * scaleX, slot.height * scaleY, getRefreshSlotRadius(slot) * Math.max(scaleX, scaleY));
            ctx.clip();
            ctx.scale(scaleX, scaleY);
            ctx.translate(-slot.x, -slot.y);
            ctx.drawImage(source, layer.x, layer.y, layer.width, layer.height);
            ctx.restore();
            if (source instanceof HTMLVideoElement) source.pause();

            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((result) => result ? resolve(result) : reject(new Error('icon 导出失败')), 'image/png');
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'icon 导出失败');
        }
    };

    const removeRefreshAiReference = () => {
        clearUploadState(refreshAiReference, setRefreshAiReference);
    };

    const generateRefreshIconSheetByPrompt = async () => {
        const generationKey = 'refresh-text';
        const text = refreshAiPrompt.trim() || '焕新UI icon底图';
        setError('');
        resetOutput();
        setAiGeneratingKey(generationKey);
        try {
            setRefreshIconSheet((current) => ({
                ...current,
                status: 'idle',
                message: '美图 AI 正在生成 icon 背景底图...',
            }));
            const promptText = [
                text,
                '生成一张完整的横向大图背景，必须是一整张连续画面',
                '不要分格，不要拼贴，不要九宫格，不要多个小画面，不要 icon 容器边框',
                '画面整体连贯、纹理自然、主体不要太碎，后续系统会自动裁切到不同 icon 位置',
                '不要生成 icon，不要按钮，不要 UI 元素，不要 App 截图，不要文字，不要 logo',
                '高级、清晰、商业视觉'
            ].join('，');
            const referenceUpload = refreshAiReference.file
                ? await uploadRawAsset(refreshAiReference.file)
                : null;
            const result = referenceUpload
                ? await editImageWithAigc({ imageUrl: referenceUpload.url, prompt: promptText, ratio: '16:9' })
                : await generateImageWithAigc({ prompt: promptText, ratio: '16:9' });
            const fitted = await imageFileFromUrlAtSize(
                result.resultUrl,
                'refresh-icon-sheet-ai.png',
                REFRESH_ICON_SHEET_W,
                REFRESH_ICON_SHEET_H,
            );
            setRefreshIconSheet((current) => {
                if (current.url) URL.revokeObjectURL(current.url);
                return {
                    file: fitted.file,
                    url: fitted.url,
                    status: 'valid',
                    message: `${referenceUpload ? '美图图生图' : '美图文生图'}已适配 ${REFRESH_ICON_SHEET_W} x ${REFRESH_ICON_SHEET_H}`,
                };
            });
        } catch (err) {
            setRefreshIconSheet((current) => ({
                ...current,
                status: current.file ? current.status : 'idle',
                message: current.file ? current.message : emptyUpload.message,
            }));
            setError(err instanceof Error ? err.message : 'icon 底图生成失败');
        } finally {
            setAiGeneratingKey((current) => current === generationKey ? null : current);
        }
    };

    const generateRefreshIconVideoByReference = async () => {
        const generationKey = 'refresh-i2v';
        const sourceFile = refreshIconSheet.file && refreshIconSheet.file.type.startsWith('image/')
            ? refreshIconSheet.file
            : refreshAiReference.file;
        if (!sourceFile) {
            setError('请先生成/上传 icon 底图，或上传图生视频参考图');
            return;
        }
        const text = refreshAiPrompt.trim() || '焕新UI动态icon';
        setError('');
        resetOutput();
        setAiGeneratingKey(generationKey);
        try {
            setRefreshIconSheet((current) => ({
                ...current,
                status: 'idle',
                message: '美图 AI 正在生成 icon 动态底图...',
            }));
            const videoTarget = getApproxAigcVideoTarget(REFRESH_ICON_SHEET_W, REFRESH_ICON_SHEET_H);
            const uploaded = await uploadRawAsset(sourceFile);
            const result = await animateImageWithAigc({
                imageUrl: uploaded.url,
                prompt: `${text}，让 icon 底图轻微动态流动，光影自然，高级 App UI 动效，生成比例接近 ${REFRESH_ICON_SHEET_W}:${REFRESH_ICON_SHEET_H}，后续会裁剪到准确尺寸`,
                width: videoTarget.width,
                height: videoTarget.height,
                duration: 5,
            });
            const file = await fileFromGeneratedUrl(result.resultUrl, 'refresh-icon-sheet-ai-video.mp4', 'video/mp4');
            setRefreshIconSheet((current) => {
                if (current.url) URL.revokeObjectURL(current.url);
                return {
                    file,
                    url: result.resultUrl,
                    status: 'valid',
                    message: `美图图生视频已生成：${sourceFile === refreshIconSheet.file ? '基于 icon 底图' : '基于参考图'}`,
                };
            });
        } catch (err) {
            setRefreshIconSheet((current) => ({
                ...current,
                status: current.file ? current.status : 'idle',
                message: current.file ? current.message : emptyUpload.message,
            }));
            setError(err instanceof Error ? err.message : 'icon 图生视频生成失败');
        } finally {
            setAiGeneratingKey((current) => current === generationKey ? null : current);
        }
    };

    const updateRefreshBottomNav = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        try {
            if (file.type.startsWith('image/')) {
                const size = await getImageSize(file);
                const isValid = size.width === REFRESH_BOTTOM_NAV_W && size.height === REFRESH_BOTTOM_NAV_H;
                setRefreshBottomNav({
                    file,
                    url,
                    status: isValid ? 'valid' : 'invalid',
                    message: isValid ? '底导图片 1126 x 252，符合规范' : `当前 ${size.width} x ${size.height}，需 1126 x 252px`,
                });
                if (!isValid) URL.revokeObjectURL(url);
                return;
            }
            if (file.type.startsWith('video/')) {
                const meta = await getVideoMeta(file);
                const isValid = meta.width === REFRESH_BOTTOM_NAV_W && meta.height === REFRESH_BOTTOM_NAV_H;
                setRefreshBottomNav({
                    file,
                    url,
                    status: isValid ? 'valid' : 'invalid',
                    message: isValid ? `底导视频 1126 x 252，${meta.duration.toFixed(1)}s` : `视频 ${meta.width} x ${meta.height}，需 1126 x 252px`,
                });
                if (!isValid) URL.revokeObjectURL(url);
                return;
            }
            URL.revokeObjectURL(url);
            setRefreshBottomNav({ file: null, url: null, status: 'invalid', message: '底导素材仅支持图片或视频' });
        } catch (err) {
            URL.revokeObjectURL(url);
            setRefreshBottomNav({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '底导素材读取失败' });
        }
    };

    const updateRefreshBottomNavAiReference = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        try {
            if (!file.type.startsWith('image/')) {
                URL.revokeObjectURL(url);
                setRefreshBottomNavAiReference({ file: null, url: null, status: 'invalid', message: '参考图仅支持图片' });
                return;
            }
            setRefreshBottomNavAiReference((current) => {
                if (current.url) URL.revokeObjectURL(current.url);
                return {
                    file,
                    url,
                    status: 'valid',
                    message: '底导参考图已上传',
                };
            });
        } catch (err) {
            URL.revokeObjectURL(url);
            setRefreshBottomNavAiReference({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '底导参考图读取失败' });
        }
    };

    const removeRefreshBottomNavAiReference = () => {
        clearUploadState(refreshBottomNavAiReference, setRefreshBottomNavAiReference);
    };

    const generateRefreshBottomNavByPrompt = async () => {
        const generationKey = 'refresh-bottom-nav-text';
        const text = refreshBottomNavAiPrompt.trim() || '焕新 UI 底导背景';
        setError('');
        resetOutput();
        setAiGeneratingKey(generationKey);
        try {
            setRefreshBottomNav((current) => ({
                ...current,
                status: 'idle',
                message: '美图 AI 正在生成底导素材...',
            }));
            const promptText = [
                text,
                '生成一张完整连续的 App 底部导航栏背景素材',
                '横向长条画面，整体连贯，适合放在 App 底部导航区域',
                '不要分格，不要按钮，不要 UI 元素，不要 App 截图，不要文字，不要 logo',
                '高级、清晰、商业视觉'
            ].join('，');
            const referenceUpload = refreshBottomNavAiReference.file
                ? await uploadRawAsset(refreshBottomNavAiReference.file)
                : null;
            const result = referenceUpload
                ? await editImageWithAigc({ imageUrl: referenceUpload.url, prompt: promptText, ratio: '16:9' })
                : await generateImageWithAigc({ prompt: promptText, ratio: '16:9' });
            const fitted = await imageFileFromUrlAtSize(
                result.resultUrl,
                'refresh-bottom-nav-ai.png',
                REFRESH_BOTTOM_NAV_W,
                REFRESH_BOTTOM_NAV_H,
            );
            setRefreshBottomNav((current) => {
                if (current.url) URL.revokeObjectURL(current.url);
                return {
                    file: fitted.file,
                    url: fitted.url,
                    status: 'valid',
                    message: `${referenceUpload ? '美图图生图' : '美图文生图'}已适配 ${REFRESH_BOTTOM_NAV_W} x ${REFRESH_BOTTOM_NAV_H}`,
                };
            });
        } catch (err) {
            setRefreshBottomNav((current) => ({
                ...current,
                status: current.file ? current.status : 'idle',
                message: current.file ? current.message : emptyUpload.message,
            }));
            setError(err instanceof Error ? err.message : '底导图片生成失败');
        } finally {
            setAiGeneratingKey((current) => current === generationKey ? null : current);
        }
    };

    const generateRefreshBottomNavVideoByReference = async () => {
        const generationKey = 'refresh-bottom-nav-i2v';
        const sourceFile = refreshBottomNav.file && refreshBottomNav.file.type.startsWith('image/')
            ? refreshBottomNav.file
            : refreshBottomNavAiReference.file;
        if (!sourceFile) {
            setError('请先生成/上传底导图片，或上传底导图生视频参考图');
            return;
        }
        const text = refreshBottomNavAiPrompt.trim() || '底导轻微动态流动';
        setError('');
        resetOutput();
        setAiGeneratingKey(generationKey);
        try {
            setRefreshBottomNav((current) => ({
                ...current,
                status: 'idle',
                message: '美图 AI 正在生成底导动态素材...',
            }));
            const videoTarget = getApproxAigcVideoTarget(REFRESH_BOTTOM_NAV_W, REFRESH_BOTTOM_NAV_H);
            const uploaded = await uploadRawAsset(sourceFile);
            const result = await animateImageWithAigc({
                imageUrl: uploaded.url,
                prompt: `${text}，让底部导航栏背景轻微动态流动，光影自然，高级 App UI 动效，生成比例接近 ${REFRESH_BOTTOM_NAV_W}:${REFRESH_BOTTOM_NAV_H}，后续会裁剪到准确尺寸`,
                width: videoTarget.width,
                height: videoTarget.height,
                duration: 5,
            });
            const file = await fileFromGeneratedUrl(result.resultUrl, 'refresh-bottom-nav-ai-video.mp4', 'video/mp4');
            setRefreshBottomNav((current) => {
                if (current.url) URL.revokeObjectURL(current.url);
                return {
                    file,
                    url: result.resultUrl,
                    status: 'valid',
                    message: `美图图生视频已生成：${sourceFile === refreshBottomNav.file ? '基于底导素材' : '基于参考图'}`,
                };
            });
        } catch (err) {
            setRefreshBottomNav((current) => ({
                ...current,
                status: current.file ? current.status : 'idle',
                message: current.file ? current.message : emptyUpload.message,
            }));
            setError(err instanceof Error ? err.message : '底导图生视频生成失败');
        } finally {
            setAiGeneratingKey((current) => current === generationKey ? null : current);
        }
    };

    const updateBreakReference = async (phase: 0 | 1, file: File) => {
        setError('');
        resetOutput();
        const setReference = expandedTemplate === 'jumping-focal-window'
            ? setJumpingReference
            : phase === 0 ? setBreakFirstReference : setBreakSecondReference;
        try {
            if (!file.type.startsWith('image/')) {
                setReference({ file: null, url: null, status: 'invalid', message: '参考图仅支持图片' });
                return;
            }
            const url = URL.createObjectURL(file);
            setReference({
                file,
                url,
                status: 'valid',
                message: phase === 0 ? '第一次参考图已上传' : '第二次参考图已上传',
            });
        } catch (err) {
            setReference({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '参考图读取失败' });
        }
    };

    const removeBreakReference = (phase: 0 | 1) => {
        const reference = expandedTemplate === 'jumping-focal-window'
            ? jumpingReference
            : phase === 0 ? breakFirstReference : breakSecondReference;
        const setReference = expandedTemplate === 'jumping-focal-window'
            ? setJumpingReference
            : phase === 0 ? setBreakFirstReference : setBreakSecondReference;
        clearUploadState(reference, setReference);
    };

    const updateBreakColorSchemesFromSource = async (
        sourceUrl: string,
        type: 'image' | 'video',
        setters: {
            setColorSchemes: React.Dispatch<React.SetStateAction<typeof defaultBreakColorSchemes>>;
            setIconColor: React.Dispatch<React.SetStateAction<string>>;
            setGradientColor: React.Dispatch<React.SetStateAction<string>>;
        } = {
            setColorSchemes: setBreakColorSchemes,
            setIconColor: setBreakIconColor,
            setGradientColor: setBreakGradientColor,
        },
    ) => {
        try {
            let paletteSource = sourceUrl;
            if (type === 'video') {
                const video = await loadVideoElement(sourceUrl);
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || BREAK_FOCAL_W;
                canvas.height = video.videoHeight || BREAK_FOCAL_H;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    paletteSource = canvas.toDataURL('image/png');
                }
                video.pause();
            }
            const palette = await extractSmartPalette(paletteSource, { bottomRegionHeight: 0.3 });
            const nextSchemes = palette.slice(0, 3).map((item, index) => ({
                ...item,
                id: `smart-${index}`,
                label: `智能配色 ${index + 1}`,
            }));
            if (nextSchemes.length) {
                setters.setColorSchemes(nextSchemes);
                setters.setIconColor(nextSchemes[0].iconColor);
                setters.setGradientColor(nextSchemes[0].gradientColor);
            }
        } catch (err) {
            console.warn('破框焦点视窗智能配色失败', err);
            setters.setColorSchemes(defaultBreakColorSchemes);
            setters.setIconColor(defaultBreakColorSchemes[0].iconColor);
            setters.setGradientColor(defaultBreakColorSchemes[0].gradientColor);
        }
    };

    const applyBreakColorScheme = (scheme: typeof defaultBreakColorSchemes[number]) => {
        if (expandedTemplate === 'jumping-focal-window') {
            setJumpingIconColor(scheme.iconColor);
            setJumpingGradientColor(scheme.gradientColor);
        } else {
            setBreakIconColor(scheme.iconColor);
            setBreakGradientColor(scheme.gradientColor);
        }
        resetOutput();
    };

    const applyRandomBreakPresetColor = () => {
        const currentIconColor = expandedTemplate === 'jumping-focal-window' ? jumpingIconColor : breakIconColor;
        const currentGradientColor = expandedTemplate === 'jumping-focal-window' ? jumpingGradientColor : breakGradientColor;
        const currentIndex = defaultBreakColorSchemes.findIndex((scheme) => (
            scheme.iconColor === currentIconColor && scheme.gradientColor === currentGradientColor
        ));
        const availableSchemes = defaultBreakColorSchemes.filter((_, index) => index !== currentIndex);
        const pool = availableSchemes.length ? availableSchemes : defaultBreakColorSchemes;
        const nextScheme = pool[Math.floor(Math.random() * pool.length)];
        applyBreakColorScheme(nextScheme);
    };

    const refreshBreakSmartColors = async () => {
        const focalAsset = expandedTemplate === 'jumping-focal-window' ? jumpingFocal : breakFocal;
        const setColorSchemes = expandedTemplate === 'jumping-focal-window' ? setJumpingColorSchemes : setBreakColorSchemes;
        const setIconColor = expandedTemplate === 'jumping-focal-window' ? setJumpingIconColor : setBreakIconColor;
        const setGradientColor = expandedTemplate === 'jumping-focal-window' ? setJumpingGradientColor : setBreakGradientColor;
        if (!focalAsset.url || !focalAsset.file) {
            setError('请先上传焦点视窗素材，再进行智能配色');
            return;
        }
        setError('');
        await updateBreakColorSchemesFromSource(
            focalAsset.url,
            focalAsset.file.type.startsWith('video/') ? 'video' : 'image',
            { setColorSchemes, setIconColor, setGradientColor },
        );
        resetOutput();
    };

    const createForegroundVideoAsset = async (
        videoUrl: string,
        filename: string,
        promptText: string,
        maxWidth: number,
        maxHeight: number,
    ) => {
        const cutoutResult = await cutoutVideoWithAigc({
            videoUrl,
            prompt: `${promptText}\n仅保留主体，去除白色或近白背景，输出适合透明前景叠加的视频`,
            fps: 24,
            maxDurationSec: 5,
            maxWidth,
            maxHeight,
        });
        const cutoutUrl = cutoutResult.resultUrl || videoUrl;
        const sizedResult = await exportVideoWithSize({
            url: cutoutUrl,
            width: maxWidth,
            height: maxHeight,
            maxDurationSec: 5,
        });
        const finalUrl = sizedResult.url || cutoutUrl;
        const finalFile = await fileFromGeneratedUrl(finalUrl, filename.replace(/\.[^.]+$/, '.mp4'), 'video/mp4');
        return {
            file: finalFile,
            url: finalUrl,
            whiteRemovalMode: (cutoutResult.method === 'provider-cutout'
                ? 'provider-cutout'
                : 'local-key') as UploadState['whiteRemovalMode'],
            messageSuffix: cutoutResult.method === 'provider-cutout'
                ? '已抠视频去白底'
                : '已去白底（本地兜底）',
        };
    };

    const generateBreakFrameByPrompt = async (source: 'text' | 'image', phase: 0 | 1) => {
        const generationKey = `break-${phase}-${source}`;
        const isJumpingFrame = expandedTemplate === 'jumping-focal-window';
        const activeFrameAsset = isJumpingFrame ? jumpingFrameAsset : breakFrameAsset;
        const setActiveFrameAsset = isJumpingFrame ? setJumpingFrameAsset : setBreakFrameAsset;
        const frameHeight = isJumpingFrame ? JUMPING_FRAME_H : BREAK_FRAME_H;
        const firstText = (isJumpingFrame ? jumpingPrompt : breakFirstPrompt).trim() || '第一次破框创意';
        const secondText = breakSecondPrompt.trim() || '第二次破框创意';
        const phaseText = isJumpingFrame ? firstText : (phase === 0 ? firstText : secondText);
        const phaseTitle = isJumpingFrame ? '跃动破框' : (phase === 0 ? '第一次破框' : '第二次破框');
        const phaseReferenceFile = isJumpingFrame
            ? jumpingReference.file
            : (phase === 0 ? breakFirstReference.file : breakSecondReference.file);
        const imageSourceFile = activeFrameAsset.file?.type.startsWith('image/')
            ? activeFrameAsset.file
            : phaseReferenceFile;
        if (source === 'image' && !imageSourceFile) {
            setError(`请先上传/生成破框图片，或上传${isJumpingFrame ? '跃动破框' : (phase === 0 ? '第一次破框' : '第二次破框')}参考图`);
            return null;
        }
        setError('');
        setAiGeneratingKey(generationKey);
        const fullPrompt = isJumpingFrame
            ? [
                `跃动破框：${firstText}`,
                '破框素材从第0秒开始播放',
                `生成方式：${source === 'text' ? '文生视频' : '图生视频'}`,
                source === 'image' ? (imageSourceFile === activeFrameAsset.file ? '使用破框素材区图片作为视频底图' : '使用参考图作为视频底图') : ''
            ].join('\n')
            : [
                `${phaseTitle}：${phaseText}`,
                `生成方式：${source === 'text' ? '文生视频' : '图生视频'}`,
                source === 'image' ? (imageSourceFile === activeFrameAsset.file ? '使用破框素材区图片作为视频底图' : '使用参考图作为视频底图') : ''
            ].join('\n');
        try {
            setActiveFrameAsset((current) => ({
                ...current,
                status: 'idle',
                message: `美图 AI 正在生成${source === 'text' ? '文生视频' : '图生视频'}...`,
            }));
            const videoTarget = getApproxAigcVideoTarget(BREAK_FRAME_W, frameHeight);
            const promptText = [
                fullPrompt,
                '主体轻微跃出边界，光影自然，商业质感，不要文字'
            ].join('\n');
            const result = source === 'image'
                ? await animateImageWithAigc({
                    imageUrl: (await uploadRawAsset(imageSourceFile as File)).url,
                    prompt: promptText,
                    width: videoTarget.width,
                    height: videoTarget.height,
                    duration: isJumpingFrame ? 3 : 5,
                })
                : await generateVideoWithAigc({
                    prompt: promptText,
                    ratio: videoTarget.ratio,
                    duration: isJumpingFrame ? 3 : 5,
                });
            const foregroundVideo = await createForegroundVideoAsset(
                result.resultUrl,
                'break-frame-ai.mp4',
                promptText,
                BREAK_FRAME_W,
                frameHeight,
            );
            setActiveFrameAsset({
                file: foregroundVideo.file,
                url: foregroundVideo.url,
                status: 'valid',
                whiteRemovalMode: foregroundVideo.whiteRemovalMode,
                message: `美图${source === 'text' ? '文生视频' : '图生视频'}已生成：${phaseText.slice(0, 10) || '破框素材'}，${foregroundVideo.messageSuffix}`,
            });
            return foregroundVideo.url;
        } catch (err) {
            setActiveFrameAsset((current) => ({
                ...current,
                status: current.file ? current.status : 'idle',
                message: current.file ? current.message : emptyUpload.message,
            }));
            setError(err instanceof Error ? err.message : '破框 AI 视频生成失败');
            return null;
        } finally {
            setAiGeneratingKey((current) => current === generationKey ? null : current);
        }
    };

    const handleUploadDragOver = (event: React.DragEvent, target: CreativeUploadTarget) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        setDragTarget(target);
    };

    const handleUploadDragLeave = (event: React.DragEvent, target: CreativeUploadTarget) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragTarget((current) => current === target ? null : current);
    };

    const handleUploadDrop = async (event: React.DragEvent, target: CreativeUploadTarget) => {
        event.preventDefault();
        event.stopPropagation();
        setDragTarget(null);

        const files = event.dataTransfer.files;
        if (!files?.length) return;

        if (target === 'asset') await updateAsset(files[0]);
        else if (target === 'splash') await updateSplash(files[0]);
        else if (target === 'magazine') await addMagazineFiles(files);
        else if (target === 'spotlight-small') await addSpotlightSmallCards(files);
        else if (target === 'spotlight-large') await updateSpotlightLargeCard(files[0]);
        else if (target === 'spotlight-splash') await updateSpotlightSplash(files[0]);
        else if (target === 'break-frame') await updateBreakFrameAsset(files[0]);
        else if (target === 'break-splash') await updateBreakSplash(files[0]);
        else if (target === 'break-focal') await updateBreakFocal(files[0]);
        else if (target === 'poly-base') await updatePolyBase(files[0]);
        else if (target === 'poly-focal') await updatePolyFocal(files[0]);
        else if (target === 'refresh-icons') await updateRefreshIconSheet(files[0]);
        else if (target === 'refresh-bottom-nav') await updateRefreshBottomNav(files[0]);
        else if (target === 'linked-opening') await updateLinkedOpeningVideo(files[0]);
        else if (target === 'linked-focal') await updateLinkedFocalVideo(files[0]);
        else await addPolyCards(files);
    };

    const generateLocalPromptAsset = async (text: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 450;
        canvas.height = 450;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建提示词素材');

        const gradient = ctx.createLinearGradient(0, 0, 450, 450);
        gradient.addColorStop(0, '#63e6be');
        gradient.addColorStop(0.45, '#4c6fff');
        gradient.addColorStop(1, '#ff4d8d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 450, 450);

        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        for (let i = 0; i < 8; i += 1) {
            ctx.beginPath();
            ctx.arc(80 + i * 52, 350 - i * 28, 42 + i * 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(40, 304, 370, 82);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 28px PingFang SC, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(text.slice(0, 10), 225, 354);

        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((result) => result ? resolve(result) : reject(new Error('提示词素材生成失败')), 'image/png');
        });
        const file = new File([blob], 'prompt-mr-asset.png', { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        setAsset({
            file,
            url,
            status: 'valid',
            message: '本地已生成 PNG 450 x 450，符合 MR 标准',
        });
        return url;
    };

    const cutoutPendantGeneratedImage = async (imageUrl: string, filename: string) => {
        const result = await cutoutImageWithAigc({
            imageUrl,
            width: PENDANT_SIZE,
            height: PENDANT_SIZE,
            fit: 'contain',
        });
        if (result.method !== 'sod-subject-mask') {
            setError('主体抠图不可用，已降级为本地白底透明化；如边缘不干净，请换一张主体更清晰、背景更简单的参考图。');
        }
        const file = await fileFromGeneratedUrl(result.resultUrl, filename, 'image/png');
        return {
            file,
            url: result.resultUrl,
            method: result.method,
        };
    };

    const generatePromptAsset = async () => {
        const generationKey = 'pendant-text';
        const text = prompt.trim() || '炫动开屏素材';
        setError('');
        resetOutput();
        setAiGeneratingKey(generationKey);

        try {
            setAsset((current) => ({
                ...current,
                status: 'idle',
                message: '美图 AI 正在生成 450 x 450 挂件素材...',
            }));
            const promptText = `${text}，单个 450x450 App 开屏挂件素材，透明背景，主体边缘干净，主体清晰，高级商业视觉，不要文字`;
            const referenceUpload = pendantReference.file
                ? await uploadRawAsset(pendantReference.file)
                : null;
            const result = referenceUpload
                ? await editImageWithAigc({
                    imageUrl: referenceUpload.url,
                    prompt: promptText,
                    ratio: '1:1',
                    transparentWhite: false,
                })
                : await generateImageWithAigc({
                    prompt: promptText,
                    ratio: '1:1',
                    transparentWhite: false,
                });
            const cutout = await cutoutPendantGeneratedImage(result.resultUrl, 'ai-pendant-asset.png');
            setAsset({
                file: cutout.file,
                url: cutout.url,
                status: 'valid',
                message: `${referenceUpload ? '美图图生图' : '美图文生图'}已生成并主体抠图为 450 x 450 透明 PNG`,
                whiteRemovalMode: cutout.method === 'sod-subject-mask' ? 'provider-cutout' : 'local-key',
            });
            return cutout.url;
        } catch (err) {
            console.warn('炫动开屏 AI 生成失败，降级本地素材', err);
            const fallbackUrl = await generateLocalPromptAsset(text);
            setError(err instanceof Error ? `AI 生成暂不可用，已先生成本地预览素材。原因：${err.message}` : 'AI 生成暂不可用，已先生成本地预览素材');
            return fallbackUrl;
        } finally {
            setAiGeneratingKey((current) => current === generationKey ? null : current);
        }
    };

    const updatePendantReference = async (file: File) => {
        setError('');
        resetOutput();
        const url = URL.createObjectURL(file);
        try {
            if (!file.type.startsWith('image/')) {
                URL.revokeObjectURL(url);
                setPendantReference({ file: null, url: null, status: 'invalid', message: '参考图仅支持图片' });
                return;
            }
            setPendantReference((current) => {
                if (current.url) URL.revokeObjectURL(current.url);
                return {
                    file,
                    url,
                    status: 'valid',
                    message: '图生图参考图已上传',
                };
            });
        } catch (err) {
            URL.revokeObjectURL(url);
            setPendantReference({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '参考图读取失败' });
        }
    };

    const removePendantReference = () => {
        clearUploadState(pendantReference, setPendantReference);
    };

    const generatePendantAssetFromReference = async () => {
        const generationKey = 'pendant-image';
        if (!pendantReference.file) {
            setError('请先上传图生图参考图');
            return null;
        }
        const text = prompt.trim() || '炫动开屏素材';
        setError('');
        resetOutput();
        setAiGeneratingKey(generationKey);

        try {
            setAsset((current) => ({
                ...current,
                status: 'idle',
                message: '美图 AI 图生图正在生成 450 x 450 挂件素材...',
            }));
            const uploaded = await uploadRawAsset(pendantReference.file);
            const result = await editImageWithAigc({
                imageUrl: uploaded.url,
                prompt: `${text}，参考图主体改造成 450x450 App 开屏挂件素材，透明背景，主体边缘干净，主体清晰，高级商业视觉，不要文字`,
                ratio: '1:1',
                transparentWhite: false,
            });
            const cutout = await cutoutPendantGeneratedImage(result.resultUrl, 'image-to-pendant-asset.png');
            setAsset((current) => {
                if (current.url) URL.revokeObjectURL(current.url);
                return {
                    file: cutout.file,
                    url: cutout.url,
                    status: 'valid',
                    message: '美图图生图已生成并主体抠图为 450 x 450 透明 PNG',
                    whiteRemovalMode: cutout.method === 'sod-subject-mask' ? 'provider-cutout' : 'local-key',
                };
            });
            return cutout.url;
        } catch (err) {
            setAsset((current) => ({
                ...current,
                status: current.file ? current.status : 'idle',
                message: current.file ? current.message : emptyUpload.message,
            }));
            setError(err instanceof Error ? err.message : '图生图素材生成失败');
            return null;
        } finally {
            setAiGeneratingKey((current) => current === generationKey ? null : current);
        }
    };

    const buildMagazineVideo = async () => {
        setError('');
        resetOutput();

        if (magazineAssets.length < MAGAZINE_MIN_ASSETS || magazineAssets.length > MAGAZINE_MAX_ASSETS) {
            setError('杂志翻页需要上传 3-5 张图片或视频素材');
            return;
        }

        setIsGenerating(true);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_W;
            canvas.height = CANVAS_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建视频画布');

            const sources = await Promise.all(magazineAssets.map(async (item) => {
                if (item.type === 'image') {
                    return { type: 'image' as const, source: await loadImage(item.url), width: CANVAS_W, height: CANVAS_H };
                }
                const video = await loadVideoElement(item.url);
                return { type: 'video' as const, source: video, width: video.videoWidth || CANVAS_W, height: video.videoHeight || CANVAS_H };
            }));

            const mimeType = [
                'video/mp4;codecs=h264',
                'video/webm;codecs=vp9',
                'video/webm',
            ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : { videoBitsPerSecond: 6_000_000 });
            const chunks: Blob[] = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
            };

            const done = new Promise<Blob>((resolve) => {
                recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
            });

            const duration = sources.length * MAGAZINE_FRAME_MS;
            const start = performance.now();
            recorder.start();

            const drawFrame = (now: number) => {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const loopElapsed = Math.min(elapsed, duration - 1);
                const activeIndex = Math.floor(loopElapsed / MAGAZINE_FRAME_MS) % sources.length;
                const nextIndex = (activeIndex + 1) % sources.length;
                const localProgress = (loopElapsed % MAGAZINE_FRAME_MS) / MAGAZINE_FRAME_MS;
                const current = sources[activeIndex];
                const next = sources[nextIndex];

                ctx.fillStyle = '#050505';
                ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
                drawCoverAt(ctx, current.source, current.width, current.height, -localProgress * CANVAS_W, 0, CANVAS_W, CANVAS_H);
                drawCoverAt(ctx, next.source, next.width, next.height, (1 - localProgress) * CANVAS_W, 0, CANVAS_W, CANVAS_H);

                if (progress < 1) {
                    requestAnimationFrame(drawFrame);
                } else {
                    recorder.stop();
                    sources.forEach((item) => {
                        if (item.type === 'video') item.source.pause();
                    });
                }
            };

            requestAnimationFrame(drawFrame);
            const output = await done;
            await setGeneratedVideoFromRecording(
                output,
                'magazine-flip-recording.mp4',
                CANVAS_W,
                CANVAS_H,
                Math.ceil(duration / 1000),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : '杂志翻页视频合成失败');
        } finally {
            setIsGenerating(false);
        }
    };

    const persistRecordedVideoAsMp4 = async (
        blob: Blob,
        filename: string,
        width: number,
        height: number,
        maxDurationSec: number,
    ) => {
        const sourceType = blob.type || 'video/webm';
        const sourceExt = sourceType.includes('mp4') ? 'mp4' : 'webm';
        const sourceFile = new File([blob], filename.replace(/\.[^.]+$/, `.${sourceExt}`), { type: sourceType });
        const uploaded = await uploadRawAsset(sourceFile);
        const exported = await exportVideoWithSize({
            url: uploaded.url,
            width,
            height,
            maxDurationSec,
        });
        return resolveApiAssetUrl(exported.url || uploaded.url);
    };

    const setGeneratedVideoFromRecording = async (
        blob: Blob,
        filename: string,
        width: number,
        height: number,
        maxDurationSec: number,
    ) => {
        const outputUrl = await persistRecordedVideoAsMp4(blob, filename, width, height, maxDurationSec);
        setGeneratedVideoUrl(outputUrl);
    };

    const buildSpotlightVideo = async () => {
        setError('');
        resetOutput();

        if (spotlightSmallCards.length !== 3) {
            setError('聚光开屏需要上传 3 张小卡素材');
            return;
        }
        if (!spotlightLargeCard.url || spotlightLargeCard.status !== 'valid') {
            setError('请上传 1 张 897 x 370px 的大卡素材');
            return;
        }
        if (!spotlightSplash.url || !spotlightSplash.file || spotlightSplash.status !== 'valid') {
            setError('请上传 1440 x 2340px 的开屏素材');
            return;
        }

        setIsGenerating(true);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_W;
            canvas.height = CANVAS_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建视频画布');

            const smallImages = await Promise.all(spotlightSmallCards.map((item) => loadImage(item.url)));
            const largeImage = await loadImage(spotlightLargeCard.url);
            const splashIsVideo = spotlightSplash.file.type.startsWith('video/');
            const splashImage = splashIsVideo ? null : await loadImage(spotlightSplash.url);
            const splashVideo = splashIsVideo ? await loadVideoElement(spotlightSplash.url) : null;
            const spotlightTemplate = creativeTemplates.find((tpl) => tpl.id === 'slide-splash');
            const interactionAssetPath = spotlightTemplate?.interaction_asset_path || SPOTLIGHT_GALLERY_INTERACTION_PATH;
            const interactionImage = interactionAssetPath ? await loadImage(resolveApiAssetUrl(interactionAssetPath)) : null;

            const mimeType = [
                'video/mp4;codecs=h264',
                'video/webm;codecs=vp9',
                'video/webm',
            ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : { videoBitsPerSecond: 6_000_000 });
            const chunks: Blob[] = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
            };

            const done = new Promise<Blob>((resolve) => {
                recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
            });

            const start = performance.now();
            recorder.start();

            const drawFrame = (now: number) => {
                const elapsed = Math.min(now - start, SPOTLIGHT_DURATION);

                if (splashVideo && splashVideo.readyState >= 2) {
                    drawCover(ctx, splashVideo, splashVideo.videoWidth || CANVAS_W, splashVideo.videoHeight || CANVAS_H, CANVAS_W, CANVAS_H);
                } else if (splashImage) {
                    drawCover(ctx, splashImage, splashImage.naturalWidth, splashImage.naturalHeight, CANVAS_W, CANVAS_H);
                } else {
                    ctx.fillStyle = '#050505';
                    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
                }

                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.34)';
                ctx.shadowBlur = 34;
                smallImages.forEach((image, index) => {
                    const frame = getSpotlightSmallFrame(index, elapsed);
                    if (frame.opacity <= 0.01) return;
                    ctx.globalAlpha = frame.opacity;
                    ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height);
                });

                const largeFrame = getSpotlightLargeFrame(elapsed);
                if (largeFrame.opacity > 0.01) {
                    ctx.globalAlpha = largeFrame.opacity;
                    ctx.drawImage(largeImage, largeFrame.x, largeFrame.y, largeFrame.width, largeFrame.height);
                }
                ctx.restore();
                ctx.globalAlpha = 1;
                if (interactionImage) {
                    ctx.drawImage(interactionImage, 0, 0, CANVAS_W, CANVAS_H);
                }

                if (elapsed < SPOTLIGHT_DURATION) {
                    requestAnimationFrame(drawFrame);
                } else {
                    recorder.stop();
                    if (splashVideo) splashVideo.pause();
                }
            };

            requestAnimationFrame(drawFrame);
            const output = await done;
            await setGeneratedVideoFromRecording(
                output,
                'spotlight-splash-recording.mp4',
                CANVAS_W,
                CANVAS_H,
                Math.ceil(SPOTLIGHT_DURATION / 1000),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : '聚光开屏视频合成失败');
        } finally {
            setIsGenerating(false);
        }
    };

    const buildBreakFrameFocalVideo = async () => {
        setError('');
        resetOutput();
        const isJumpingFrame = expandedTemplate === 'jumping-focal-window';
        const activeFocal = isJumpingFrame ? jumpingFocal : breakFocal;
        const activeFrameAsset = isJumpingFrame ? jumpingFrameAsset : breakFrameAsset;
        const activeIconColor = isJumpingFrame ? jumpingIconColor : breakIconColor;
        const activeGradientColor = isJumpingFrame ? jumpingGradientColor : breakGradientColor;
        const frameHeight = isJumpingFrame ? JUMPING_FRAME_H : BREAK_FRAME_H;

        if (!activeFocal.url || !activeFocal.file || activeFocal.status === 'invalid') {
            setError('请上传 1126 x 900px 的焦点视窗素材');
            return;
        }
            const promptGeneratedUrl = activeFrameAsset.url ? null : await generateBreakFrameByPrompt('text', 0);

            setIsGenerating(true);
            try {
                const frameUrl = activeFrameAsset.url || promptGeneratedUrl;
                if (!frameUrl) throw new Error('请上传破框素材，或使用提示词生成透明底素材');

            const canvas = document.createElement('canvas');
            canvas.width = BREAK_CANVAS_W;
            canvas.height = BREAK_CANVAS_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建视频画布');

            const focalIsVideo = activeFocal.file.type.startsWith('video/');
            const focalImage = focalIsVideo ? null : await loadImage(activeFocal.url);
            const focalVideo = focalIsVideo ? await loadVideoElement(activeFocal.url) : null;
            const frameIsVideo = Boolean(promptGeneratedUrl) || activeFrameAsset.file?.type.startsWith('video/');
            const frameImage = frameIsVideo ? null : await loadImage(frameUrl);
            const frameVideo = frameIsVideo ? await loadVideoElement(frameUrl) : null;
            if (frameVideo) {
                frameVideo.pause();
                frameVideo.currentTime = 0;
            }
            const [focalBg1, focalBg2, focalIconMask] = await Promise.all([
                loadImage('/focal-window/fixed_bg_1.png'),
                loadImage('/focal-window/fixed_bg_2.png'),
                loadImage('/focal-window/icon_bg.png'),
            ]);

            const mimeType = [
                'video/mp4;codecs=h264',
                'video/webm;codecs=vp9',
                'video/webm',
            ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : { videoBitsPerSecond: 6_000_000 });
            const chunks: Blob[] = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
            };
            const done = new Promise<Blob>((resolve) => {
                recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
            });

            const focalX = 0;
            const frameX = 0;
            const frameY = BREAK_FRAME_Y;
            const start = performance.now();
            const firstFrameStartSecond = Math.max(3, Math.round(breakFirstStartSecond));
            const secondFrameStartSecond = Math.max(7, firstFrameStartSecond + 4, Number(breakSecondStartSecond) || 7);
            const firstFrameStartMs = isJumpingFrame ? 0 : firstFrameStartSecond * 1000;
            const secondFrameStartMs = secondFrameStartSecond * 1000;
            const duration = isJumpingFrame ? BREAK_DURATION : Math.max(BREAK_DURATION, secondFrameStartMs + 2000);
            const frameVideoStarted = [false, false];
            recorder.start();

            const drawFrame = (now: number) => {
                const elapsed = Math.min(now - start, duration);
                const phaseWindow = isJumpingFrame
                    ? (elapsed <= 1500 ? { phase: 0, startMs: 0 } : null)
                    : elapsed >= secondFrameStartMs && elapsed <= secondFrameStartMs + 1500
                    ? { phase: 1, startMs: secondFrameStartMs }
                    : elapsed >= firstFrameStartMs && elapsed <= firstFrameStartMs + 1500
                        ? { phase: 0, startMs: firstFrameStartMs }
                        : null;
                const frameElapsed = phaseWindow ? elapsed - phaseWindow.startMs : -1;
                const entrance = phaseWindow ? easeOutCubic(frameElapsed / 300) : 0;

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);

                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.28)';
                ctx.shadowBlur = 28;
                if (focalVideo && focalVideo.readyState >= 2) {
                    drawCoverAt(ctx, focalVideo, focalVideo.videoWidth || BREAK_FOCAL_W, focalVideo.videoHeight || BREAK_FOCAL_H, focalX, BREAK_FOCAL_Y, BREAK_FOCAL_W, BREAK_FOCAL_H);
                } else if (focalImage) {
                    drawCoverAt(ctx, focalImage, focalImage.naturalWidth, focalImage.naturalHeight, focalX, BREAK_FOCAL_Y, BREAK_FOCAL_W, BREAK_FOCAL_H);
                }
                ctx.restore();

                ctx.drawImage(focalBg2, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                ctx.save();
                const grad = ctx.createLinearGradient(0, 750, 0, 1250);
                const gradientRgb = hexToRgb(activeGradientColor);
                const gradientColor = `rgba(${gradientRgb.r},${gradientRgb.g},${gradientRgb.b}`;
                grad.addColorStop(0, `${gradientColor},0)`);
                grad.addColorStop(0.1, `${gradientColor},1)`);
                grad.addColorStop(0.3, `${gradientColor},1)`);
                grad.addColorStop(1, `${gradientColor},0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, 750, BREAK_CANVAS_W, 500);
                ctx.restore();
                const iconCanvas = document.createElement('canvas');
                iconCanvas.width = BREAK_CANVAS_W;
                iconCanvas.height = BREAK_CANVAS_H;
                const iconCtx = iconCanvas.getContext('2d');
                if (iconCtx) {
                    iconCtx.fillStyle = activeIconColor;
                    iconCtx.fillRect(0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                    iconCtx.globalCompositeOperation = 'destination-in';
                    iconCtx.drawImage(focalIconMask, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                    ctx.drawImage(iconCanvas, 0, 0);
                }
                ctx.drawImage(focalBg1, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);

                if (phaseWindow) {
                    if (frameVideo && !frameVideoStarted[phaseWindow.phase]) {
                        frameVideo.currentTime = phaseWindow.phase * 1.5;
                        frameVideo.play().catch(() => undefined);
                        frameVideoStarted[phaseWindow.phase] = true;
                    }
                    ctx.save();
                    ctx.globalAlpha = entrance;
                    ctx.translate(0, isJumpingFrame ? 0 : (1 - entrance) * 120);
                    if (frameVideo && frameVideo.readyState >= 2) {
                        if (activeFrameAsset.whiteRemovalMode && activeFrameAsset.whiteRemovalMode !== 'none') {
                            drawContainWithWhiteRemoval(ctx, frameVideo, frameVideo.videoWidth || BREAK_FRAME_W, frameVideo.videoHeight || frameHeight, BREAK_FRAME_W, frameHeight, frameX, frameY);
                        } else {
                            drawContain(ctx, frameVideo, frameVideo.videoWidth || BREAK_FRAME_W, frameVideo.videoHeight || frameHeight, BREAK_FRAME_W, frameHeight, frameX, frameY);
                        }
                    } else if (frameImage) {
                        if (activeFrameAsset.whiteRemovalMode && activeFrameAsset.whiteRemovalMode !== 'none') {
                            drawContainWithWhiteRemoval(ctx, frameImage, frameImage.naturalWidth, frameImage.naturalHeight, BREAK_FRAME_W, frameHeight, frameX, frameY);
                        } else {
                            drawContain(ctx, frameImage, frameImage.naturalWidth, frameImage.naturalHeight, BREAK_FRAME_W, frameHeight, frameX, frameY);
                        }
                    }
                    ctx.restore();
                }

                if (elapsed < duration) {
                    requestAnimationFrame(drawFrame);
                } else {
                    recorder.stop();
                    focalVideo?.pause();
                    frameVideo?.pause();
                }
            };

            requestAnimationFrame(drawFrame);
            const output = await done;
            await setGeneratedVideoFromRecording(
                output,
                `${isJumpingFrame ? 'jumping-focal-window' : 'break-frame-focal-3d'}-recording.mp4`,
                BREAK_CANVAS_W,
                BREAK_CANVAS_H,
                Math.ceil(duration / 1000),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : '破框焦点视窗3D 合成失败');
        } finally {
            setIsGenerating(false);
        }
    };

    const buildPolymorphicFlipCardVideo = async () => {
        setError('');
        resetOutput();

        if (!polyBase.url || !polyBase.file || polyBase.status !== 'valid') {
            setError('请上传 1 张 1126 x 900px 的底图');
            return;
        }
        if (polyCards.length !== 4) {
            setError('请上传 4 张 840 x 360px 的翻卡图片');
            return;
        }
        if (!polyFocal.url || !polyFocal.file || polyFocal.status !== 'valid') {
            setError('请上传 1 个 1126 x 900px 的焦点视窗素材');
            return;
        }

        setIsGenerating(true);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = BREAK_CANVAS_W;
            canvas.height = BREAK_CANVAS_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建多态翻卡视频');

            const baseImage = await loadImage(polyBase.url);
            const cardImages = await Promise.all(polyCards.map((item) => loadImage(item.url)));
            const focalIsVideo = polyFocal.file.type.startsWith('video/');
            const focalImage = !focalIsVideo ? await loadImage(polyFocal.url) : null;
            const focalVideo = focalIsVideo ? await loadVideoElement(polyFocal.url) : null;
            const [focalBg1, focalBg2, focalIconMask] = await Promise.all([
                loadImage('/focal-window/fixed_bg_1.png'),
                loadImage('/focal-window/fixed_bg_2.png'),
                loadImage('/focal-window/icon_bg.png'),
            ]);

            const mimeType = [
                'video/webm;codecs=vp9',
                'video/webm',
            ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : { videoBitsPerSecond: 6_000_000 });
            const chunks: Blob[] = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
            };
            const done = new Promise<Blob>((resolve) => {
                recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
            });

            const carouselDuration = Math.max(1, polyCards.length - 1) * POLY_CARD_FRAME_MS;
            const duration = carouselDuration + POLY_CARD_FLIP_MS + POLY_CARD_FINAL_HOLD_MS;
            const start = performance.now();
            recorder.start();

            const drawFrame = (now: number) => {
                const elapsed = Math.min(now - start, duration);
                const carouselElapsed = Math.min(elapsed, carouselDuration);
                const activeIndex = Math.min(cardImages.length - 1, Math.floor(carouselElapsed / POLY_CARD_FRAME_MS));
                const progress = carouselElapsed >= carouselDuration ? 0 : (carouselElapsed % POLY_CARD_FRAME_MS) / POLY_CARD_FRAME_MS;
                const slide = carouselElapsed >= carouselDuration ? 0 : easeInOutCubic(progress);
                const flipElapsed = Math.max(0, elapsed - carouselDuration);
                const flipProgress = Math.min(1, flipElapsed / POLY_CARD_FLIP_MS);

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                drawCoverAt(ctx, baseImage, baseImage.naturalWidth, baseImage.naturalHeight, 0, BREAK_FOCAL_Y, BREAK_FOCAL_W, BREAK_FOCAL_H);

                ctx.save();
                ctx.beginPath();
                ctx.rect(0, BREAK_FOCAL_Y, BREAK_FOCAL_W, BREAK_FOCAL_H);
                ctx.clip();
                if (elapsed < carouselDuration) {
                    [-2, -1, 0, 1, 2]
                        .map((offset) => {
                            const frame = getPolyCarouselFrame(offset - slide);
                            const imageIndex = (activeIndex + offset + cardImages.length) % cardImages.length;
                            return { frame, image: cardImages[imageIndex], zIndex: frame.zIndex };
                        })
                        .sort((a, b) => a.zIndex - b.zIndex)
                        .forEach(({ frame, image }) => {
                            if (frame.opacity <= 0) return;
                            ctx.save();
                            ctx.globalAlpha = frame.opacity;
                            ctx.shadowColor = 'rgba(0,0,0,0.35)';
                            ctx.shadowBlur = 26;
                            ctx.beginPath();
                            ctx.roundRect(frame.x, frame.y, frame.width, frame.height, 42);
                            ctx.fillStyle = '#000';
                            ctx.fill();
                            ctx.clip();
                            drawCoverAt(ctx, image, image.naturalWidth, image.naturalHeight, frame.x, frame.y, frame.width, frame.height);
                            ctx.restore();
                        });
                } else {
                    const frame = getPolyFinalFrame(flipProgress);
                    const squash = Math.max(0.04, Math.abs(Math.cos(flipProgress * Math.PI)));
                    const centerX = frame.x + frame.width / 2;
                    const source = flipProgress < 0.5 ? cardImages[3] : (focalVideo || focalImage);
                    const sourceW = source instanceof HTMLVideoElement ? (source.videoWidth || BREAK_FOCAL_W) : (source?.naturalWidth || POLY_CARD_W);
                    const sourceH = source instanceof HTMLVideoElement ? (source.videoHeight || BREAK_FOCAL_H) : (source?.naturalHeight || POLY_CARD_H);
                    if (source) {
                        ctx.save();
                        ctx.shadowColor = 'rgba(0,0,0,0.35)';
                        ctx.shadowBlur = 26;
                        ctx.beginPath();
                        ctx.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
                        ctx.fillStyle = '#000';
                        ctx.fill();
                        ctx.clip();
                        ctx.translate(centerX, 0);
                        ctx.scale(squash, 1);
                        drawCoverAt(ctx, source, sourceW, sourceH, -frame.width / 2, frame.y, frame.width, frame.height);
                        ctx.restore();
                    }
                }
                ctx.restore();

                ctx.drawImage(focalBg2, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                ctx.save();
                const grad = ctx.createLinearGradient(0, 750, 0, 1250);
                const gradientRgb = hexToRgb(breakGradientColor);
                const gradientColor = `rgba(${gradientRgb.r},${gradientRgb.g},${gradientRgb.b}`;
                grad.addColorStop(0, `${gradientColor},0)`);
                grad.addColorStop(0.1, `${gradientColor},1)`);
                grad.addColorStop(0.3, `${gradientColor},1)`);
                grad.addColorStop(1, `${gradientColor},0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, 750, BREAK_CANVAS_W, 500);
                ctx.restore();
                const iconCanvas = document.createElement('canvas');
                iconCanvas.width = BREAK_CANVAS_W;
                iconCanvas.height = BREAK_CANVAS_H;
                const iconCtx = iconCanvas.getContext('2d');
                if (iconCtx) {
                    iconCtx.fillStyle = breakIconColor;
                    iconCtx.fillRect(0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                    iconCtx.globalCompositeOperation = 'destination-in';
                    iconCtx.drawImage(focalIconMask, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                    ctx.drawImage(iconCanvas, 0, 0);
                }
                ctx.drawImage(focalBg1, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);

                if (elapsed < duration) {
                    requestAnimationFrame(drawFrame);
                } else {
                    recorder.stop();
                    focalVideo?.pause();
                }
            };

            requestAnimationFrame(drawFrame);
            const output = await done;
            await setGeneratedVideoFromRecording(
                output,
                'polymorphic-flip-card-recording.mp4',
                BREAK_CANVAS_W,
                BREAK_CANVAS_H,
                Math.ceil(duration / 1000),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : '多态翻卡视频合成失败');
        } finally {
            setIsGenerating(false);
        }
    };

    const buildRefreshBottomNavVideo = async () => {
        setError('');
        resetOutput();

        if (!breakFocal.url || !breakFocal.file || breakFocal.status === 'invalid') {
            setError('请上传 1126 x 900px 的焦点视窗素材');
            return;
        }
        if (!refreshIconSheet.url || !refreshIconSheet.file || refreshIconSheet.status !== 'valid') {
            setError('请上传或生成 1 个 1228 x 674px 的 icon 底图');
            return;
        }
        if (SHOW_REFRESH_BOTTOM_NAV_UPLOAD && (!refreshBottomNav.url || !refreshBottomNav.file || refreshBottomNav.status !== 'valid')) {
            setError('请上传 1 张 1126 x 252px 的底导素材');
            return;
        }

        setIsGenerating(true);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = BREAK_CANVAS_W;
            canvas.height = BREAK_CANVAS_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建焕新UI视频');

            const iconSheetIsVideo = refreshIconSheet.file.type.startsWith('video/');
            const iconSheetImage = iconSheetIsVideo ? null : await loadImage(refreshIconSheet.url);
            const iconSheetVideo = iconSheetIsVideo ? await loadVideoElement(refreshIconSheet.url, false) : null;
            const bottomNavIsVideo = SHOW_REFRESH_BOTTOM_NAV_UPLOAD && refreshBottomNav.file ? refreshBottomNav.file.type.startsWith('video/') : false;
            const bottomNavImage = SHOW_REFRESH_BOTTOM_NAV_UPLOAD && refreshBottomNav.url && !bottomNavIsVideo ? await loadImage(refreshBottomNav.url) : null;
            const bottomNavVideo = SHOW_REFRESH_BOTTOM_NAV_UPLOAD && refreshBottomNav.url && bottomNavIsVideo ? await loadVideoElement(refreshBottomNav.url, false) : null;
            const focalIsVideo = breakFocal.file.type.startsWith('video/');
            const focalImage = focalIsVideo ? null : await loadImage(breakFocal.url);
            const focalVideo = focalIsVideo ? await loadVideoElement(breakFocal.url, false) : null;
            const [focalBg1, focalBg2, focalGradientLayer] = await Promise.all([
                loadImage('/focal-window/fixed_bg_1.png'),
                loadImage('/focal-window/fixed_bg_2.png'),
                loadImage('/focal-window/gradient_layer.png'),
            ]);

            const mimeType = [
                'video/mp4;codecs=h264',
                'video/webm;codecs=vp9',
                'video/webm',
            ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : { videoBitsPerSecond: 6_000_000 });
            const chunks: Blob[] = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
            };
            const done = new Promise<Blob>((resolve) => {
                recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
            });

            const start = performance.now();
            recorder.start();

            const drawFrame = (now: number) => {
                const elapsed = Math.min(now - start, BREAK_DURATION);
                const entrance = 1;

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                if (focalVideo && focalVideo.readyState >= 2) {
                    drawCoverAt(ctx, focalVideo, focalVideo.videoWidth || BREAK_FOCAL_W, focalVideo.videoHeight || BREAK_FOCAL_H, 0, BREAK_FOCAL_Y, BREAK_FOCAL_W, BREAK_FOCAL_H);
                } else if (focalImage) {
                    drawCoverAt(ctx, focalImage, focalImage.naturalWidth, focalImage.naturalHeight, 0, BREAK_FOCAL_Y, BREAK_FOCAL_W, BREAK_FOCAL_H);
                }
                ctx.drawImage(focalBg2, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                ctx.drawImage(focalGradientLayer, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);

                ctx.save();
                ctx.globalAlpha = entrance;
                ctx.translate(0, (1 - entrance) * 28);
                const iconSheetSource = iconSheetVideo && iconSheetVideo.readyState >= 2 ? iconSheetVideo : iconSheetImage;
                if (iconSheetSource) drawRefreshIconLayer(ctx, iconSheetSource);
                ctx.restore();

                ctx.save();
                ctx.globalAlpha = entrance;
                ctx.translate(0, (1 - entrance) * 28);
                ctx.drawImage(focalBg1, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                const bottomNavSource = bottomNavVideo && bottomNavVideo.readyState >= 2 ? bottomNavVideo : bottomNavImage;
                if (bottomNavSource) {
                    const bottomSourceW = bottomNavVideo && bottomNavVideo.readyState >= 2 ? (bottomNavVideo.videoWidth || REFRESH_BOTTOM_NAV_W) : (bottomNavImage?.naturalWidth || REFRESH_BOTTOM_NAV_W);
                    const bottomSourceH = bottomNavVideo && bottomNavVideo.readyState >= 2 ? (bottomNavVideo.videoHeight || REFRESH_BOTTOM_NAV_H) : (bottomNavImage?.naturalHeight || REFRESH_BOTTOM_NAV_H);
                    drawCoverAt(ctx, bottomNavSource, bottomSourceW, bottomSourceH, 0, BREAK_CANVAS_H - REFRESH_BOTTOM_NAV_H, REFRESH_BOTTOM_NAV_W, REFRESH_BOTTOM_NAV_H);
                }
                ctx.restore();

                if (elapsed < BREAK_DURATION) {
                    requestAnimationFrame(drawFrame);
                } else {
                    recorder.stop();
                    iconSheetVideo?.pause();
                    bottomNavVideo?.pause();
                    focalVideo?.pause();
                }
            };

            requestAnimationFrame(drawFrame);
            const output = await done;
            await setGeneratedVideoFromRecording(
                output,
                'refresh-ui-bottom-nav-recording.mp4',
                BREAK_CANVAS_W,
                BREAK_CANVAS_H,
                Math.ceil(BREAK_DURATION / 1000),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : '焕新UI视频合成失败');
        } finally {
            setIsGenerating(false);
        }
    };

    const buildLinkedSuperVideo = async () => {
        setError('');
        resetOutput();

        if (!linkedOpeningVideo.url || !linkedOpeningVideo.file || linkedOpeningVideo.status !== 'valid') {
            setError('请上传 1440 x 2340px / 8s 的开屏视频');
            return;
        }
        if (!linkedFocalVideo.url || !linkedFocalVideo.file || linkedFocalVideo.status !== 'valid') {
            setError('请上传 1126 x 900px 的焦点视窗视频');
            return;
        }

        setIsGenerating(true);
        try {
            const [openingMeta, focalMeta] = await Promise.all([
                getVideoMeta(linkedOpeningVideo.file),
                getVideoMeta(linkedFocalVideo.file),
            ]);

            if (openingMeta.width !== CANVAS_W || openingMeta.height !== CANVAS_H || Math.abs(openingMeta.duration - (LINKED_OPENING_DURATION / 1000)) > LINKED_OPENING_DURATION_TOLERANCE) {
                throw new Error('开屏视频需为 1440 x 2340px 且时长 8s');
            }
            if (focalMeta.width !== BREAK_FOCAL_W || focalMeta.height !== BREAK_FOCAL_H) {
                throw new Error('焦点视窗视频需为 1126 x 900px');
            }

            const canvas = document.createElement('canvas');
            canvas.width = BREAK_CANVAS_W;
            canvas.height = BREAK_CANVAS_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建联动合成画布');

            const [
                openingVideo,
                focalVideo,
                immersiveFocalBg1,
                immersiveFocalBg2,
                immersiveFocalIconMask,
                focalBg1,
                focalBg2,
                focalIconMask,
            ] = await Promise.all([
                loadVideoElement(linkedOpeningVideo.url, false),
                loadVideoElement(linkedFocalVideo.url, false),
                loadImage('/focal-window-immersive/fixed_bg_1.png'),
                loadImage('/focal-window-immersive/fixed_bg_2.png'),
                loadImage('/focal-window-immersive/icon_bg.png'),
                loadImage('/focal-window/fixed_bg_1.png'),
                loadImage('/focal-window/fixed_bg_2.png'),
                loadImage('/focal-window/icon_bg.png'),
            ]);

            const createTintedIconLayer = (mask: HTMLImageElement) => {
                const iconCanvas = document.createElement('canvas');
                iconCanvas.width = BREAK_CANVAS_W;
                iconCanvas.height = BREAK_CANVAS_H;
                const iconCtx = iconCanvas.getContext('2d');
                if (!iconCtx) return null;
                iconCtx.fillStyle = breakIconColor;
                iconCtx.fillRect(0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                iconCtx.globalCompositeOperation = 'destination-in';
                iconCtx.drawImage(mask, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                return iconCanvas;
            };

            const immersiveIconCanvas = createTintedIconLayer(immersiveFocalIconMask);
            const focalIconCanvas = createTintedIconLayer(focalIconMask);

            const mimeType = [
                'video/mp4;codecs=h264',
                'video/webm;codecs=vp9',
                'video/webm',
            ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 });
            const chunks: Blob[] = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
            };
            const done = new Promise<Blob>((resolve) => {
                recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
            });

            const drawLinkedUiVariant = (
                alpha: number,
                yOffset: number,
                assets: { bg1: HTMLImageElement; bg2: HTMLImageElement; iconCanvas: HTMLCanvasElement | null },
                layer: 'base' | 'foreground',
            ) => {
                if (alpha <= 0) return;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(0, yOffset);

                if (layer === 'base') {
                    ctx.drawImage(assets.bg2, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                    const gradientRgb = hexToRgb(breakGradientColor);
                    const gradient = ctx.createLinearGradient(0, 750, 0, 1250);
                    gradient.addColorStop(0, `rgba(${gradientRgb.r}, ${gradientRgb.g}, ${gradientRgb.b}, 0)`);
                    gradient.addColorStop(0.1, `rgba(${gradientRgb.r}, ${gradientRgb.g}, ${gradientRgb.b}, 0.95)`);
                    gradient.addColorStop(0.3, `rgba(${gradientRgb.r}, ${gradientRgb.g}, ${gradientRgb.b}, 0.95)`);
                    gradient.addColorStop(1, `rgba(${gradientRgb.r}, ${gradientRgb.g}, ${gradientRgb.b}, 0)`);
                    ctx.fillStyle = gradient;
                    ctx.fillRect(0, 750, BREAK_CANVAS_W, 500);
                    if (assets.iconCanvas) ctx.drawImage(assets.iconCanvas, 0, 0);
                } else {
                    ctx.drawImage(assets.bg1, 0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                }

                ctx.restore();
            };

            const drawLinkedHomeUi = (progress: number, settleProgress: number, layer: 'base' | 'foreground') => {
                if (progress <= 0) return;
                const entrance = easeInOutCubic(progress);
                const settle = Math.max(0, Math.min(1, settleProgress));
                const entranceOffset = (1 - entrance) * 72;

                drawLinkedUiVariant(
                    entrance * (1 - settle),
                    entranceOffset - settle * 72,
                    { bg1: immersiveFocalBg1, bg2: immersiveFocalBg2, iconCanvas: immersiveIconCanvas },
                    layer,
                );
                drawLinkedUiVariant(
                    entrance * settle,
                    entranceOffset + (1 - settle) * 72,
                    { bg1: focalBg1, bg2: focalBg2, iconCanvas: focalIconCanvas },
                    layer,
                );
            };

            openingVideo.currentTime = 0;
            focalVideo.currentTime = 0;
            openingVideo.loop = false;
            focalVideo.loop = false;
            await openingVideo.play().catch(() => undefined);

            const focalStartAt = LINKED_OPENING_DURATION + LINKED_TRANSITION_DURATION;
            const totalDuration = focalStartAt + Math.max(0.1, focalMeta.duration) * 1000;
            let focalStarted = false;
            const start = performance.now();
            recorder.start();

            const drawFrame = (now: number) => {
                const elapsed = Math.min(now - start, totalDuration);
                const firstShrinkProgress = easeInOutCubic((elapsed - LINKED_FULL_OPENING_DURATION) / LINKED_TRANSITION_DURATION);
                const finalShrinkProgress = easeInOutCubic((elapsed - LINKED_OPENING_DURATION) / LINKED_TRANSITION_DURATION);
                const uiProgress = elapsed < LINKED_FULL_OPENING_DURATION ? 0 : firstShrinkProgress;

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, BREAK_CANVAS_W, BREAK_CANVAS_H);
                drawLinkedHomeUi(uiProgress, finalShrinkProgress, 'base');

                if (elapsed < focalStartAt) {
                    const panoramaHeight = BREAK_CANVAS_H - (BREAK_CANVAS_H - LINKED_PANORAMA_OPENING_H) * firstShrinkProgress;
                    const openingHeight = elapsed < LINKED_OPENING_DURATION
                        ? panoramaHeight
                        : LINKED_PANORAMA_OPENING_H - (LINKED_PANORAMA_OPENING_H - BREAK_FOCAL_H) * finalShrinkProgress;
                    if (openingVideo.readyState >= 2) {
                        drawCoverAt(ctx, openingVideo, openingVideo.videoWidth || CANVAS_W, openingVideo.videoHeight || CANVAS_H, 0, 0, BREAK_CANVAS_W, openingHeight);
                    } else {
                        ctx.fillStyle = '#111827';
                        ctx.fillRect(0, 0, BREAK_CANVAS_W, openingHeight);
                    }
                    drawLinkedHomeUi(uiProgress, finalShrinkProgress, 'foreground');
                } else {
                    if (!focalStarted) {
                        openingVideo.pause();
                        focalVideo.currentTime = 0;
                        void focalVideo.play().catch(() => undefined);
                        focalStarted = true;
                    }
                    if (focalVideo.readyState >= 2) {
                        drawCoverAt(ctx, focalVideo, focalVideo.videoWidth || BREAK_FOCAL_W, focalVideo.videoHeight || BREAK_FOCAL_H, 0, BREAK_FOCAL_Y, BREAK_FOCAL_W, BREAK_FOCAL_H);
                    }
                    drawLinkedHomeUi(1, 1, 'foreground');
                }

                if (elapsed < totalDuration) {
                    requestAnimationFrame(drawFrame);
                } else {
                    recorder.stop();
                    openingVideo.pause();
                    focalVideo.pause();
                }
            };

            requestAnimationFrame(drawFrame);
            const output = await done;
            await setGeneratedVideoFromRecording(
                output,
                'linked-super-video-panorama-recording.mp4',
                BREAK_CANVAS_W,
                BREAK_CANVAS_H,
                Math.ceil(totalDuration / 1000),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : '联动超视频合成失败');
        } finally {
            setIsGenerating(false);
        }
    };

    const buildVideo = async () => {
        setError('');
        setHoveredTemplateId(null);
        setLockedPreviewTemplateId(null);
        resetOutput();

        if (expandedTemplate === 'magazine-flip') {
            await buildMagazineVideo();
            return;
        }
        if (expandedTemplate === 'slide-splash') {
            await buildSpotlightVideo();
            return;
        }
        if (expandedTemplate === 'polymorphic-flip-card') {
            await buildPolymorphicFlipCardVideo();
            return;
        }
        if (expandedTemplate === 'refresh-ui-bottom-nav') {
            await buildRefreshBottomNavVideo();
            return;
        }
        if (isLinkedSuperVideoTemplateId(expandedTemplate)) {
            await buildLinkedSuperVideo();
            return;
        }
        if (isBreakFrameLikeTemplateId(expandedTemplate)) {
            await buildBreakFrameFocalVideo();
            return;
        }

        if (expandedTemplate !== 'dynamic-splash') {
            setError('当前仅开放「炫动开屏」「杂志翻页」「聚光开屏」「秀秀/美颜-破框焦点视窗3D」「跃动焦点视窗」「焕新UI」「联动超视频-全景视频」模版编辑');
            return;
        }
        if (!splash.url || !splash.file || splash.status === 'invalid') {
            setError('请先上传开屏素材');
            return;
        }

        let assetUrl = asset.url;
        if (!assetUrl) {
            assetUrl = await generatePromptAsset();
        }
        if (asset.status === 'invalid') {
            setError('挂件素材需为 PNG 450 x 450，或使用提示词生成素材');
            return;
        }

        setIsGenerating(true);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1440;
            canvas.height = 2340;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建视频画布');

            const overlayImg = await loadImage(assetUrl);
            const splashIsVideo = splash.file.type.startsWith('video/');
            const splashImage = splashIsVideo ? null : await loadImage(splash.url);
            const splashVideo = splashIsVideo ? document.createElement('video') : null;
            const pendantSeeds = getPendantSeeds().slice(0, pendantMotionNotes.maxItems);

            if (splashVideo) {
                splashVideo.src = splash.url;
                splashVideo.muted = true;
                splashVideo.playsInline = true;
                splashVideo.loop = false;
                splashVideo.currentTime = 0;
                await splashVideo.play().catch(() => undefined);
            }

            const mimeType = [
                'video/mp4;codecs=h264',
                'video/webm;codecs=vp9',
                'video/webm',
            ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : { videoBitsPerSecond: 6_000_000 });
            const chunks: Blob[] = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
            };

            const done = new Promise<Blob>((resolve) => {
                recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
            });

            const duration = 5000;
            const start = performance.now();
            recorder.start();

            const drawFrame = (now: number) => {
                const progress = Math.min((now - start) / duration, 1);
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (splashVideo && splashVideo.readyState >= 2) {
                    drawCover(ctx, splashVideo, splashVideo.videoWidth || 1440, splashVideo.videoHeight || 2340, 1440, 2340);
                } else if (splashImage) {
                    drawCover(ctx, splashImage, splashImage.naturalWidth, splashImage.naturalHeight, 1440, 2340);
                } else {
                    ctx.fillStyle = '#111827';
                    ctx.fillRect(0, 0, 1440, 2340);
                }

                ctx.shadowColor = 'rgba(0,0,0,0.36)';
                ctx.shadowBlur = 36;
                pendantSeeds.forEach((seed) => {
                    const frame = getPendantFrame(seed, progress);
                    if (frame.opacity <= 0) return;
                    const size = PENDANT_SIZE * frame.scale * PENDANT_DISPLAY_SIZE_RATIO;
                    ctx.save();
                    ctx.globalAlpha = frame.opacity;
                    ctx.translate(frame.x + size / 2, frame.y + size / 2);
                    ctx.rotate(frame.rotation);
                    ctx.drawImage(overlayImg, -size / 2, -size / 2, size, size);
                    ctx.restore();
                });
                ctx.shadowBlur = 0;
                ctx.globalAlpha = 1;

                if (progress < 1) {
                    requestAnimationFrame(drawFrame);
                } else {
                    recorder.stop();
                    if (splashVideo) splashVideo.pause();
                }
            };

            requestAnimationFrame(drawFrame);
            const output = await done;
            await setGeneratedVideoFromRecording(
                output,
                'dynamic-splash-recording.mp4',
                CANVAS_W,
                CANVAS_H,
                Math.ceil(duration / 1000),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : '合成视频失败');
        } finally {
            setIsGenerating(false);
        }
    };

    const statusClass = (status: UploadStatus) => {
        if (status === 'valid') return 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20';
        if (status === 'adapted') return 'text-sky-300 bg-sky-400/10 border-sky-400/20';
        if (status === 'invalid') return 'text-rose-300 bg-rose-400/10 border-rose-400/20';
        return 'text-zinc-500 bg-white/5 border-white/5';
    };

    const selectedTemplateName = categories
        .flatMap((cat) => cat.templates)
        .find((tpl) => tpl.id === expandedTemplate)?.label || '炫动开屏';
    const activeCreativeTemplate = creativeTemplates.find((tpl) => tpl.id === expandedTemplate) || null;
    const isDynamicSplashTemplate = expandedTemplate === 'dynamic-splash';
    const isMagazineTemplate = expandedTemplate === 'magazine-flip';
    const isSpotlightTemplate = expandedTemplate === 'slide-splash';
    const isBreakFocalTemplate = isBreakFrameLikeTemplateId(expandedTemplate);
    const isXiuxiuBreakFocalTemplate = expandedTemplate === 'break-frame-focal-3d' || expandedTemplate === 'polymorphic-flip-card';
    const isJumpingFocalTemplate = expandedTemplate === 'jumping-focal-window';
    const isRefreshUiBottomNavTemplate = expandedTemplate === 'refresh-ui-bottom-nav';
    const isPolymorphicFlipCardTemplate = expandedTemplate === 'polymorphic-flip-card';
    const isLinkedSuperVideoTemplate = isLinkedSuperVideoTemplateId(expandedTemplate);
    const spotlightInteractionAssetPath = activeCreativeTemplate?.interaction_asset_path || SPOTLIGHT_GALLERY_INTERACTION_PATH;
    const shouldFreezeRefreshPreviewVideo = isRefreshUiBottomNavTemplate;
    const previewFrameAspectRatio = hoveredPreviewVideoUrl
        ? CREATIVE_EFFECT_PREVIEW_ASPECT_RATIO
        : getCreativePreviewAspectRatio(expandedTemplate);
    const previewFrameRatioValue = (() => {
        const [width, height] = previewFrameAspectRatio.split('/').map((part) => Number(part.trim()));
        return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
            ? width / height
            : 9 / 16;
    })();
    const previewFrameHeightVh = 68;
    const previewFrameHeightPx = 760;
    const previewFrameHeightBudget = `min(${previewFrameHeightVh}vh, calc(100vh - 320px), ${previewFrameHeightPx}px)`;
    const previewFrameStyle: React.CSSProperties = {
        aspectRatio: previewFrameAspectRatio,
        maxHeight: previewFrameHeightBudget,
        maxWidth: '100%',
        width: `min(100%, ${(previewFrameHeightVh * previewFrameRatioValue).toFixed(2)}vh, ${Math.round(previewFrameHeightPx * previewFrameRatioValue)}px)`,
    };
    const activeDynamicSplashPlatform = selectedPlatforms[0] ?? defaultCreativeSettings.platforms[0];
    const activeDynamicSplashMask = dynamicSplashPlatformMasks[activeDynamicSplashPlatform];
    const outputSpec = isMagazineTemplate
        ? '输出规格 1440 x 2340 / 鼠标拖动滑动翻页'
            : isSpotlightTemplate
                ? '输出规格 1440 x 2340 / 聚光合成'
                : isPolymorphicFlipCardTemplate
                    ? '输出规格 1126 x 2436 / 多态翻卡'
                    : isJumpingFocalTemplate
                        ? '输出规格 1126 x 2436 / 跃动破框 1126 x 906'
                    : isRefreshUiBottomNavTemplate
                        ? SHOW_REFRESH_BOTTOM_NAV_UPLOAD
                            ? 'icon 底图 1228 x 674 / 等比缩小 1028 x 565 后裁进 6 个 icon / 底导 1126 x 252'
                            : 'icon 底图 1228 x 674 / 等比缩小 1028 x 565 后裁进 6 个 icon'
                    : isLinkedSuperVideoTemplate
                        ? '输出规格 1126 x 2436 / 开屏 8s + 焦点视窗'
                : isBreakFocalTemplate
                    ? '输出规格 1126 x 2436 / 破框 3D'
                : '输出规格 1440 x 2340 / 5s';
    const magazineCurrentIndex = magazineAssets.length
        ? Math.min(magazineActiveIndex, magazineAssets.length - 1)
        : 0;
    const magazineNextIndex = magazineAssets.length ? (magazineCurrentIndex + 1) % magazineAssets.length : 0;
    const magazinePrevIndex = magazineAssets.length ? (magazineCurrentIndex - 1 + magazineAssets.length) % magazineAssets.length : 0;
    const getMagazinePreviewStyle = (index: number): React.CSSProperties => {
        const transition = isMagazineDragging ? 'none' : 'transform 180ms ease-out';
        if (magazineAssets.length <= 1) return { transform: 'translateX(0%)', transition };
        if (index === magazineCurrentIndex) return { transform: `translateX(${magazineDragOffset * 100}%)`, transition };
        if (magazineDragOffset < 0 && index === magazineNextIndex) return { transform: `translateX(${(1 + magazineDragOffset) * 100}%)`, transition };
        if (magazineDragOffset > 0 && index === magazinePrevIndex) return { transform: `translateX(${(-1 + magazineDragOffset) * 100}%)`, transition };
        return { transform: 'translateX(100%)', visibility: 'hidden', transition };
    };
    const polyActiveIndex = polyCards.length
        ? Math.min(polyCards.length - 1, Math.floor(Math.min(polyPreviewElapsed, Math.max(1, polyCards.length - 1) * POLY_CARD_FRAME_MS) / POLY_CARD_FRAME_MS))
        : 0;
    const polyCarouselDuration = polyCards.length ? Math.max(1, polyCards.length - 1) * POLY_CARD_FRAME_MS : 0;
    const isPolyFinalPhase = polyCards.length === 4 && polyPreviewElapsed >= polyCarouselDuration;
    const polyFlipProgress = isPolyFinalPhase
        ? Math.min(1, Math.max(0, (polyPreviewElapsed - polyCarouselDuration) / POLY_CARD_FLIP_MS))
        : 0;
    const polySlideProgress = polyCards.length
        ? (isPolyFinalPhase ? 0 : (polyPreviewElapsed % POLY_CARD_FRAME_MS) / POLY_CARD_FRAME_MS)
        : 0;
    const polyCarouselSlots = polyCards.length && !isPolyFinalPhase
        ? [-2, -1, 0, 1, 2].map((offset) => {
            const imageIndex = (polyActiveIndex + offset + polyCards.length) % polyCards.length;
            return {
                offset,
                item: polyCards[imageIndex],
                frame: getPolyCarouselFrame(offset - easeInOutCubic(polySlideProgress)),
            };
        })
        : [];
    const getPolyCardPreviewStyle = (frame: ReturnType<typeof getPolyCarouselFrame>): React.CSSProperties => ({
            left: `${(frame.x / BREAK_FOCAL_W) * 100}%`,
            top: `${(frame.y / BREAK_FOCAL_H) * 100}%`,
            width: `${(frame.width / BREAK_FOCAL_W) * 100}%`,
            height: `${(frame.height / BREAK_FOCAL_H) * 100}%`,
            opacity: frame.opacity,
            zIndex: frame.zIndex,
            pointerEvents: 'none',
    });
    const polyFinalFrame = getPolyFinalFrame(polyFlipProgress);
    const getPolyFinalPreviewStyle = (): React.CSSProperties => ({
        left: `${(polyFinalFrame.x / BREAK_FOCAL_W) * 100}%`,
        top: `${(polyFinalFrame.y / BREAK_FOCAL_H) * 100}%`,
        width: `${(polyFinalFrame.width / BREAK_FOCAL_W) * 100}%`,
        height: `${(polyFinalFrame.height / BREAK_FOCAL_H) * 100}%`,
        borderRadius: `${polyFinalFrame.radius}px`,
        transform: `perspective(900px) rotateY(${polyFlipProgress * 180}deg)`,
        transformStyle: 'preserve-3d',
        zIndex: 6,
    });
    const getSpotlightSmallPreviewStyle = (index: number): React.CSSProperties => {
        const frame = getSpotlightSmallFrame(index, spotlightPreviewElapsed);
        return {
            left: `${(frame.x / CANVAS_W) * 100}%`,
            top: `${(frame.y / CANVAS_H) * 100}%`,
            width: `${(frame.width / CANVAS_W) * 100}%`,
            height: `${(frame.height / CANVAS_H) * 100}%`,
            opacity: frame.opacity,
        };
    };
    const spotlightLargePreviewStyle = (): React.CSSProperties => {
        const frame = getSpotlightLargeFrame(spotlightPreviewElapsed);
        return {
            left: `${(frame.x / CANVAS_W) * 100}%`,
            top: `${(frame.y / CANVAS_H) * 100}%`,
            width: `${(frame.width / CANVAS_W) * 100}%`,
            height: `${(frame.height / CANVAS_H) * 100}%`,
            opacity: frame.opacity,
        };
    };
    const breakFirstTriggerSecond = Math.max(3, Math.round(breakFirstStartSecond));
    const breakSecondTriggerSecond = Math.max(7, breakFirstTriggerSecond + 4, Number(breakSecondStartSecond) || 7);
    const activeBreakFocal = isJumpingFocalTemplate ? jumpingFocal : breakFocal;
    const activeBreakFrameAsset = isJumpingFocalTemplate ? jumpingFrameAsset : breakFrameAsset;
    const activeBreakReference = isJumpingFocalTemplate ? jumpingReference : breakFirstReference;
    const activeBreakIconColor = isJumpingFocalTemplate ? jumpingIconColor : breakIconColor;
    const activeBreakGradientColor = isJumpingFocalTemplate ? jumpingGradientColor : breakGradientColor;
    const breakPreviewPhase = isJumpingFocalTemplate && breakPreviewElapsed <= 1500
        ? 0
        : breakPreviewElapsed >= breakSecondTriggerSecond * 1000 && breakPreviewElapsed <= breakSecondTriggerSecond * 1000 + 1500
        ? 1
        : breakPreviewElapsed >= breakFirstTriggerSecond * 1000 && breakPreviewElapsed <= breakFirstTriggerSecond * 1000 + 1500
            ? 0
            : null;
    const breakFramePreviewStarted = breakPreviewPhase !== null;

    return (
        <div className="creative-board-shell fixed inset-0 z-0 overflow-hidden text-zinc-300 pt-[73px]">
            <SideRays
                className="creative-board-side-rays"
                speed={1.7}
                rayColor1="#8B5CF6"
                rayColor2="#38BDF8"
                intensity={1.15}
                spread={1.75}
                origin="top-right"
                tilt={-8}
                saturation={1.25}
                blend={0.68}
                falloff={1.85}
                opacity={0.58}
            />
            <div className="creative-board-atmosphere pointer-events-none absolute inset-0 z-[1]" />
            {aiGeneratingKey && (
                <div className="fixed right-8 bottom-8 z-[90] pointer-events-none rounded-[24px] border border-primary/20 bg-zinc-950/90 px-5 py-4 shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-white/[0.03] to-cyan-300/10 animate-pulse" />
                    <div className="relative flex items-center gap-4">
                        <div className="relative h-10 w-10 shrink-0">
                            <div className="absolute inset-0 rounded-full border border-primary/40 animate-ping" />
                            <div className="absolute inset-1 rounded-full border-2 border-zinc-700 border-t-primary animate-spin" />
                            <span className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-[18px] text-white">auto_awesome</span>
                        </div>
                        <div>
                            <p className="text-[12px] font-black text-white">{getAiGeneratingLabel(aiGeneratingKey)}</p>
                            <p className="mt-1 text-[9px] font-bold text-zinc-500">生成完成后会自动更新预览</p>
                        </div>
                    </div>
                </div>
            )}
            <div className="creative-board-stage relative z-10 flex h-full gap-6 p-6">
                <aside className="creative-board-glass creative-board-sidebar w-80 bg-zinc-950/40 backdrop-blur-3xl rounded-[20px] border border-white/5 p-6 flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
                    <div className="px-2 py-3 mb-6 flex items-center gap-3 shrink-0">
                        <div className="w-10 h-10 bg-white/5 rounded-[20px] flex items-center justify-center border border-white/10 shadow-inner">
                            <span className="material-symbols-outlined text-white text-2xl">auto_awesome_motion</span>
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-white tracking-normal text-left">模版管理</h2>
                            <p className="mt-1 text-[10px] text-zinc-600 font-bold tracking-normal text-left leading-none">TEMPLATE MANAGER</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                        {categories.map((cat) => (
                            <div key={cat.id} className="space-y-2">
                                <button
                                    onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                                    className={`creative-category-trigger w-full flex items-center justify-between px-5 py-4 rounded-[20px] transition-all duration-500 ${expandedCategory === cat.id ? 'creative-category-trigger--active bg-white/10 text-white shadow-inner' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-[20px] font-light">{cat.icon}</span>
                                        <span className="text-sm font-black tracking-tight">{cat.label}</span>
                                    </div>
                                    <span className={`material-symbols-outlined text-sm transition-transform duration-500 ${expandedCategory === cat.id ? 'rotate-180 text-white' : ''}`}>expand_more</span>
                                </button>

                                {expandedCategory === cat.id && (
                                    <div className="pl-4 space-y-3 py-2 animate-in fade-in slide-in-from-top-4 duration-500">
                                        {cat.templates.map((tpl) => (
                                            <div key={tpl.id} className="space-y-2">
                                                <CreativeTemplateHoverCard
                                                    active={expandedTemplate === tpl.id}
                                                    onClick={() => handleTemplateSelect(tpl.id)}
                                                    onMouseEnter={() => setHoveredTemplateId(tpl.id)}
                                                    onMouseLeave={() => setHoveredTemplateId((current) => current === tpl.id ? null : current)}
                                                    onPointerEnter={() => setHoveredTemplateId(tpl.id)}
                                                    onPointerMove={() => setHoveredTemplateId(tpl.id)}
                                                    onPointerLeave={() => setHoveredTemplateId((current) => current === tpl.id ? null : current)}
                                                    className={`w-full flex items-center justify-between px-5 py-3 rounded-[20px] text-xs font-bold transition-all duration-300 ${expandedTemplate === tpl.id ? 'text-white bg-black/60 shadow-2xl border border-white/10' : 'text-zinc-500 hover:text-zinc-200'}`}
                                                >
                                                    <span>{tpl.label}</span>
                                                    <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${expandedTemplate === tpl.id ? 'bg-primary shadow-[0_0_10px_#FF2E63]' : 'bg-zinc-800'}`} />
                                                </CreativeTemplateHoverCard>
                                                {isBreakFrameLikeTemplateId(tpl.id) && expandedTemplate === tpl.id && tpl.id !== 'meiyan-break-frame-focal-3d' && tpl.id !== 'refresh-ui-bottom-nav' && (
                                                    <div className="ml-2 rounded-[18px] border border-white/5 bg-black/20 p-3 space-y-3">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div>
                                                                <p className="text-[10px] font-black text-zinc-400">焦点视窗智能配色</p>
                                                                <p className="text-[9px] text-zinc-700 font-bold mt-0.5">渐变层 / UI 层</p>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    onClick={refreshBreakSmartColors}
                                                                    className="h-7 px-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[9px] font-black"
                                                                >
                                                                    智能提取
                                                                </button>
                                                                <button
                                                                    onClick={applyRandomBreakPresetColor}
                                                                    className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/15 text-white flex items-center justify-center"
                                                                    title="随机内置配色"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">casino</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {[
                                                                {
                                                                    label: 'UI',
                                                                    value: expandedTemplate === 'jumping-focal-window' ? jumpingIconColor : breakIconColor,
                                                                    setter: expandedTemplate === 'jumping-focal-window' ? setJumpingIconColor : setBreakIconColor,
                                                                },
                                                                {
                                                                    label: '渐变',
                                                                    value: expandedTemplate === 'jumping-focal-window' ? jumpingGradientColor : breakGradientColor,
                                                                    setter: expandedTemplate === 'jumping-focal-window' ? setJumpingGradientColor : setBreakGradientColor,
                                                                },
                                                            ].map((item) => (
                                                                <label key={item.label} className="h-8 rounded-xl bg-zinc-950/80 border border-white/5 px-2 flex items-center justify-between gap-2">
                                                                    <span className="text-[9px] font-black text-zinc-600">{item.label}</span>
                                                                    <input
                                                                        type="color"
                                                                        value={item.value}
                                                                        onChange={(event) => {
                                                                            item.setter(event.target.value);
                                                                            resetOutput();
                                                                        }}
                                                                        className="h-5 w-5 rounded bg-transparent border-0 p-0"
                                                                    />
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </aside>

                <main className="creative-board-glass creative-board-main relative flex-1 bg-zinc-950/20 backdrop-blur-3xl rounded-[20px] border border-white/5 shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
                    {renderAiLoadingOverlay('*')}
                    <header className="creative-board-main-header px-10 pt-10 pb-8 border-b border-white/5 bg-black/10 backdrop-blur-md flex justify-between items-start shrink-0">
                        <div>
                            <h1 className="creative-board-title text-3xl font-black text-white tracking-normal text-left antialiased">{selectedTemplateName}模版</h1>
                        </div>
                        <div className="flex items-center gap-3">
                            {saveMessage && <span className="text-[10px] font-bold text-zinc-500">{saveMessage}</span>}
                            <div className="creative-board-output-pill px-5 py-3 rounded-[20px] bg-white/5 text-zinc-400 text-[10px] font-bold border border-white/5">
                                {outputSpec}
                            </div>
                        </div>
                    </header>

                    <div className="creative-board-content flex-1 overflow-auto p-5 md:p-8 xl:p-10 custom-scrollbar">
                        <div className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(340px,420px)_minmax(360px,1fr)] gap-5 xl:gap-8 min-h-full">
                            <section className="creative-workflow-column space-y-5">
                                {isMagazineTemplate ? (
                                    <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h2 className="text-white text-sm font-black">翻页素材上传</h2>
                                                <p className="text-[10px] text-zinc-600 font-bold mt-1">上传 3-5 张图片或视频 / 1440 x 2340px</p>
                                            </div>
                                            <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${magazineAssets.length >= MAGAZINE_MIN_ASSETS ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20' : 'text-zinc-500 bg-white/5 border-white/5'}`}>
                                                {magazineAssets.length} / {MAGAZINE_MAX_ASSETS}
                                            </span>
                                        </div>

                                        <input
                                            ref={magazineInputRef}
                                            type="file"
                                            accept="image/*,video/*"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => e.target.files?.length && addMagazineFiles(e.target.files)}
                                        />
                                        <button
                                            onClick={() => magazineInputRef.current?.click()}
                                            onDragOver={(event) => handleUploadDragOver(event, 'magazine')}
                                            onDragLeave={(event) => handleUploadDragLeave(event, 'magazine')}
                                            onDrop={(event) => handleUploadDrop(event, 'magazine')}
                                            className={`w-full min-h-[170px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'magazine' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                        >
                                            <div className="text-center">
                                                <span className="material-symbols-outlined text-3xl text-zinc-600">photo_library</span>
                                                <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'magazine' ? '松开上传翻页素材' : '点击或拖入 3-5 个素材'}</p>
                                                <p className="text-[9px] text-zinc-700 font-bold mt-1">图片 / 视频，视频需 5s 内</p>
                                            </div>
                                        </button>

                                        <div className="grid grid-cols-2 gap-3">
                                            {magazineAssets.map((item, index) => (
                                                <div key={item.id} className="relative rounded-[16px] border border-white/5 bg-black/30 p-2">
                                                    <button
                                                        onClick={() => removeMagazineAsset(item.id)}
                                                        className="absolute right-1.5 top-1.5 z-10 h-6 w-6 rounded-full bg-black/70 text-white/80 flex items-center justify-center"
                                                        title="移除素材"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                    </button>
                                                    <div className="h-28 rounded-[12px] bg-zinc-950 overflow-hidden flex items-center justify-center">
                                                        {item.type === 'video' ? (
                                                            <video src={item.url} className="h-full aspect-[9/16] object-contain bg-black/40" muted loop playsInline />
                                                        ) : (
                                                            <img src={item.url} alt={`翻页素材 ${index + 1}`} className="h-full aspect-[9/16] object-cover" />
                                                        )}
                                                    </div>
                                                    <div className="mt-2 flex items-center justify-between gap-2">
                                                        <span className="text-[10px] font-black text-white/70">第 {index + 1} 页</span>
                                                        <span className="text-[9px] font-bold text-zinc-600 truncate">{item.message}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : isSpotlightTemplate ? (
                                    <>
                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">小卡与大卡素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">上传 3 张小卡和 1 张大卡；使用 AI 前先点击目标素材</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${spotlightSmallCards.length === 3 && spotlightLargeCard.status === 'valid' ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20' : 'text-zinc-500 bg-white/5 border-white/5'}`}>
                                                    小卡 {spotlightSmallCards.length}/3 · {spotlightLargeCard.status === 'valid' ? '大卡已上传' : '大卡待上传'}
                                                </span>
                                            </div>
                                            <input
                                                ref={spotlightSmallInputRef}
                                                type="file"
                                                accept="image/png,.png"
                                                multiple
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.length) await addSpotlightSmallCards(input.files);
                                                    input.value = '';
                                                }}
                                            />
                                            <input
                                                ref={spotlightLargeInputRef}
                                                type="file"
                                                accept="image/png,.png"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.[0]) await updateSpotlightLargeCard(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <div className="rounded-[18px] border border-white/5 bg-black/20 p-3 space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => spotlightSmallInputRef.current?.click()}
                                                        onDragOver={(event) => handleUploadDragOver(event, 'spotlight-small')}
                                                        onDragLeave={(event) => handleUploadDragLeave(event, 'spotlight-small')}
                                                        onDrop={(event) => handleUploadDrop(event, 'spotlight-small')}
                                                        className={`min-h-[110px] rounded-[16px] border border-dashed transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'spotlight-small' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-zinc-950/70 hover:bg-zinc-900/80'}`}
                                                    >
                                                        <div className="text-center px-4">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">dashboard_customize</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'spotlight-small' ? '松开上传小卡素材' : '上传小卡 PNG'}</p>
                                                            <p className="text-[8px] text-zinc-700 font-bold mt-1">3 张 / 275 x 370px</p>
                                                        </div>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => spotlightLargeInputRef.current?.click()}
                                                        onDragOver={(event) => handleUploadDragOver(event, 'spotlight-large')}
                                                        onDragLeave={(event) => handleUploadDragLeave(event, 'spotlight-large')}
                                                        onDrop={(event) => handleUploadDrop(event, 'spotlight-large')}
                                                        className={`min-h-[110px] rounded-[16px] border border-dashed transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'spotlight-large' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-zinc-950/70 hover:bg-zinc-900/80'}`}
                                                    >
                                                        <div className="text-center px-4">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">featured_play_list</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'spotlight-large' ? '松开上传大卡素材' : '上传大卡 PNG'}</p>
                                                            <p className="text-[8px] text-zinc-700 font-bold mt-1">1 张 / 897 x 370px</p>
                                                        </div>
                                                    </button>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${spotlightSmallCards.length === 3 ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20' : 'text-zinc-500 bg-white/5 border-white/5'}`}>小卡 {spotlightSmallCards.length} / 3</span>
                                                    <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(spotlightLargeCard.status)}`}>{spotlightLargeCard.message}</span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {Array.from({ length: 3 }).map((_, index) => {
                                                    const item = spotlightSmallCards[index];
                                                    const target = `small-${index}` as SpotlightAiTarget;
                                                    const selectSmallTarget = () => {
                                                        setSpotlightAiTarget(target);
                                                        setError('');
                                                    };
                                                    return (
                                                        <div
                                                            key={item?.id || target}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={selectSmallTarget}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter' || event.key === ' ') {
                                                                    event.preventDefault();
                                                                    selectSmallTarget();
                                                                }
                                                            }}
                                                            className={`relative rounded-[14px] border p-2 text-left transition-all cursor-pointer ${spotlightAiTarget === target ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/5 bg-black/30 hover:bg-black/40'}`}
                                                        >
                                                            {spotlightAiTarget === target && <span className="absolute left-1 top-1 z-10 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-black text-white">AI 目标</span>}
                                                            {item && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        removeSpotlightSmallCard(item.id);
                                                                        setSpotlightAiTarget((current) => current === target ? null : current);
                                                                    }}
                                                                    className="absolute right-1 top-1 z-10 h-5 w-5 rounded-full bg-black/70 text-white/80 flex items-center justify-center"
                                                                    title="移除小卡"
                                                                    aria-label="移除小卡"
                                                                >
                                                                    <span className="material-symbols-outlined text-xs">close</span>
                                                                </button>
                                                            )}
                                                            {item ? (
                                                                <img src={item.url} alt={`小卡 ${index + 1}`} className="h-16 w-full object-contain rounded-[10px] bg-zinc-950" />
                                                            ) : (
                                                                <div className="h-16 w-full rounded-[10px] border border-dashed border-white/10 bg-zinc-950 flex items-center justify-center">
                                                                    <span className="material-symbols-outlined text-[18px] text-zinc-600">add_photo_alternate</span>
                                                                </div>
                                                            )}
                                                            <p className="mt-1 text-[9px] font-bold text-zinc-500">小卡 {index + 1}</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => {
                                                    setSpotlightAiTarget('large');
                                                    setError('');
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        setSpotlightAiTarget('large');
                                                        setError('');
                                                    }
                                                }}
                                                className={`relative rounded-[14px] border p-2 text-left transition-all cursor-pointer ${spotlightAiTarget === 'large' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/5 bg-black/30 hover:bg-black/40'}`}
                                            >
                                                {spotlightAiTarget === 'large' && <span className="absolute left-2 top-2 z-10 rounded-full bg-primary px-2 py-1 text-[8px] font-black text-white">AI 目标</span>}
                                                {spotlightLargeCard.url && (
                                                    <div className="absolute right-2 top-2 z-20 flex gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                void downloadUploadStateAsPng(spotlightLargeCard, { width: SPOTLIGHT_LARGE_W, height: SPOTLIGHT_LARGE_H, filename: `spotlight-large-${SPOTLIGHT_LARGE_W}x${SPOTLIGHT_LARGE_H}.png` });
                                                            }}
                                                            className="h-6 w-6 rounded-full bg-black/75 text-white/85 border border-white/10 flex items-center justify-center hover:bg-primary hover:text-white transition-all"
                                                            title="下载大卡素材"
                                                            aria-label="下载大卡素材"
                                                        >
                                                            <span className="material-symbols-outlined text-[13px]">download</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                clearUploadState(spotlightLargeCard, setSpotlightLargeCard);
                                                                setSpotlightAiTarget((current) => current === 'large' ? null : current);
                                                            }}
                                                            className="h-6 w-6 rounded-full bg-black/75 text-white/85 border border-white/10 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all"
                                                            title="删除大卡素材"
                                                            aria-label="删除大卡素材"
                                                        >
                                                            <span className="material-symbols-outlined text-[13px]">close</span>
                                                        </button>
                                                    </div>
                                                )}
                                                {spotlightLargeCard.url ? (
                                                    <img src={spotlightLargeCard.url} alt="大卡素材预览" className="h-20 w-full object-contain rounded-[10px] bg-zinc-950" />
                                                ) : (
                                                    <div className="h-20 w-full rounded-[10px] border border-dashed border-white/10 bg-zinc-950 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-[20px] text-zinc-600">featured_play_list</span>
                                                    </div>
                                                )}
                                                <div className="mt-2 flex items-center justify-between gap-2">
                                                    <div>
                                                        <p className="text-[9px] font-black text-zinc-300">大卡素材</p>
                                                        <p className="text-[8px] font-bold text-zinc-600">897 x 370px</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            spotlightLargeInputRef.current?.click();
                                                        }}
                                                        className="h-7 w-7 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center"
                                                        title="上传大卡素材"
                                                        aria-label="上传大卡素材"
                                                    >
                                                        <span className="material-symbols-outlined text-[15px]">upload</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="rounded-[18px] border border-white/5 bg-black/20 p-4 space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[18px] text-zinc-500">auto_awesome</span>
                                                        <p className="text-[10px] font-black text-zinc-500 tracking-normal text-left">AI 文生图 / 图生图</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${spotlightAiTarget ? 'border-primary/30 bg-primary/10 text-primary' : 'border-amber-400/25 bg-amber-400/10 text-amber-200'}`}>{getSpotlightAiTargetLabel(spotlightAiTarget)}</span>
                                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(spotlightAiReference.status)}`}>{spotlightAiReference.message}</span>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-[1fr_96px] gap-3">
                                                    <textarea
                                                        value={spotlightAiPrompt}
                                                        onChange={(event) => setSpotlightAiPrompt(event.target.value)}
                                                        placeholder="填写当前所选小卡或大卡的主题、风格、色彩；有参考图则走图生图..."
                                                        className="w-full min-h-[86px] resize-none bg-zinc-950/80 border border-white/5 rounded-[18px] p-4 text-xs leading-5 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-white/20"
                                                    />
                                                    <div className="relative min-h-[86px]">
                                                        <button
                                                            type="button"
                                                            onClick={() => spotlightAiReferenceInputRef.current?.click()}
                                                            className="absolute inset-0 rounded-[18px] border border-dashed border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-all flex items-center justify-center overflow-hidden"
                                                        >
                                                            {spotlightAiReference.url ? (
                                                                <img src={spotlightAiReference.url} alt="聚光开屏 AI 参考图" className="h-full w-full object-cover" />
                                                            ) : (
                                                                <div className="text-center px-2">
                                                                    <span className="material-symbols-outlined text-[22px] text-zinc-600">add_photo_alternate</span>
                                                                    <p className="text-[9px] text-zinc-600 font-black mt-1">参考图</p>
                                                                </div>
                                                            )}
                                                        </button>
                                                        <input
                                                            ref={spotlightAiReferenceInputRef}
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            onChange={async (event) => {
                                                                const input = event.currentTarget;
                                                                if (input.files?.[0]) await updateSpotlightAiReference(input.files[0]);
                                                                input.value = '';
                                                            }}
                                                        />
                                                        {uploadRemoveButton(spotlightAiReference, removeSpotlightAiReference, '删除聚光开屏参考图', {}, {
                                                            key: 'cutout-spotlight-reference',
                                                            setState: setSpotlightAiReference,
                                                        })}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={generateSelectedSpotlightAsset}
                                                    disabled={!!aiGeneratingKey}
                                                    className="h-10 w-full rounded-[20px] bg-white/10 hover:bg-white/15 text-white text-[11px] font-black transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5"
                                                >
                                                    {renderAiButtonContent(spotlightAiTarget ? `spotlight-${spotlightAiTarget}` : 'spotlight-none', spotlightAiTarget ? `生成${getSpotlightAiTargetLabel(spotlightAiTarget)}` : '先选择素材再生成')}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">开屏素材上传</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">图片 1440 x 2340px / 视频 5s 内</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(spotlightSplash.status)}`}>{spotlightSplash.message}</span>
                                            </div>
                                            <input
                                                ref={spotlightSplashInputRef}
                                                type="file"
                                                accept="image/*,video/*"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.[0]) await updateSpotlightSplash(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <div className="relative">
                                                <button
                                                    onClick={() => spotlightSplashInputRef.current?.click()}
                                                    onDragOver={(event) => handleUploadDragOver(event, 'spotlight-splash')}
                                                    onDragLeave={(event) => handleUploadDragLeave(event, 'spotlight-splash')}
                                                    onDrop={(event) => handleUploadDrop(event, 'spotlight-splash')}
                                                    className={`w-full min-h-[156px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'spotlight-splash' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                                >
                                                    {spotlightSplash.url ? (
                                                        spotlightSplash.file?.type.startsWith('video/') ? (
                                                            <video src={spotlightSplash.url} className="h-36 aspect-[9/16] object-contain rounded-xl bg-black/40" muted loop playsInline />
                                                        ) : (
                                                            <img src={spotlightSplash.url} alt="开屏素材预览" className="h-36 aspect-[9/16] object-cover rounded-xl" />
                                                        )
                                                    ) : (
                                                        <div className="text-center">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">perm_media</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">点击或拖入开屏素材</p>
                                                        </div>
                                                    )}
                                                </button>
                                                {uploadRemoveButton(spotlightSplash, () => clearUploadState(spotlightSplash, setSpotlightSplash), '删除开屏素材', { width: CANVAS_W, height: CANVAS_H, filename: `splash-${CANVAS_W}x${CANVAS_H}.png` }, {
                                                    key: 'cutout-spotlight-splash',
                                                    setState: setSpotlightSplash,
                                                    width: CANVAS_W,
                                                    height: CANVAS_H,
                                                    filename: `splash-${CANVAS_W}x${CANVAS_H}.png`,
                                                })}
                                            </div>
                                        </div>
                                    </>
                                ) : isPolymorphicFlipCardTemplate ? (
                                    <>
                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">底图与翻卡素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">先上传底图，再依次上传 4 张翻卡；使用 AI 前先点击目标素材</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${polyBase.status === 'valid' && polyCards.length === 4 ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20' : 'text-zinc-500 bg-white/5 border-white/5'}`}>
                                                    {polyBase.status === 'valid' ? `底图已上传 · 翻卡 ${polyCards.length}/4` : `先传底图 · 翻卡 ${polyCards.length}/4`}
                                                </span>
                                            </div>
                                            <input
                                                ref={polyBaseInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.[0]) await updatePolyBase(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <input
                                                ref={polyCardsInputRef}
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.length) await addPolyCards(input.files);
                                                    input.value = '';
                                                }}
                                            />
                                            <div className="rounded-[18px] border border-white/5 bg-black/20 p-3 space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => {
                                                            setPolyAiTarget('base');
                                                            setError('');
                                                        }}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter' || event.key === ' ') {
                                                                event.preventDefault();
                                                                setPolyAiTarget('base');
                                                                setError('');
                                                            }
                                                        }}
                                                        onDoubleClick={() => polyBaseInputRef.current?.click()}
                                                        onDragOver={(event) => handleUploadDragOver(event, 'poly-base')}
                                                        onDragLeave={(event) => handleUploadDragLeave(event, 'poly-base')}
                                                        onDrop={(event) => handleUploadDrop(event, 'poly-base')}
                                                        className={`relative min-h-[126px] rounded-[16px] border p-2 text-left transition-all overflow-hidden ${polyAiTarget === 'base' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : dragTarget === 'poly-base' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/5 bg-zinc-950/70 hover:bg-zinc-900/80'}`}
                                                    >
                                                        {polyAiTarget === 'base' && <span className="absolute left-2 top-2 z-10 rounded-full bg-primary px-2 py-1 text-[8px] font-black text-white">AI 目标</span>}
                                                        {polyBase.url ? (
                                                            <img src={polyBase.url} alt="多态翻卡底图预览" className="h-20 w-full object-cover rounded-[12px] bg-zinc-950" />
                                                        ) : (
                                                            <div className="h-20 w-full rounded-[12px] border border-dashed border-white/10 bg-zinc-950 flex items-center justify-center">
                                                                <span className="material-symbols-outlined text-[22px] text-zinc-600">crop_16_9</span>
                                                            </div>
                                                        )}
                                                        <div className="mt-2 flex items-center justify-between gap-2">
                                                            <div>
                                                                <p className="text-[9px] font-black text-zinc-300">底图素材</p>
                                                                <p className="text-[8px] font-bold text-zinc-600">1126 x 900px</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    polyBaseInputRef.current?.click();
                                                                }}
                                                                className="h-7 w-7 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center"
                                                                title="上传底图素材"
                                                                aria-label="上传底图素材"
                                                            >
                                                                <span className="material-symbols-outlined text-[15px]">upload</span>
                                                            </button>
                                                        </div>
                                                        {polyBase.url && (
                                                            <div className="absolute right-2 top-2 z-20 flex gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        void downloadUploadStateAsPng(polyBase, { width: BREAK_FOCAL_W, height: BREAK_FOCAL_H, filename: `poly-base-${BREAK_FOCAL_W}x${BREAK_FOCAL_H}.png` });
                                                                    }}
                                                                    className="h-6 w-6 rounded-full bg-black/75 text-white/85 border border-white/10 flex items-center justify-center hover:bg-primary hover:text-white transition-all"
                                                                    title="下载底图素材"
                                                                    aria-label="下载底图素材"
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px]">download</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        clearUploadState(polyBase, setPolyBase);
                                                                        setPolyAiTarget((current) => current === 'base' ? null : current);
                                                                    }}
                                                                    className="h-6 w-6 rounded-full bg-black/75 text-white/85 border border-white/10 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all"
                                                                    title="删除底图素材"
                                                                    aria-label="删除底图素材"
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px]">close</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => polyCardsInputRef.current?.click()}
                                                        onDragOver={(event) => handleUploadDragOver(event, 'poly-cards')}
                                                        onDragLeave={(event) => handleUploadDragLeave(event, 'poly-cards')}
                                                        onDrop={(event) => handleUploadDrop(event, 'poly-cards')}
                                                        className={`min-h-[126px] rounded-[16px] border border-dashed transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'poly-cards' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-zinc-950/70 hover:bg-zinc-900/80'}`}
                                                    >
                                                        <div className="text-center px-4">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">view_carousel</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'poly-cards' ? '松开上传翻卡图片' : '上传翻卡图片'}</p>
                                                            <p className="text-[8px] text-zinc-700 font-bold mt-1">每张 840 x 360px，按顺序放入空位</p>
                                                        </div>
                                                    </button>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(polyBase.status)}`}>{polyBase.message}</span>
                                                    <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${polyCards.length === 4 ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20' : 'text-zinc-500 bg-white/5 border-white/5'}`}>翻卡 {polyCards.length} / 4</span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {Array.from({ length: 4 }).map((_, index) => {
                                                    const item = polyCards[index];
                                                    const target = `card-${index}` as PolyAiTarget;
                                                    return (
                                                        <button
                                                            key={item?.id || target}
                                                            type="button"
                                                            onClick={() => {
                                                                setPolyAiTarget(target);
                                                                setError('');
                                                            }}
                                                            className={`relative rounded-[14px] border p-2 text-left transition-all ${polyAiTarget === target ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/5 bg-black/30 hover:bg-black/40'}`}
                                                        >
                                                            {item && (
                                                                <span
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        removePolyCard(item.id);
                                                                        setPolyAiTarget((current) => current === target ? null : current);
                                                                    }}
                                                                    onKeyDown={(event) => {
                                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                                            event.preventDefault();
                                                                            event.stopPropagation();
                                                                            removePolyCard(item.id);
                                                                            setPolyAiTarget((current) => current === target ? null : current);
                                                                        }
                                                                    }}
                                                                    className="absolute right-1 top-1 z-10 h-5 w-5 rounded-full bg-black/70 text-white/80 flex items-center justify-center"
                                                                    title="移除翻卡图片"
                                                                >
                                                                    <span className="material-symbols-outlined text-xs">close</span>
                                                                </span>
                                                            )}
                                                            {polyAiTarget === target && <span className="absolute left-1 top-1 z-10 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-black text-white">AI 目标</span>}
                                                            {item ? (
                                                                <img src={item.url} alt={`翻卡图片 ${index + 1}`} className="h-16 w-full object-cover rounded-[10px] bg-zinc-950" />
                                                            ) : (
                                                                <div className="h-16 w-full rounded-[10px] border border-dashed border-white/10 bg-zinc-950 flex items-center justify-center">
                                                                    <span className="material-symbols-outlined text-[18px] text-zinc-600">add_photo_alternate</span>
                                                                </div>
                                                            )}
                                                            <p className="mt-1 text-[9px] font-bold text-zinc-500">翻卡 {index + 1}</p>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className="rounded-[18px] border border-white/5 bg-black/20 p-4 space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[18px] text-zinc-500">auto_awesome</span>
                                                        <p className="text-[10px] font-black text-zinc-500 tracking-normal text-left">AI 生成底图 / 翻卡图片</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${polyAiTarget ? 'border-primary/30 bg-primary/10 text-primary' : 'border-amber-400/25 bg-amber-400/10 text-amber-200'}`}>{getPolyAiTargetLabel(polyAiTarget)}</span>
                                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(polyAiReference.status)}`}>{polyAiReference.message}</span>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-[1fr_96px] gap-3">
                                                    <textarea
                                                        value={polyAiPrompt}
                                                        onChange={(event) => setPolyAiPrompt(event.target.value)}
                                                        placeholder="填写当前所选素材的主题、风格、色彩；先点击底图或某张翻卡，再生成..."
                                                        className="w-full min-h-[86px] resize-none bg-zinc-950/80 border border-white/5 rounded-[18px] p-4 text-xs leading-5 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-white/20"
                                                    />
                                                    <div className="relative min-h-[86px]">
                                                        <button
                                                            onClick={() => polyAiReferenceInputRef.current?.click()}
                                                            className="absolute inset-0 rounded-[18px] border border-dashed border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-all flex items-center justify-center overflow-hidden"
                                                        >
                                                            {polyAiReference.url ? (
                                                                <img src={polyAiReference.url} alt="多态翻卡图生图参考图" className="h-full w-full object-cover" />
                                                            ) : (
                                                                <div className="text-center px-2">
                                                                    <span className="material-symbols-outlined text-[22px] text-zinc-600">add_photo_alternate</span>
                                                                    <p className="text-[9px] text-zinc-600 font-black mt-1">参考图</p>
                                                                </div>
                                                            )}
                                                        </button>
                                                        <input
                                                            ref={polyAiReferenceInputRef}
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            onChange={async (event) => {
                                                                const input = event.currentTarget;
                                                                if (input.files?.[0]) await updatePolyAiReference(input.files[0]);
                                                                input.value = '';
                                                            }}
                                                        />
                                                        {uploadRemoveButton(polyAiReference, removePolyAiReference, '删除多态翻卡参考图', {}, {
                                                            key: 'cutout-poly-reference',
                                                            setState: setPolyAiReference,
                                                        })}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 gap-3">
                                                    <button
                                                        onClick={generateSelectedPolyAsset}
                                                        disabled={!!aiGeneratingKey}
                                                        className="h-10 rounded-[20px] bg-white/10 hover:bg-white/15 text-white text-[11px] font-black transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5"
                                                    >
                                                        {renderAiButtonContent(polyAiTarget ? `poly-${polyAiTarget}` : 'poly-none', polyAiTarget ? `生成${getPolyAiTargetLabel(polyAiTarget)}` : '先选择素材再生成')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">焦点视窗素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">翻转后展示 / 图片或视频 / 1126 x 900px</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(polyFocal.status)}`}>{polyFocal.message}</span>
                                            </div>
                                            <input
                                                ref={polyFocalInputRef}
                                                type="file"
                                                accept="image/*,video/*"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.[0]) await updatePolyFocal(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <div className="relative">
                                                <button
                                                    onClick={() => polyFocalInputRef.current?.click()}
                                                    onDragOver={(event) => handleUploadDragOver(event, 'poly-focal')}
                                                    onDragLeave={(event) => handleUploadDragLeave(event, 'poly-focal')}
                                                    onDrop={(event) => handleUploadDrop(event, 'poly-focal')}
                                                    className={`w-full min-h-[132px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'poly-focal' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                                >
                                                    {polyFocal.url ? (
                                                        polyFocal.file?.type.startsWith('video/') ? (
                                                            <video src={polyFocal.url} className="h-24 w-full object-contain rounded-xl bg-black/40" muted loop playsInline />
                                                        ) : (
                                                            <img src={polyFocal.url} alt="多态翻卡焦点视窗预览" className="h-24 w-full object-cover rounded-xl" />
                                                        )
                                                    ) : (
                                                        <div className="text-center">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">art_track</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">点击或拖入焦点视窗素材</p>
                                                        </div>
                                                    )}
                                                </button>
                                                {uploadRemoveButton(polyFocal, () => clearUploadState(polyFocal, setPolyFocal), '删除焦点视窗素材', { width: BREAK_FOCAL_W, height: BREAK_FOCAL_H, filename: `poly-focal-${BREAK_FOCAL_W}x${BREAK_FOCAL_H}.png` }, {
                                                    key: 'cutout-poly-focal',
                                                    setState: setPolyFocal,
                                                    width: BREAK_FOCAL_W,
                                                    height: BREAK_FOCAL_H,
                                                    filename: `poly-focal-${BREAK_FOCAL_W}x${BREAK_FOCAL_H}.png`,
                                                })}
                                            </div>
                                        </div>
                                    </>
                                ) : isRefreshUiBottomNavTemplate ? (
                                    <>
                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">焦点视窗素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">图片 / 视频不限时长 / 1126 x 900px</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(activeBreakFocal.status)}`}>{activeBreakFocal.message}</span>
                                            </div>
                                            <input
                                                ref={breakFocalInputRef}
                                                type="file"
                                                accept="image/*,video/*"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.[0]) await updateBreakFocal(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <div className="relative">
                                                <button
                                                    onClick={() => breakFocalInputRef.current?.click()}
                                                    onDragOver={(event) => handleUploadDragOver(event, 'break-focal')}
                                                    onDragLeave={(event) => handleUploadDragLeave(event, 'break-focal')}
                                                    onDrop={(event) => handleUploadDrop(event, 'break-focal')}
                                                    className={`w-full min-h-[132px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'break-focal' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                                >
                                                    {activeBreakFocal.url ? (
                                                        activeBreakFocal.file?.type.startsWith('video/') ? (
                                                            <video src={activeBreakFocal.url} className="h-24 w-full object-contain rounded-xl bg-black/40" muted loop playsInline />
                                                        ) : (
                                                            <img src={activeBreakFocal.url} alt="焦点视窗预览" className="h-24 w-full object-cover rounded-xl" />
                                                        )
                                                    ) : (
                                                        <div className="text-center">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">crop_16_9</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">点击或拖入焦点视窗素材</p>
                                                        </div>
                                                    )}
                                                </button>
                                                {uploadRemoveButton(activeBreakFocal, () => clearUploadState(activeBreakFocal, isJumpingFocalTemplate ? setJumpingFocal : setBreakFocal), '删除焦点视窗素材', { width: BREAK_FOCAL_W, height: BREAK_FOCAL_H, filename: `focal-window-${BREAK_FOCAL_W}x${BREAK_FOCAL_H}.png` }, {
                                                    key: `cutout-${isJumpingFocalTemplate ? 'jumping' : 'break'}-focal`,
                                                    setState: isJumpingFocalTemplate ? setJumpingFocal : setBreakFocal,
                                                    width: BREAK_FOCAL_W,
                                                    height: BREAK_FOCAL_H,
                                                    filename: `focal-window-${BREAK_FOCAL_W}x${BREAK_FOCAL_H}.png`,
                                                })}
                                            </div>
                                        </div>

                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">icon 底图</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">上传或 AI 生成 1 张完整底图 / 1228 x 674px</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(refreshIconSheet.status)}`}>{refreshIconSheet.message}</span>
                                                    <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(refreshAiReference.status)}`}>参考图：{refreshAiReference.message}</span>
                                                </div>
                                            </div>
                                            <input
                                                ref={refreshIconsInputRef}
                                                type="file"
                                                accept="image/*,video/*"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.[0]) await updateRefreshIconSheet(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <div className="relative">
                                                <button
                                                    onClick={() => refreshIconsInputRef.current?.click()}
                                                    onDragOver={(event) => handleUploadDragOver(event, 'refresh-icons')}
                                                    onDragLeave={(event) => handleUploadDragLeave(event, 'refresh-icons')}
                                                    onDrop={(event) => handleUploadDrop(event, 'refresh-icons')}
                                                    className={`w-full min-h-[156px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'refresh-icons' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                                >
                                                    {refreshIconSheet.url && refreshIconSheet.status === 'valid' ? (
                                                        refreshIconSheet.file?.type.startsWith('video/') ? (
                                                            <video src={refreshIconSheet.url} className="h-36 w-full object-contain bg-black/30 rounded-xl" muted playsInline preload="metadata" onLoadedData={freezeVideoOnFirstFrame} />
                                                        ) : (
                                                            <img src={refreshIconSheet.url} alt="icon 底图预览" className="h-36 w-full object-contain bg-black/30 rounded-xl" />
                                                        )
                                                    ) : (
                                                        <div className="text-center">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">dashboard_customize</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">点击或拖入 1 张完整 icon 底图</p>
                                                            <p className="text-[9px] text-zinc-700 font-bold mt-1">1228 x 674px，结果页按 1028 x 565px 裁剪</p>
                                                        </div>
                                                    )}
                                                </button>
                                                {refreshIconSheet.url && refreshIconSheet.status === 'valid' && (
                                                    <div className="absolute right-2 top-2 z-10 flex flex-col gap-2">
                                                        <button onClick={removeRefreshIconSheet} className="h-7 w-7 rounded-full bg-black/70 text-white/80 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all" title="移除 icon 底图">
                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                void downloadUploadStateAsPng(refreshIconSheet, {
                                                                    width: REFRESH_ICON_SHEET_W,
                                                                    height: REFRESH_ICON_SHEET_H,
                                                                    filename: `refresh-icon-sheet-${REFRESH_ICON_SHEET_W}x${REFRESH_ICON_SHEET_H}.png`,
                                                                });
                                                            }}
                                                            className="h-7 w-7 rounded-full bg-black/70 text-white/80 flex items-center justify-center hover:bg-primary hover:text-white transition-all"
                                                            title="下载 icon 底图"
                                                            aria-label="下载 icon 底图"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">download</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="rounded-[18px] border border-white/5 bg-black/20 p-3 space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[18px] text-zinc-500">auto_awesome</span>
                                                        <p className="text-[10px] font-black text-zinc-500 tracking-normal text-left">AI 生成</p>
                                                    </div>
                                                    <p className="text-[9px] font-bold text-zinc-600">文生图 / 图生图 / 图生视频</p>
                                                </div>
                                                <div className="grid grid-cols-[1fr_92px] gap-3">
                                                    <textarea
                                                        value={refreshAiPrompt}
                                                        onChange={(event) => setRefreshAiPrompt(event.target.value)}
                                                        placeholder="描述 icon 底图风格、主题、色彩；上传参考图后自动走图生图..."
                                                        className="w-full min-h-[84px] resize-none bg-zinc-950/80 border border-white/5 rounded-[16px] p-3 text-xs leading-5 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-white/20"
                                                    />
                                                    <div className="relative min-h-[84px]">
                                                        <button
                                                            type="button"
                                                            onClick={() => refreshAiReferenceInputRef.current?.click()}
                                                            className="absolute inset-0 rounded-[16px] border border-dashed border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-all flex items-center justify-center overflow-hidden"
                                                        >
                                                            {refreshAiReference.url ? (
                                                                <img src={refreshAiReference.url} alt="icon 参考图" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="text-center px-2">
                                                                    <span className="material-symbols-outlined text-[22px] text-zinc-600">add_photo_alternate</span>
                                                                    <p className="text-[9px] text-zinc-600 font-black mt-1">参考图</p>
                                                                </div>
                                                            )}
                                                        </button>
                                                        <input
                                                            ref={refreshAiReferenceInputRef}
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            onChange={async (event) => {
                                                                const input = event.currentTarget;
                                                                if (input.files?.[0]) await updateRefreshAiReference(input.files[0]);
                                                                input.value = '';
                                                            }}
                                                        />
                                                        {uploadRemoveButton(refreshAiReference, removeRefreshAiReference, '删除 icon 参考图', {}, {
                                                            key: 'cutout-refresh-icon-reference',
                                                            setState: setRefreshAiReference,
                                                        })}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={generateRefreshIconSheetByPrompt}
                                                        disabled={!!aiGeneratingKey}
                                                        className="h-10 rounded-[18px] bg-white/10 hover:bg-white/15 text-white text-[11px] font-black transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5"
                                                    >
                                                        {renderAiButtonContent('refresh-text', '生成图片')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={generateRefreshIconVideoByReference}
                                                        disabled={!!aiGeneratingKey || !(refreshIconSheet.file?.type.startsWith('image/') || refreshAiReference.url)}
                                                        className={`h-10 rounded-[18px] text-[11px] font-black transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5 ${(refreshIconSheet.file?.type.startsWith('image/') || refreshAiReference.url) ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-white/[0.04] text-zinc-600'}`}
                                                    >
                                                        {renderAiButtonContent('refresh-i2v', '图生视频')}
                                                    </button>
                                                </div>
                                            </div>
                                            {refreshIconSheet.url && refreshIconSheet.status === 'valid' && (
                                                <div className="space-y-2">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {REFRESH_TOP_ICON_SLOTS.map((slot, index) => (
                                                            <div key={`top-${index}`} className="rounded-[12px] border border-white/5 bg-black/30 p-1.5">
                                                                <div
                                                                    className="group/refresh-slot relative w-full overflow-hidden bg-zinc-950"
                                                                    style={{
                                                                        aspectRatio: `${slot.width} / ${slot.height}`,
                                                                        borderRadius: getRefreshPreviewBorderRadius(slot),
                                                                    }}
                                                                >
                                                                    {refreshIconSheet.file?.type.startsWith('video/') ? (
                                                                        <video src={refreshIconSheet.url!} style={getRefreshSheetPreviewImageStyle(slot)} muted playsInline preload="metadata" onLoadedData={freezeVideoOnFirstFrame} />
                                                                    ) : (
                                                                        <img src={refreshIconSheet.url!} alt={`上方 ${index + 1}`} style={getRefreshSheetPreviewImageStyle(slot)} />
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            downloadRefreshIconSlot(slot, `${index + 1}`);
                                                                        }}
                                                                        className="absolute right-1.5 top-1.5 z-20 h-7 w-7 rounded-full bg-black/75 text-white/90 border border-white/10 shadow-lg opacity-0 group-hover/refresh-slot:opacity-100 transition-opacity flex items-center justify-center"
                                                                        title={`下载 ${index + 1}`}
                                                                        aria-label={`下载 ${index + 1}`}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[15px]">download</span>
                                                                    </button>
                                                                </div>
                                                                <p className="mt-1 text-[8px] font-bold text-zinc-500">上方 {index + 1}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {REFRESH_BOTTOM_ICON_SLOTS.map((slot, index) => (
                                                            <div key={`bottom-${index}`} className="rounded-[12px] border border-white/5 bg-black/30 p-1.5">
                                                                <div
                                                                    className="group/refresh-slot relative w-full overflow-hidden bg-zinc-950"
                                                                    style={{
                                                                        aspectRatio: `${slot.width} / ${slot.height}`,
                                                                        borderRadius: getRefreshPreviewBorderRadius(slot),
                                                                    }}
                                                                >
                                                                    {refreshIconSheet.file?.type.startsWith('video/') ? (
                                                                        <video src={refreshIconSheet.url!} style={getRefreshSheetPreviewImageStyle(slot)} muted playsInline preload="metadata" onLoadedData={freezeVideoOnFirstFrame} />
                                                                    ) : (
                                                                        <img src={refreshIconSheet.url!} alt={`下方 ${index + 1}`} style={getRefreshSheetPreviewImageStyle(slot)} />
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            downloadRefreshIconSlot(slot, `${index + 3}`);
                                                                        }}
                                                                        className="absolute right-1 top-1 z-20 h-6 w-6 rounded-full bg-black/75 text-white/90 border border-white/10 shadow-lg opacity-0 group-hover/refresh-slot:opacity-100 transition-opacity flex items-center justify-center"
                                                                        title={`下载 ${index + 3}`}
                                                                        aria-label={`下载 ${index + 3}`}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[14px]">download</span>
                                                                    </button>
                                                                </div>
                                                                <p className="mt-1 text-[8px] font-bold text-zinc-500">下方 {index + 1}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {SHOW_REFRESH_BOTTOM_NAV_UPLOAD && (
                                            <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <h2 className="text-white text-sm font-black">底导素材</h2>
                                                        <p className="text-[10px] text-zinc-600 font-bold mt-1">上传或 AI 生成底部导航素材 / 1126 x 252px</p>
                                                    </div>
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(refreshBottomNav.status)}`}>{refreshBottomNav.message}</span>
                                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(refreshBottomNavAiReference.status)}`}>参考图：{refreshBottomNavAiReference.message}</span>
                                                    </div>
                                                </div>
                                                <input
                                                    ref={refreshBottomNavInputRef}
                                                    type="file"
                                                    accept="image/*,video/*"
                                                    className="hidden"
                                                    onChange={async (e) => {
                                                        const input = e.currentTarget;
                                                        if (input.files?.[0]) await updateRefreshBottomNav(input.files[0]);
                                                        input.value = '';
                                                    }}
                                                />
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => refreshBottomNavInputRef.current?.click()}
                                                        onDragOver={(event) => handleUploadDragOver(event, 'refresh-bottom-nav')}
                                                        onDragLeave={(event) => handleUploadDragLeave(event, 'refresh-bottom-nav')}
                                                        onDrop={(event) => handleUploadDrop(event, 'refresh-bottom-nav')}
                                                        className={`w-full min-h-[116px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'refresh-bottom-nav' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                                    >
                                                        {refreshBottomNav.url ? (
                                                            refreshBottomNav.file?.type.startsWith('video/') ? (
                                                                <video src={refreshBottomNav.url} className="h-20 w-full object-contain rounded-xl bg-zinc-950" muted playsInline preload="metadata" onLoadedData={freezeVideoOnFirstFrame} />
                                                            ) : (
                                                                <img src={refreshBottomNav.url} alt="底导素材预览" className="h-20 w-full object-contain rounded-xl bg-zinc-950" />
                                                            )
                                                        ) : (
                                                            <div className="text-center">
                                                                <span className="material-symbols-outlined text-3xl text-zinc-600">bottom_navigation</span>
                                                                <p className="text-[10px] text-zinc-500 font-black mt-2">点击或拖入底导素材</p>
                                                            </div>
                                                        )}
                                                    </button>
                                                    {uploadRemoveButton(refreshBottomNav, () => clearUploadState(refreshBottomNav, setRefreshBottomNav), '删除底导素材', { width: REFRESH_BOTTOM_NAV_W, height: REFRESH_BOTTOM_NAV_H, filename: `bottom-nav-${REFRESH_BOTTOM_NAV_W}x${REFRESH_BOTTOM_NAV_H}.png` }, {
                                                        key: 'cutout-refresh-bottom-nav',
                                                        setState: setRefreshBottomNav,
                                                        width: REFRESH_BOTTOM_NAV_W,
                                                        height: REFRESH_BOTTOM_NAV_H,
                                                        filename: `bottom-nav-${REFRESH_BOTTOM_NAV_W}x${REFRESH_BOTTOM_NAV_H}.png`,
                                                    })}
                                                </div>
                                                <div className="rounded-[18px] border border-white/5 bg-black/20 p-3 space-y-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-[18px] text-zinc-500">auto_awesome</span>
                                                            <p className="text-[10px] font-black text-zinc-500 tracking-normal text-left">AI 生成</p>
                                                        </div>
                                                        <p className="text-[9px] font-bold text-zinc-600">文生图 / 图生图 / 图生视频</p>
                                                    </div>
                                                    <div className="grid grid-cols-[1fr_92px] gap-3">
                                                        <textarea
                                                            value={refreshBottomNavAiPrompt}
                                                            onChange={(event) => setRefreshBottomNavAiPrompt(event.target.value)}
                                                            placeholder="描述底导背景风格、主题、色彩；上传参考图后自动走图生图..."
                                                            className="w-full min-h-[84px] resize-none bg-zinc-950/80 border border-white/5 rounded-[16px] p-3 text-xs leading-5 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-white/20"
                                                        />
                                                        <div className="relative min-h-[84px]">
                                                            <button
                                                                type="button"
                                                                onClick={() => refreshBottomNavAiReferenceInputRef.current?.click()}
                                                                className="absolute inset-0 rounded-[16px] border border-dashed border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-all flex items-center justify-center overflow-hidden"
                                                            >
                                                                {refreshBottomNavAiReference.url ? (
                                                                    <img src={refreshBottomNavAiReference.url} alt="底导参考图" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="text-center px-2">
                                                                        <span className="material-symbols-outlined text-[22px] text-zinc-600">add_photo_alternate</span>
                                                                        <p className="text-[9px] text-zinc-600 font-black mt-1">参考图</p>
                                                                    </div>
                                                                )}
                                                            </button>
                                                            <input
                                                                ref={refreshBottomNavAiReferenceInputRef}
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={async (event) => {
                                                                    const input = event.currentTarget;
                                                                    if (input.files?.[0]) await updateRefreshBottomNavAiReference(input.files[0]);
                                                                    input.value = '';
                                                                }}
                                                            />
                                                            {uploadRemoveButton(refreshBottomNavAiReference, removeRefreshBottomNavAiReference, '删除底导参考图', {}, {
                                                                key: 'cutout-refresh-bottom-reference',
                                                                setState: setRefreshBottomNavAiReference,
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={generateRefreshBottomNavByPrompt}
                                                            disabled={!!aiGeneratingKey}
                                                            className="h-10 rounded-[18px] bg-white/10 hover:bg-white/15 text-white text-[11px] font-black transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5"
                                                        >
                                                            {renderAiButtonContent('refresh-bottom-nav-text', '生成图片')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={generateRefreshBottomNavVideoByReference}
                                                            disabled={!!aiGeneratingKey || !(refreshBottomNav.file?.type.startsWith('image/') || refreshBottomNavAiReference.url)}
                                                            className={`h-10 rounded-[18px] text-[11px] font-black transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5 ${(refreshBottomNav.file?.type.startsWith('image/') || refreshBottomNavAiReference.url) ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-white/[0.04] text-zinc-600'}`}
                                                        >
                                                            {renderAiButtonContent('refresh-bottom-nav-i2v', '图生视频')}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : isLinkedSuperVideoTemplate ? (
                                    <>
                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">①上传开屏视频</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">视频 1440 x 2340px / 8s</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(linkedOpeningVideo.status)}`}>{linkedOpeningVideo.message}</span>
                                            </div>
                                            <input
                                                ref={linkedOpeningInputRef}
                                                type="file"
                                                accept="video/*"
                                                className="hidden"
                                                onChange={async (event) => {
                                                    const input = event.currentTarget;
                                                    if (input.files?.[0]) await updateLinkedOpeningVideo(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => linkedOpeningInputRef.current?.click()}
                                                    onDragOver={(event) => handleUploadDragOver(event, 'linked-opening')}
                                                    onDragLeave={(event) => handleUploadDragLeave(event, 'linked-opening')}
                                                    onDrop={(event) => handleUploadDrop(event, 'linked-opening')}
                                                    className={`w-full min-h-[190px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'linked-opening' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                                >
                                                    {linkedOpeningVideo.url ? (
                                                        <video src={linkedOpeningVideo.url} className="h-48 max-w-full rounded-[16px] object-contain bg-black/40" muted loop playsInline />
                                                    ) : (
                                                        <div className="text-center">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">movie</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'linked-opening' ? '松开上传开屏视频' : '点击或拖入 8s 开屏视频'}</p>
                                                        </div>
                                                    )}
                                                </button>
                                                {uploadRemoveButton(linkedOpeningVideo, () => clearUploadState(linkedOpeningVideo, setLinkedOpeningVideo), '删除开屏视频')}
                                            </div>
                                        </div>

                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">②上传焦点视窗视频</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">视频 1126 x 900px / 播放到结束</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(linkedFocalVideo.status)}`}>{linkedFocalVideo.message}</span>
                                            </div>
                                            <input
                                                ref={linkedFocalInputRef}
                                                type="file"
                                                accept="video/*"
                                                className="hidden"
                                                onChange={async (event) => {
                                                    const input = event.currentTarget;
                                                    if (input.files?.[0]) await updateLinkedFocalVideo(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => linkedFocalInputRef.current?.click()}
                                                    onDragOver={(event) => handleUploadDragOver(event, 'linked-focal')}
                                                    onDragLeave={(event) => handleUploadDragLeave(event, 'linked-focal')}
                                                    onDrop={(event) => handleUploadDrop(event, 'linked-focal')}
                                                    className={`w-full min-h-[150px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'linked-focal' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                                >
                                                    {linkedFocalVideo.url ? (
                                                        <video src={linkedFocalVideo.url} className="h-28 w-full rounded-[16px] object-contain bg-black/40" muted loop playsInline />
                                                    ) : (
                                                        <div className="text-center">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">crop_16_9</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'linked-focal' ? '松开上传焦点视窗视频' : '点击或拖入焦点视窗视频'}</p>
                                                        </div>
                                                    )}
                                                </button>
                                                {uploadRemoveButton(linkedFocalVideo, () => clearUploadState(linkedFocalVideo, setLinkedFocalVideo), '删除焦点视窗视频')}
                                            </div>
                                        </div>

                                        <div className="rounded-[20px] border border-white/5 bg-white/[0.035] p-5 text-[11px] font-bold text-zinc-400 leading-6">
                                            <p className="text-white font-black mb-2">联动时间轴</p>
                                            <p>0-5s：开屏视频正常播放。</p>
                                            <p>5-5.5s：开屏视频回缩到沉浸式首页 UI 界面。</p>
                                            <p>5.5-8s：开屏视频保持全景播放状态继续播放。</p>
                                            <p>8-8.5s：开屏视频与首页 UI 一起回缩到焦点视窗位置。</p>
                                            <p>8.5s 后：焦点视窗视频接续播放到结束。</p>
                                        </div>
                                    </>
                                ) : isBreakFocalTemplate ? (
                                    <>
                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">焦点视窗素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">图片 / 视频不限时长 / 1126 x 900px</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(activeBreakFocal.status)}`}>{activeBreakFocal.message}</span>
                                            </div>
                                            <input
                                                ref={breakFocalInputRef}
                                                type="file"
                                                accept="image/*,video/*"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.[0]) await updateBreakFocal(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <div className="relative">
                                                <button
                                                    onClick={() => breakFocalInputRef.current?.click()}
                                                    onDragOver={(event) => handleUploadDragOver(event, 'break-focal')}
                                                    onDragLeave={(event) => handleUploadDragLeave(event, 'break-focal')}
                                                    onDrop={(event) => handleUploadDrop(event, 'break-focal')}
                                                    className={`w-full min-h-[132px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'break-focal' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                                >
                                                    {activeBreakFocal.url ? (
                                                        activeBreakFocal.file?.type.startsWith('video/') ? (
                                                            <video src={activeBreakFocal.url} className="h-24 w-full object-contain rounded-xl bg-black/40" muted loop playsInline />
                                                        ) : (
                                                            <img src={activeBreakFocal.url} alt="焦点视窗预览" className="h-24 w-full object-cover rounded-xl" />
                                                        )
                                                    ) : (
                                                        <div className="text-center">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">crop_16_9</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">点击或拖入焦点视窗素材</p>
                                                        </div>
                                                    )}
                                                </button>
                                                {uploadRemoveButton(activeBreakFocal, () => clearUploadState(activeBreakFocal, isJumpingFocalTemplate ? setJumpingFocal : setBreakFocal), '删除焦点视窗素材', { width: BREAK_FOCAL_W, height: BREAK_FOCAL_H, filename: `focal-window-${BREAK_FOCAL_W}x${BREAK_FOCAL_H}.png` }, {
                                                    key: `cutout-${isJumpingFocalTemplate ? 'jumping' : 'break'}-focal-panel`,
                                                    setState: isJumpingFocalTemplate ? setJumpingFocal : setBreakFocal,
                                                    width: BREAK_FOCAL_W,
                                                    height: BREAK_FOCAL_H,
                                                    filename: `focal-window-${BREAK_FOCAL_W}x${BREAK_FOCAL_H}.png`,
                                                })}
                                            </div>
                                        </div>

                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">破框素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">
                                                        {isJumpingFocalTemplate ? 'PNG / WEBP / JPG / 1126 x 906px；第 0 秒开始播放' : 'PNG / WEBP / JPG / 1126 x 1890px；可抠成透明 PNG'}
                                                    </p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(activeBreakFrameAsset.status)}`}>{activeBreakFrameAsset.message}</span>
                                            </div>
                                            <input
                                                ref={breakFrameInputRef}
                                                type="file"
                                                accept="image/png,image/webp,image/jpeg,.png,.webp,.jpg,.jpeg"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.[0]) await updateBreakFrameAsset(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <div className="relative">
                                                <button
                                                    onClick={() => breakFrameInputRef.current?.click()}
                                                    onDragOver={(event) => handleUploadDragOver(event, 'break-frame')}
                                                    onDragLeave={(event) => handleUploadDragLeave(event, 'break-frame')}
                                                    onDrop={(event) => handleUploadDrop(event, 'break-frame')}
                                                    className={`w-full min-h-[156px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'break-frame' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                                >
                                                    {activeBreakFrameAsset.url ? (
                                                        activeBreakFrameAsset.file?.type.startsWith('video/') ? (
                                                            <video src={activeBreakFrameAsset.url} className="h-36 max-w-full object-contain rounded-xl bg-zinc-950" muted loop playsInline />
                                                        ) : (
                                                            <img src={activeBreakFrameAsset.url} alt="破框素材预览" className="h-36 max-w-full object-contain rounded-xl bg-zinc-950" />
                                                        )
                                                    ) : (
                                                        <div className="text-center">
                                                            <span className="material-symbols-outlined text-3xl text-zinc-600">view_in_ar</span>
                                                            <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'break-frame' ? '松开上传破框素材' : '点击或拖入破框素材'}</p>
                                                            <p className="text-[9px] text-zinc-700 font-bold mt-1">上传白底图后可一键抠成透明 PNG</p>
                                                        </div>
                                                    )}
                                                </button>
                                                {uploadRemoveButton(activeBreakFrameAsset, () => clearUploadState(activeBreakFrameAsset, isJumpingFocalTemplate ? setJumpingFrameAsset : setBreakFrameAsset), '删除破框素材', { width: BREAK_FRAME_W, height: isJumpingFocalTemplate ? JUMPING_FRAME_H : BREAK_FRAME_H, filename: `break-frame-${BREAK_FRAME_W}x${isJumpingFocalTemplate ? JUMPING_FRAME_H : BREAK_FRAME_H}.png` }, {
                                                    key: `cutout-${isJumpingFocalTemplate ? 'jumping' : 'break'}-frame`,
                                                    setState: isJumpingFocalTemplate ? setJumpingFrameAsset : setBreakFrameAsset,
                                                    width: BREAK_FRAME_W,
                                                    height: isJumpingFocalTemplate ? JUMPING_FRAME_H : BREAK_FRAME_H,
                                                    filename: `break-frame-${BREAK_FRAME_W}x${isJumpingFocalTemplate ? JUMPING_FRAME_H : BREAK_FRAME_H}.png`,
                                                })}
                                            </div>
                                            <div className="grid gap-3">
                                                {(isJumpingFocalTemplate ? [
                                                    {
                                                        phase: 0 as const,
                                                        title: '跃动破框',
                                                        value: jumpingPrompt,
                                                        setter: setJumpingPrompt,
                                                        reference: jumpingReference,
                                                        startSecond: 0,
                                                        setStartSecond: setBreakFirstStartSecond,
                                                        minSecond: 0,
                                                        step: 1,
                                                        timeNote: '第 0 秒开始播放，只需要一次破框',
                                                        placeholder: '填写跃动破框的主体、动作和视觉效果...'
                                                    }
                                                ] : [
                                                    {
                                                        phase: 0 as const,
                                                        title: '第一次破框',
                                                        value: breakFirstPrompt,
                                                        setter: setBreakFirstPrompt,
                                                        reference: breakFirstReference,
                                                        startSecond: breakFirstTriggerSecond,
                                                        setStartSecond: setBreakFirstStartSecond,
                                                        minSecond: 3,
                                                        step: 1,
                                                        timeNote: '第 3 秒后出现，只能选择整秒；第二次会自动晚 4 秒',
                                                        placeholder: '填写第一次破框的主体、动作和视觉效果...'
                                                    },
                                                    {
                                                        phase: 1 as const,
                                                        title: '第二次破框',
                                                        value: breakSecondPrompt,
                                                        setter: setBreakSecondPrompt,
                                                        reference: breakSecondReference,
                                                        startSecond: breakSecondTriggerSecond,
                                                        setStartSecond: setBreakSecondStartSecond,
                                                        minSecond: Math.max(7, breakFirstTriggerSecond + 4),
                                                        step: 0.1,
                                                        timeNote: '至少比第一次晚 4 秒，可用小数',
                                                        placeholder: '填写第二次破框的主体、动作和视觉效果...'
                                                    }
                                                ]).map((item) => (
                                                    <div key={item.title} className="rounded-[18px] border border-white/5 bg-black/20 p-4 space-y-3">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-[18px] text-zinc-500">movie_edit</span>
                                                                <p className="text-[10px] font-black text-zinc-500 tracking-normal text-left">{item.title}</p>
                                                            </div>
                                                            <span className="text-[9px] text-zinc-700 font-black">{isJumpingFocalTemplate ? '1126 x 906 / 第0秒播放' : BREAK_AI_DURATION_RULE}</span>
                                                        </div>
                                                        {!isJumpingFocalTemplate && <div className="flex items-center justify-between gap-3 rounded-[14px] bg-white/[0.04] border border-white/5 px-3 py-2">
                                                            <span className="text-[9px] text-zinc-600 font-bold">{item.timeNote}</span>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <button
                                                                    onClick={() => {
                                                                        item.setStartSecond((current) => {
                                                                            const next = Math.max(item.minSecond, Number((current - item.step).toFixed(1)));
                                                                            if (item.phase === 0) {
                                                                                const roundedNext = Math.round(next);
                                                                                setBreakSecondStartSecond(roundedNext + 4);
                                                                                return roundedNext;
                                                                            }
                                                                            return next;
                                                                        });
                                                                        resetOutput();
                                                                    }}
                                                                    className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/15 text-white flex items-center justify-center"
                                                                    title="提前"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">remove</span>
                                                                </button>
                                                                <input
                                                                    type="number"
                                                                    min={item.minSecond}
                                                                    step={item.step}
                                                                    value={item.startSecond}
                                                                    onChange={(event) => {
                                                                        const raw = Number(event.target.value);
                                                                        if (!Number.isFinite(raw)) return;
                                                                        const next = item.phase === 0 ? Math.round(raw) : Number(raw.toFixed(1));
                                                                        const normalized = Math.max(item.minSecond, next);
                                                                        item.setStartSecond(normalized);
                                                                        if (item.phase === 0) {
                                                                            setBreakSecondStartSecond(normalized + 4);
                                                                        }
                                                                        resetOutput();
                                                                    }}
                                                                    className="h-7 w-[72px] rounded-lg bg-zinc-950 border border-white/5 text-center text-[11px] font-black text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                                                                />
                                                                <button
                                                                    onClick={() => {
                                                                        item.setStartSecond((current) => {
                                                                            const next = Number((current + item.step).toFixed(1));
                                                                            if (item.phase === 0) {
                                                                                const roundedNext = Math.round(next);
                                                                                setBreakSecondStartSecond(roundedNext + 4);
                                                                                return roundedNext;
                                                                            }
                                                                            return Math.max(item.minSecond, next);
                                                                        });
                                                                        resetOutput();
                                                                    }}
                                                                    className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/15 text-white flex items-center justify-center"
                                                                    title="延后"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">add</span>
                                                                </button>
                                                            </div>
                                                        </div>}
                                                        <div className="grid grid-cols-[1fr_96px] gap-3">
                                                            <textarea
                                                                value={item.value}
                                                                onChange={(e) => item.setter(e.target.value)}
                                                                placeholder={item.placeholder}
                                                                className="w-full min-h-[86px] resize-none bg-zinc-950/80 border border-white/5 rounded-[18px] p-4 text-xs leading-5 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-white/20"
                                                            />
                                                            <div className="relative min-h-[86px]">
                                                                <label className="absolute inset-0 rounded-[18px] border border-dashed border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-all flex items-center justify-center overflow-hidden cursor-pointer">
                                                                    {item.reference.url ? (
                                                                        <img src={item.reference.url} alt={`${item.title}参考图`} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="text-center px-2">
                                                                            <span className="material-symbols-outlined text-[22px] text-zinc-600">add_photo_alternate</span>
                                                                            <p className="text-[9px] text-zinc-600 font-black mt-1">参考图</p>
                                                                        </div>
                                                                    )}
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                                        onChange={(e) => {
                                                                            const input = e.currentTarget;
                                                                            if (input.files?.[0]) updateBreakReference(item.phase, input.files[0]);
                                                                            input.value = '';
                                                                        }}
                                                                        title={`上传${item.title}参考图`}
                                                                    />
                                                                </label>
                                                                {uploadRemoveButton(item.reference, () => removeBreakReference(item.phase), `删除${item.title}参考图`, {}, {
                                                                    key: `cutout-break-reference-${item.phase}`,
                                                                    setState: item.phase === 0 ? setBreakFirstReference : setBreakSecondReference,
                                                                })}
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <button
                                                                onClick={() => generateBreakFrameByPrompt('text', item.phase)}
                                                                disabled={!!aiGeneratingKey}
                                                                className="h-10 rounded-[20px] bg-white/10 hover:bg-white/15 text-white text-[11px] font-black transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5"
                                                            >
                                                                {renderAiButtonContent(`break-${item.phase}-text`, '生成文生视频')}
                                                            </button>
                                                            <button
                                                                onClick={() => generateBreakFrameByPrompt('image', item.phase)}
                                                                disabled={!!aiGeneratingKey || !(activeBreakFrameAsset.file?.type.startsWith('image/') || item.reference.url)}
                                                                className={`h-10 rounded-[20px] text-[11px] font-black transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5 ${(activeBreakFrameAsset.file?.type.startsWith('image/') || item.reference.url) ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-white/[0.04] text-zinc-600'}`}
                                                            >
                                                                {renderAiButtonContent(`break-${item.phase}-image`, '图生视频')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : isJumpingFocalTemplate || isRefreshUiBottomNavTemplate ? (
                                    <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                        <div className="flex items-start gap-4">
                                            <div className="h-11 w-11 rounded-[16px] bg-white/10 flex items-center justify-center shrink-0">
                                                <span className="material-symbols-outlined text-zinc-300">{isJumpingFocalTemplate ? 'motion_photos_auto' : 'auto_awesome_mosaic'}</span>
                                            </div>
                                            <div>
                                                <h2 className="text-white text-sm font-black">{selectedTemplateName}模版</h2>
                                                <p className="text-[10px] text-zinc-600 font-bold mt-1">{isJumpingFocalTemplate ? '模版入口已创建，后续可继续配置上传素材、动画规则和合成预览。' : '当前仅保留 icon 底图素材能力，底部导航素材入口暂不展示。'}</p>
                                            </div>
                                        </div>
                                        <div className="rounded-[18px] border border-white/5 bg-black/20 p-4 text-[11px] leading-5 text-zinc-500 font-bold">
                                            当前不会套用其他模版的上传能力，避免误生成。
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-white text-sm font-black">①上传挂件素材</h2>
                                            <p className="text-[10px] text-zinc-600 font-bold mt-1">PNG / 450 x 450px / MR 标准</p>
                                        </div>
                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(asset.status)}`}>{asset.message}</span>
                                    </div>

                                    <input ref={assetInputRef} type="file" accept="image/*,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => {
                                        const input = e.currentTarget;
                                        if (input.files?.[0]) updateAsset(input.files[0]);
                                        input.value = '';
                                    }} />
                                    <div className="relative">
                                        <button
                                            onClick={() => assetInputRef.current?.click()}
                                            onDragOver={(event) => handleUploadDragOver(event, 'asset')}
                                            onDragLeave={(event) => handleUploadDragLeave(event, 'asset')}
                                            onDrop={(event) => handleUploadDrop(event, 'asset')}
                                            className={`w-full min-h-[150px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'asset' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                        >
                                            {asset.url ? (
                                                <img src={asset.url} alt="挂件素材预览" className="w-28 h-28 object-contain rounded-xl" />
                                            ) : (
                                                <div className="text-center">
                                                    <span className="material-symbols-outlined text-3xl text-zinc-600">add_photo_alternate</span>
                                                    <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'asset' ? '松开上传图片素材' : '点击或拖入图片素材'}</p>
                                                </div>
                                            )}
                                        </button>
                                        {uploadRemoveButton(asset, () => clearUploadState(asset, setAsset), '删除挂件素材', { width: PENDANT_SIZE, height: PENDANT_SIZE, filename: `pendant-${PENDANT_SIZE}x${PENDANT_SIZE}.png` }, {
                                            key: 'cutout-pendant',
                                            setState: setAsset,
                                            width: PENDANT_SIZE,
                                            height: PENDANT_SIZE,
                                            filename: `pendant-${PENDANT_SIZE}x${PENDANT_SIZE}.png`,
                                        })}
                                    </div>

                                    <div className="grid grid-cols-[1fr_96px] gap-3">
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-zinc-600">magic_button</span>
                                            <input
                                                value={prompt}
                                                onChange={(e) => setPrompt(e.target.value)}
                                                placeholder="描述挂件主体、风格、材质..."
                                                className="w-full h-20 bg-zinc-950/80 border border-white/5 rounded-[20px] pl-11 pr-4 text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-white/20"
                                            />
                                        </div>
                                        <div className="relative h-20">
                                            <button
                                                onClick={() => pendantReferenceInputRef.current?.click()}
                                                className="absolute inset-0 rounded-[18px] border border-dashed border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-all flex items-center justify-center overflow-hidden"
                                            >
                                                {pendantReference.url ? (
                                                    <img src={pendantReference.url} alt="挂件图生图参考图" className="h-full w-full object-cover" />
                                                ) : (
                                                    <div className="text-center px-2">
                                                        <span className="material-symbols-outlined text-[22px] text-zinc-600">add_photo_alternate</span>
                                                        <p className="text-[9px] text-zinc-600 font-black mt-1">参考图</p>
                                                    </div>
                                                )}
                                            </button>
                                            <input
                                                ref={pendantReferenceInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={async (event) => {
                                                    const input = event.currentTarget;
                                                    if (input.files?.[0]) await updatePendantReference(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            {uploadRemoveButton(pendantReference, removePendantReference, '删除挂件参考图', {}, {
                                                key: 'cutout-pendant-reference',
                                                setState: setPendantReference,
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between rounded-[16px] border border-white/5 bg-white/[0.03] px-4 py-2">
                                        <span className="text-[10px] font-bold text-zinc-600">输出格式</span>
                                        <span className="text-[10px] font-black text-zinc-300">透明 PNG</span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        <button
                                            onClick={generatePromptAsset}
                                            disabled={!!aiGeneratingKey}
                                            className="h-10 rounded-[20px] bg-white/10 hover:bg-white/15 text-white text-[11px] font-black transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5"
                                        >
                                            {renderAiButtonContent('pendant-text', '生成图片')}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-white text-sm font-black">②上传开屏素材</h2>
                                            <p className="text-[10px] text-zinc-600 font-bold mt-1">图片 1440 x 2340px / 视频 5s 内</p>
                                        </div>
                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(splash.status)}`}>{splash.message}</span>
                                    </div>

                                    <input ref={splashInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => {
                                        const input = e.currentTarget;
                                        if (input.files?.[0]) updateSplash(input.files[0]);
                                        input.value = '';
                                    }} />
                                    <div className="relative">
                                        <button
                                            onClick={() => splashInputRef.current?.click()}
                                            onDragOver={(event) => handleUploadDragOver(event, 'splash')}
                                            onDragLeave={(event) => handleUploadDragLeave(event, 'splash')}
                                            onDrop={(event) => handleUploadDrop(event, 'splash')}
                                            className={`w-full min-h-[190px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'splash' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                        >
                                            {splash.url ? (
                                                splash.file?.type.startsWith('video/') ? (
                                                    <video src={splash.url} className="h-44 aspect-[9/16] object-contain rounded-xl bg-black/40" muted loop playsInline />
                                                ) : (
                                                    <img src={splash.url} alt="开屏素材预览" className="h-44 aspect-[9/16] object-cover rounded-xl" />
                                                )
                                            ) : (
                                                <div className="text-center">
                                                    <span className="material-symbols-outlined text-3xl text-zinc-600">perm_media</span>
                                                    <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'splash' ? '松开上传开屏素材' : '点击或拖入图片 / 视频'}</p>
                                                </div>
                                            )}
                                        </button>
                                            {uploadRemoveButton(splash, () => clearUploadState(splash, setSplash), '删除开屏素材', { width: CANVAS_W, height: CANVAS_H, filename: `dynamic-splash-${CANVAS_W}x${CANVAS_H}.png` }, {
                                                key: 'cutout-dynamic-splash',
                                                setState: setSplash,
                                                width: CANVAS_W,
                                                height: CANVAS_H,
                                                filename: `dynamic-splash-${CANVAS_W}x${CANVAS_H}.png`,
                                            })}
                                    </div>
                                </div>
                                    </>
                                )}

                                {error && (
                                    <div className="rounded-[20px] border border-rose-400/20 bg-rose-500/10 text-rose-200 text-xs font-bold px-5 py-4">
                                        {error}
                                    </div>
                                )}
                            </section>

                            <section className="creative-preview-panel bg-white/[0.04] border border-white/5 rounded-[20px] p-5 md:p-6 xl:p-8 flex flex-col">
                                <div className="flex items-center justify-between gap-4 mb-4">
                                    <div>
                                        <h2 className="text-white text-sm font-black">合成预览</h2>
                                        <p className="text-[10px] text-zinc-600 font-bold mt-1">
                                            {isMagazineTemplate
                                                ? '按住预览画面左右拖动，拖过阈值后切换上一页或下一页'
                                                : isSpotlightTemplate
                                                    ? '三张小卡从下往上弹出，同排定位后合并成一张大卡'
                                                    : isPolymorphicFlipCardTemplate
                                                        ? '延用秀秀-破框焦点视窗3D能力，破框素材覆盖在焦点视窗上方'
                                                        : isJumpingFocalTemplate
                                                        ? '焦点视窗底层能力不变，1126 x 906 破框素材从第 0 秒开始播放'
                                                        : isRefreshUiBottomNavTemplate
                                                            ? '沿用秀秀-破框焦点视窗3D能力，破框素材覆盖在焦点视窗上方'
                                                        : isLinkedSuperVideoTemplate
                                                            ? '开屏 0-5s 正常播放，5-8s 缓动回缩，8s 后接焦点视窗视频'
                                                    : isBreakFocalTemplate
                                                        ? '套用美图秀秀焦点视窗底层能力，破框素材覆盖在焦点视窗上方'
                                                        : '8 个挂件组成一整块，从上方滑入并在 5s 内滑出画面'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {!isMagazineTemplate && !isSpotlightTemplate && !isBreakFocalTemplate && !isJumpingFocalTemplate && !isRefreshUiBottomNavTemplate && !isPolymorphicFlipCardTemplate && !isLinkedSuperVideoTemplate && <span className="text-[10px] text-zinc-500 font-bold mr-1">{interactionOptions.find((item) => item.id === interactionType)?.label}</span>}
                                        <button
                                            onClick={buildVideo}
                                            disabled={isGenerating}
                                            className="h-9 px-5 rounded-[14px] bg-white text-black text-[11px] font-black hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-[0_12px_36px_rgba(255,255,255,0.12)]"
                                        >
                                            <span className={`material-symbols-outlined text-[15px] ${isGenerating ? 'animate-spin' : ''}`}>{isGenerating ? 'sync' : 'bolt'}</span>
                                            {isGenerating ? '生成中' : '③生成视频'}
                                        </button>
                                        <a
                                            href={generatedVideoUrl || undefined}
                                            download={`${isMagazineTemplate ? 'magazine-flip' : isSpotlightTemplate ? 'spotlight-splash' : isPolymorphicFlipCardTemplate ? 'polymorphic-flip-card' : isLinkedSuperVideoTemplate ? 'linked-super-video-panorama' : isBreakFocalTemplate ? 'break-frame-focal-3d' : isJumpingFocalTemplate ? 'jumping-focal-window' : isRefreshUiBottomNavTemplate ? 'refresh-ui-bottom-nav' : 'dynamic-splash'}.mp4`}
                                            className={`h-9 px-4 rounded-[14px] text-[11px] font-black flex items-center justify-center gap-1.5 transition-all border ${generatedVideoUrl ? 'bg-white/[0.07] text-zinc-200 hover:bg-white/[0.12] border-white/10' : 'bg-white/[0.04] text-zinc-700 border-white/5 pointer-events-none'}`}
                                        >
                                            <span className="material-symbols-outlined text-base">download</span>
                                            下载
                                        </a>
                                    </div>
                                </div>

                                <div className="creative-preview-stage-wrap flex-1 flex items-center justify-center min-h-0 overflow-hidden">
                                    <div
                                        className={`creative-preview-stage relative rounded-[20px] overflow-hidden bg-zinc-950 border border-white/10 shadow-2xl group/preview ${hoveredPreviewVideoUrl ? 'creative-preview-stage--effect-video' : ''} ${isMagazineTemplate && magazineAssets.length > 1 ? (isMagazineDragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
                                        style={previewFrameStyle}
                                        onPointerDown={handleMagazinePointerDown}
                                        onPointerMove={handleMagazinePointerMove}
                                        onPointerUp={handleMagazinePointerUp}
                                        onPointerCancel={finishMagazineDrag}
                                        onPointerLeave={() => {
                                            if (isMagazineDragging) finishMagazineDrag();
                                        }}
                                    >
                                        {hoveredPreviewVideoUrl ? (
                                            <>
                                                <video
                                                    src={resolveApiAssetUrl(hoveredPreviewVideoUrl)}
                                                    className="absolute inset-0 w-full h-full object-contain bg-black"
                                                    autoPlay
                                                    loop
                                                    muted
                                                    playsInline
                                                />
                                                <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[10px] font-black text-white/85 backdrop-blur-md">
                                                    {hoveredPreviewTemplate?.name} 效果预览
                                                </div>
                                            </>
                                        ) : generatedVideoUrl ? (
                                            <>
                                                <video
                                                    ref={previewVideoRef}
                                                    src={generatedVideoUrl}
                                                    className="w-full h-full object-contain"
                                                    autoPlay={!shouldFreezeRefreshPreviewVideo}
                                                    loop={expandedTemplate !== 'dynamic-splash' && !shouldFreezeRefreshPreviewVideo}
                                                    muted
                                                    playsInline
                                                    preload={shouldFreezeRefreshPreviewVideo ? 'metadata' : undefined}
                                                    onLoadedData={shouldFreezeRefreshPreviewVideo ? freezeVideoOnFirstFrame : undefined}
                                                    onPlay={() => setIsPreviewPlaying(true)}
                                                    onPause={() => setIsPreviewPlaying(false)}
                                                />
                                                {!shouldFreezeRefreshPreviewVideo && (
                                                    <button
                                                        onClick={togglePreviewPlayback}
                                                        className="absolute inset-0 m-auto h-16 w-16 rounded-full bg-black/55 text-white backdrop-blur-md opacity-0 group-hover/preview:opacity-100 transition-all flex items-center justify-center border border-white/20 z-[120]"
                                                        aria-label={isPreviewPlaying ? '暂停视频' : '播放视频'}
                                                    >
                                                        <span className="material-symbols-outlined text-4xl">{isPreviewPlaying ? 'pause' : 'play_arrow'}</span>
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {isLinkedSuperVideoTemplate ? (
                                                    <div className="absolute inset-0 bg-zinc-950">
                                                        {linkedOpeningVideo.url ? (
                                                            <video
                                                                src={linkedOpeningVideo.url}
                                                                className="absolute inset-0 h-full w-full object-contain"
                                                                muted
                                                                loop
                                                                playsInline
                                                                autoPlay
                                                            />
                                                        ) : linkedFocalVideo.url ? (
                                                            <video
                                                                src={linkedFocalVideo.url}
                                                                className="absolute left-0 top-0 w-full object-contain"
                                                                style={{ height: `${(BREAK_FOCAL_H / BREAK_CANVAS_H) * 100}%` }}
                                                                muted
                                                                loop
                                                                playsInline
                                                                autoPlay
                                                            />
                                                        ) : (
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700">
                                                                <span className="material-symbols-outlined text-6xl">linked_services</span>
                                                                <span className="mt-3 text-[10px] font-black tracking-normal text-left">Linked Super Video</span>
                                                            </div>
                                                        )}
                                                        <div className="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1 text-[10px] font-black text-white backdrop-blur-md">
                                                            {linkedOpeningVideo.url ? '开屏视频预览' : linkedFocalVideo.url ? '焦点视窗预览' : '联动超视频'}
                                                        </div>
                                                    </div>
                                                ) : isMagazineTemplate ? (
                                                    magazineAssets.length ? (
                                                        magazineAssets.map((item, index) => (
                                                            item.type === 'video' ? (
                                                                <video
                                                                    key={item.id}
                                                                    src={item.url}
                                                                    className="absolute inset-0 w-full h-full object-contain bg-black"
                                                                    style={getMagazinePreviewStyle(index)}
                                                                    muted
                                                                    loop
                                                                    playsInline
                                                                    autoPlay
                                                                />
                                                            ) : (
                                                                <img
                                                                    key={item.id}
                                                                    src={item.url}
                                                                    alt={`翻页预览 ${index + 1}`}
                                                                    className="absolute inset-0 w-full h-full object-cover"
                                                                    style={getMagazinePreviewStyle(index)}
                                                                />
                                                            )
                                                        ))
                                                    ) : (
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700">
                                                            <span className="material-symbols-outlined text-6xl">auto_stories</span>
                                                            <span className="mt-3 text-[10px] font-black tracking-normal text-left">3-5 Assets / Drag Slide</span>
                                                        </div>
                                                    )
                                                ) : isSpotlightTemplate ? (
                                                    <>
                                                        {spotlightSplash.url ? (
                                                            spotlightSplash.file?.type.startsWith('video/') ? (
                                                                <video src={spotlightSplash.url} className="absolute inset-0 w-full h-full object-contain bg-black" muted loop playsInline autoPlay />
                                                            ) : (
                                                                <img src={spotlightSplash.url} alt="聚光开屏预览" className="absolute inset-0 w-full h-full object-cover" />
                                                            )
                                                        ) : (
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700">
                                                                <span className="material-symbols-outlined text-6xl">highlight</span>
                                                                <span className="mt-3 text-[10px] font-black tracking-normal text-left">Spotlight Splash</span>
                                                            </div>
                                                        )}
                                                        {spotlightSmallCards.map((item, index) => (
                                                            <img
                                                                key={item.id}
                                                                src={item.url}
                                                                alt={`小卡预览 ${index + 1}`}
                                                                className="absolute object-cover rounded-[2px] drop-shadow-2xl"
                                                                style={getSpotlightSmallPreviewStyle(index)}
                                                            />
                                                        ))}
                                                        {spotlightLargeCard.url && (
                                                            <img
                                                                src={spotlightLargeCard.url}
                                                                alt="大卡预览"
                                                                className="absolute object-cover rounded-[2px] drop-shadow-2xl"
                                                                style={spotlightLargePreviewStyle()}
                                                            />
                                                        )}
                                                        {spotlightInteractionAssetPath && (
                                                            <img
                                                                src={resolveApiAssetUrl(spotlightInteractionAssetPath)}
                                                                alt="聚光开屏交互形式"
                                                                className="absolute inset-0 z-20 h-full w-full object-fill pointer-events-none"
                                                            />
                                                        )}
                                                    </>
                                                ) : isPolymorphicFlipCardTemplate ? (
                                                    <>
                                                        <div className="absolute inset-0 bg-white" />
                                                        <div
                                                            className="absolute z-0 overflow-hidden rounded-[8px] border border-white/10 bg-black/35 shadow-2xl"
                                                            style={{
                                                                left: 0,
                                                                top: `${(BREAK_FOCAL_Y / BREAK_CANVAS_H) * 100}%`,
                                                                width: '100%',
                                                                height: `${(BREAK_FOCAL_H / BREAK_CANVAS_H) * 100}%`,
                                                            }}
                                                        >
                                                            {polyBase.url ? (
                                                                <img src={polyBase.url} alt="多态翻卡底图预览" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                                                    <span className="material-symbols-outlined text-4xl">crop_16_9</span>
                                                                </div>
                                                            )}
                                                            {polyCarouselSlots.map(({ item, frame, offset }) => (
                                                                <img
                                                                    key={`${item.id}-${offset}`}
                                                                    src={item.url}
                                                                    alt="多态翻卡预览"
                                                                    className="absolute object-cover rounded-[14px] shadow-2xl"
                                                                    style={getPolyCardPreviewStyle(frame)}
                                                                />
                                                            ))}
                                                            {isPolyFinalPhase && polyCards[3] && (
                                                                <div
                                                                    className="absolute overflow-hidden bg-black shadow-2xl"
                                                                    style={getPolyFinalPreviewStyle()}
                                                                >
                                                                    <img
                                                                        src={polyCards[3].url}
                                                                        alt="第4张翻卡正面"
                                                                        className="absolute inset-0 h-full w-full object-cover"
                                                                        style={{ backfaceVisibility: 'hidden' }}
                                                                    />
                                                                    <div
                                                                        className="absolute inset-0"
                                                                        style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
                                                                    >
                                                                        {polyFocal.url ? (
                                                                            polyFocal.file?.type.startsWith('video/') ? (
                                                                                <video src={polyFocal.url} className="h-full w-full object-contain bg-black" muted loop playsInline autoPlay />
                                                                            ) : (
                                                                                <img src={polyFocal.url} alt="焦点视窗翻转内容" className="h-full w-full object-cover" />
                                                                            )
                                                                        ) : (
                                                                            <div className="h-full w-full flex items-center justify-center bg-zinc-950 text-emerald-200">
                                                                                <span className="text-[10px] font-black tracking-normal text-left">1126 x 900 / FOCAL</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {!polyCards.length && (
                                                                <div
                                                                    className="absolute border border-dashed border-emerald-300/70 bg-emerald-300/5 flex items-center justify-center"
                                                                    style={{
                                                                        left: `${(POLY_CARD_X / BREAK_FOCAL_W) * 100}%`,
                                                                        top: `${(POLY_CARD_Y / BREAK_FOCAL_H) * 100}%`,
                                                                        width: `${(POLY_CARD_W / BREAK_FOCAL_W) * 100}%`,
                                                                        height: `${(POLY_CARD_H / BREAK_FOCAL_H) * 100}%`,
                                                                    }}
                                                                >
                                                                    <span className="text-[9px] font-black text-emerald-200 tracking-normal text-left">840 x 360 / CARD</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="absolute inset-0 z-10 pointer-events-none">
                                                            <img src="/focal-window/fixed_bg_2.png" className="absolute inset-0 z-[10] w-full h-full object-fill" alt="" />
                                                            <div
                                                                className="absolute left-0 right-0 z-[20]"
                                                                style={{
                                                                    top: `${(750 / BREAK_CANVAS_H) * 100}%`,
                                                                    height: `${(500 / BREAK_CANVAS_H) * 100}%`,
                                                                    backgroundColor: breakGradientColor,
                                                                    maskImage: 'linear-gradient(to bottom, transparent 0%, white 10%, white 30%, transparent 100%)',
                                                                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, white 10%, white 30%, transparent 100%)',
                                                                }}
                                                            />
                                                            <div
                                                                className="absolute inset-0 z-[30]"
                                                                style={{
                                                                    backgroundColor: breakIconColor,
                                                                    maskImage: 'url(/focal-window/icon_bg.png)',
                                                                    WebkitMaskImage: 'url(/focal-window/icon_bg.png)',
                                                                    maskSize: '100% 100%',
                                                                }}
                                                            />
                                                            <img src="/focal-window/fixed_bg_1.png" className="absolute inset-0 z-[40] w-full h-full object-fill" alt="" />
                                                        </div>
                                                    </>
                                                ) : isRefreshUiBottomNavTemplate ? (
                                                    <>
                                                        <div className="absolute inset-0 bg-white" />
                                                        <div className="absolute inset-0 pointer-events-none">
                                                            <div
                                                                className="absolute z-[5] overflow-hidden bg-black/35"
                                                                style={{
                                                                    left: 0,
                                                                    top: `${(BREAK_FOCAL_Y / BREAK_CANVAS_H) * 100}%`,
                                                                    width: '100%',
                                                                    height: `${(BREAK_FOCAL_H / BREAK_CANVAS_H) * 100}%`,
                                                                }}
                                                            >
                                                                {breakFocal.url ? (
                                                                    breakFocal.file?.type.startsWith('video/') ? (
                                                                        <video src={breakFocal.url} className="w-full h-full object-contain bg-black" muted playsInline preload="metadata" onLoadedData={freezeVideoOnFirstFrame} />
                                                                    ) : (
                                                                        <img src={breakFocal.url} alt="焦点视窗预览" className="w-full h-full object-cover" />
                                                                    )
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                                                        <span className="material-symbols-outlined text-4xl">crop_16_9</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <img src="/focal-window/fixed_bg_2.png" className="absolute inset-0 z-[10] w-full h-full object-fill" alt="" />
                                                            <img src="/focal-window/gradient_layer.png" className="absolute inset-0 z-[20] w-full h-full object-fill" alt="" />
                                                            {refreshIconSheet.url && (
                                                                <div className="absolute z-[25] overflow-hidden shadow-2xl" style={getRefreshIconLayerPreviewStyle()}>
                                                                    {refreshIconSheet.file?.type.startsWith('video/') ? (
                                                                        <video src={refreshIconSheet.url} className="h-full w-full object-fill" muted playsInline preload="metadata" onLoadedData={freezeVideoOnFirstFrame} />
                                                                    ) : (
                                                                        <img src={refreshIconSheet.url} alt="icon 底图联合遮罩预览" className="h-full w-full object-fill" />
                                                                    )}
                                                                </div>
                                                            )}
                                                            <img src="/focal-window/fixed_bg_1.png" className="absolute inset-0 z-[30] w-full h-full object-fill" alt="" />
                                                            {SHOW_REFRESH_BOTTOM_NAV_UPLOAD && (
                                                                <div className="absolute inset-0 z-[40]">
                                                                    {refreshBottomNav.url ? (
                                                                        refreshBottomNav.file?.type.startsWith('video/') ? (
                                                                            <video
                                                                                src={refreshBottomNav.url}
                                                                                className="absolute left-0 bottom-0 w-full object-contain bg-black"
                                                                                style={{ height: `${(REFRESH_BOTTOM_NAV_H / BREAK_CANVAS_H) * 100}%` }}
                                                                                muted
                                                                                playsInline
                                                                                preload="metadata"
                                                                                onLoadedData={freezeVideoOnFirstFrame}
                                                                            />
                                                                        ) : (
                                                                            <img
                                                                                src={refreshBottomNav.url}
                                                                                alt="底导素材预览"
                                                                                className="absolute left-0 bottom-0 w-full object-cover"
                                                                                style={{ height: `${(REFRESH_BOTTOM_NAV_H / BREAK_CANVAS_H) * 100}%` }}
                                                                            />
                                                                        )
                                                                    ) : (
                                                                        <div
                                                                            className="absolute left-0 bottom-0 w-full border border-dashed border-emerald-300/70 bg-emerald-300/5 flex items-center justify-center"
                                                                            style={{ height: `${(REFRESH_BOTTOM_NAV_H / BREAK_CANVAS_H) * 100}%` }}
                                                                        >
                                                                            <span className="text-[9px] font-black text-emerald-200 tracking-normal text-left">1126 x 252 / BOTTOM NAV</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                ) : isBreakFocalTemplate ? (
                                                    <>
                                                        <div className="absolute inset-0 bg-white" />
                                                        <div
                                                            className="absolute overflow-hidden rounded-[8px] border border-white/10 bg-black/35 shadow-2xl"
                                                            style={{
                                                                left: 0,
                                                                top: `${(BREAK_FOCAL_Y / BREAK_CANVAS_H) * 100}%`,
                                                                width: '100%',
                                                                height: `${(BREAK_FOCAL_H / BREAK_CANVAS_H) * 100}%`,
                                                            }}
                                                        >
                                                            {activeBreakFocal.url ? (
                                                                activeBreakFocal.file?.type.startsWith('video/') ? (
                                                                    <video
                                                                        ref={breakFocalPreviewVideoRef}
                                                                        src={activeBreakFocal.url}
                                                                        className="w-full h-full object-contain bg-black"
                                                                        muted
                                                                        loop
                                                                        playsInline
                                                                        autoPlay
                                                                        onLoadedMetadata={(event) => {
                                                                            event.currentTarget.play().catch(() => undefined);
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <img src={activeBreakFocal.url} alt="焦点视窗预览" className="w-full h-full object-cover" />
                                                                )
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                                                    <span className="material-symbols-outlined text-4xl">crop_16_9</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="absolute inset-0 pointer-events-none">
                                                            <img src="/focal-window/fixed_bg_2.png" className="absolute inset-0 z-[10] w-full h-full object-fill" alt="" />
                                                            <div
                                                                className="absolute left-0 right-0 z-[20]"
                                                                style={{
                                                                    top: `${(750 / BREAK_CANVAS_H) * 100}%`,
                                                                    height: `${(500 / BREAK_CANVAS_H) * 100}%`,
                                                                    backgroundColor: activeBreakGradientColor,
                                                                    maskImage: 'linear-gradient(to bottom, transparent 0%, white 10%, white 30%, transparent 100%)',
                                                                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, white 10%, white 30%, transparent 100%)',
                                                                }}
                                                            />
                                                            <div
                                                                className="absolute inset-0 z-[30]"
                                                                style={{
                                                                    backgroundColor: activeBreakIconColor,
                                                                    maskImage: 'url(/focal-window/icon_bg.png)',
                                                                    WebkitMaskImage: 'url(/focal-window/icon_bg.png)',
                                                                    maskSize: '100% 100%',
                                                                }}
                                                            />
                                                            <img src="/focal-window/fixed_bg_1.png" className="absolute inset-0 z-[40] w-full h-full object-fill" alt="" />
                                                        </div>
                                                        <div
                                                            className="absolute pointer-events-none z-[80]"
                                                            style={{
                                                                left: 0,
                                                                top: `${(BREAK_FRAME_Y / BREAK_CANVAS_H) * 100}%`,
                                                                width: '100%',
                                                                height: `${((isJumpingFocalTemplate ? JUMPING_FRAME_H : BREAK_FRAME_H) / BREAK_CANVAS_H) * 100}%`,
                                                                opacity: breakFramePreviewStarted ? 1 : 0,
                                                                transform: breakFramePreviewStarted ? 'translateY(0)' : `translateY(${isJumpingFocalTemplate ? 0 : 18}px)`,
                                                                transition: 'opacity 0.35s ease-out, transform 0.35s ease-out',
                                                            }}
                                                        >
                                                            {activeBreakFrameAsset.url && breakFramePreviewStarted ? (
                                                                activeBreakFrameAsset.file?.type.startsWith('video/') ? (
                                                                    <video
                                                                        key={`${activeBreakFrameAsset.url}-${breakPreviewPhase}-${isJumpingFocalTemplate ? 0 : breakFirstTriggerSecond}-${breakSecondTriggerSecond}`}
                                                                        ref={breakFramePreviewVideoRef}
                                                                        src={activeBreakFrameAsset.url}
                                                                        className="w-full h-full object-fill drop-shadow-2xl"
                                                                        muted
                                                                        loop
                                                                        playsInline
                                                                        autoPlay
                                                                        onLoadedMetadata={(event) => {
                                                                            event.currentTarget.currentTime = breakPreviewPhase === 1 ? 1.5 : 0;
                                                                            event.currentTarget.play().catch(() => undefined);
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <img src={activeBreakFrameAsset.url} alt="破框素材预览" className="w-full h-full object-fill drop-shadow-2xl" />
                                                                )
                                                            ) : !activeBreakFrameAsset.url ? (
                                                                <div className="w-full h-full border border-dashed border-fuchsia-300/60 bg-fuchsia-300/5 flex items-center justify-center">
                                                                    <span className="text-[9px] font-black text-fuchsia-200 tracking-normal text-left">{isJumpingFocalTemplate ? '1126 x 906 / TRANSPARENT' : '1126 x 1890 / TRANSPARENT'}</span>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </>
                                                ) : isJumpingFocalTemplate || isRefreshUiBottomNavTemplate ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700">
                                                        <span className="material-symbols-outlined text-6xl">{isJumpingFocalTemplate ? 'motion_photos_auto' : 'auto_awesome_mosaic'}</span>
                                                        <span className="mt-3 text-[10px] font-black tracking-normal text-left">{isJumpingFocalTemplate ? 'Jumping Focal Window' : 'Refresh UI'}</span>
                                                    </div>
                                                ) : splash.url ? (
                                                    splash.file?.type.startsWith('video/') ? (
                                                        <video
                                                            ref={previewVideoRef}
                                                            src={splash.url}
                                                            className="absolute inset-0 w-full h-full object-contain"
                                                            muted
                                                            playsInline
                                                            autoPlay
                                                            onPlay={() => setIsPreviewPlaying(true)}
                                                            onPause={() => setIsPreviewPlaying(false)}
                                                        />
                                                    ) : (
                                                        <img src={splash.url} alt="开屏预览" className="absolute inset-0 w-full h-full object-cover" />
                                                    )
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                                                        <span className="material-symbols-outlined text-6xl">movie</span>
                                                    </div>
                                                )}
                                                {!isMagazineTemplate && !isSpotlightTemplate && !isBreakFocalTemplate && !isJumpingFocalTemplate && !isRefreshUiBottomNavTemplate && !isPolymorphicFlipCardTemplate && asset.url && (
                                                    <div
                                                        className="absolute inset-0 animate-pendant-group-drop pointer-events-none"
                                                        style={{
                                                            ...getPendantGroupPreviewStyle(),
                                                            animationPlayState: isPreviewPlaying ? 'running' : 'paused',
                                                        }}
                                                    >
                                                        {getPendantSeeds().slice(0, pendantMotionNotes.maxItems).map((seed, index) => (
                                                            <img
                                                                key={`pendant-group-${index}`}
                                                                src={asset.url}
                                                                alt="挂件预览"
                                                                style={getPendantPreviewStyle(seed)}
                                                                className="absolute object-contain drop-shadow-2xl"
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                                {isMagazineTemplate && magazineAssets.length > 0 && (
                                                    <div className="absolute right-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[10px] font-black text-white/80 backdrop-blur-md">
                                                        {magazineCurrentIndex + 1} / {magazineAssets.length}
                                                    </div>
                                                )}
                                                <div className="absolute inset-x-0 bottom-8 text-center">
                                                    <span className="text-[8px] font-black text-white/50 tracking-normal text-left">1440 x 2340 / FINAL VIDEO</span>
                                                </div>
                                                {!isMagazineTemplate && !isSpotlightTemplate && !isBreakFocalTemplate && !isJumpingFocalTemplate && !isRefreshUiBottomNavTemplate && !isPolymorphicFlipCardTemplate && splash.file?.type.startsWith('video/') && (
                                                    <button
                                                        onClick={togglePreviewPlayback}
                                                        className="absolute inset-0 m-auto h-16 w-16 rounded-full bg-black/55 text-white backdrop-blur-md opacity-0 group-hover/preview:opacity-100 transition-all flex items-center justify-center border border-white/20 z-[120]"
                                                        aria-label={isPreviewPlaying ? '暂停视频' : '播放视频'}
                                                    >
                                                        <span className="material-symbols-outlined text-4xl">{isPreviewPlaying ? 'pause' : 'play_arrow'}</span>
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        {isDynamicSplashTemplate && !hoveredPreviewVideoUrl && activeDynamicSplashMask && (
                                            <img
                                                src={activeDynamicSplashMask}
                                                alt="气泡滑动平台遮罩"
                                                className="absolute inset-0 z-[90] h-full w-full object-contain pointer-events-none"
                                            />
                                        )}
                                        {cropAreaEnabled && !hoveredPreviewVideoUrl && (
                                            <div
                                                className="absolute left-[10%] right-[10%] top-[12%] bottom-[16%] z-[100] border border-dashed border-emerald-300/80 bg-emerald-300/5 pointer-events-none"
                                            >
                                                <span className="absolute left-2 top-2 text-[8px] font-black text-emerald-200 tracking-normal text-left">裁剪安全区</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {!isLinkedSuperVideoTemplate && (
                                <div className={`creative-preview-controls mt-4 grid gap-3 shrink-0 ${isBreakFocalTemplate ? 'grid-cols-1' : 'grid-cols-1 2xl:grid-cols-3'}`}>
                                    {!isBreakFocalTemplate && (
                                        <div className="rounded-[16px] border border-white/5 bg-black/20 p-3 space-y-2">
                                            <p className="text-[10px] font-black text-zinc-500 tracking-normal text-left">交互形式</p>
                                            {isMagazineTemplate ? (
                                                <div className="h-9 rounded-[12px] bg-white text-black text-[11px] font-black flex items-center justify-center">
                                                    鼠标拖动滑动
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-3 gap-2">
                                                    {interactionOptions.map((item) => (
                                                        <button
                                                            key={item.id}
                                                            onClick={() => setInteractionType(item.id)}
                                                            className={`h-9 rounded-[12px] text-[11px] font-bold transition-all ${interactionType === item.id ? 'bg-white text-black' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                                                        >
                                                            {item.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="rounded-[16px] border border-white/5 bg-black/20 p-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-black text-zinc-500 tracking-normal text-left">裁剪区域</p>
                                        </div>
                                        <button
                                            onClick={() => setCropAreaEnabled((current) => !current)}
                                            className={`h-6 w-11 rounded-full p-1 transition-all ${cropAreaEnabled ? 'bg-emerald-400/80' : 'bg-white/10'}`}
                                        >
                                            <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${cropAreaEnabled ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>

                                    {!isBreakFocalTemplate && (
                                        <div className="rounded-[16px] border border-white/5 bg-black/20 p-3 space-y-2">
                                            <p className="text-[10px] font-black text-zinc-500 tracking-normal text-left">平台选择</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                {platformOptions.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => selectPlatform(item.id)}
                                                        className={`h-11 rounded-[14px] text-[10px] font-black transition-all flex items-center justify-center border ${selectedPlatforms.includes(item.id) ? 'bg-primary/15 border-primary/60 shadow-[0_0_18px_rgba(99,102,241,0.24)]' : 'bg-white/5 border-transparent text-zinc-500 hover:bg-white/10'}`}
                                                        title={item.label}
                                                    >
                                                        <img src={item.icon} alt={item.label} className="h-6 w-6 rounded-[6px] object-contain" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                )}
                            </section>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default ConfigWorkspace;
