import React, { useEffect, useRef, useState } from 'react';
import { CreativeTemplateItem, CreativeTemplateSettings, getCreativeSettings, getCreativeTemplates } from '../services/api';
import { extractSmartPalette } from '../utils/smartColor';

type UploadStatus = 'idle' | 'valid' | 'adapted' | 'invalid';

interface UploadState {
    file: File | null;
    url: string | null;
    status: UploadStatus;
    message: string;
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

const emptyUpload: UploadState = {
    file: null,
    url: null,
    status: 'idle',
    message: '等待上传',
};

const defaultCreativeSettings: CreativeTemplateSettings = {
    interactionType: 'bubble-slide',
    cropAreaEnabled: true,
    platforms: ['xiuxiu', 'meiyan', 'wink'],
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

const defaultCreativeCategories = [
    {
        id: 'splash',
        label: '开屏创意模版',
        icon: 'wb_sunny',
        templates: [
            { id: 'dynamic-splash', label: '炫动开屏' },
            { id: 'magazine-flip', label: '杂志翻页' },
            { id: 'slide-splash', label: '聚光开屏' },
            { id: 'twist-splash', label: '扭转开屏' },
        ],
    },
    {
        id: 'home',
        label: '首页创意模版',
        icon: 'home_app_logo',
        templates: [
            { id: 'break-frame-focal-3d', label: '破框焦点视窗3D' },
        ],
    },
];

const categoryIcons: Record<string, string> = {
    splash: 'wb_sunny',
    home: 'home_app_logo',
};

const buildCreativeCategories = (templates: CreativeTemplateItem[]) => {
    const enabledTemplates = templates.filter((item) => item.enabled !== false);
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
const BREAK_FOCAL_W = 1126;
const BREAK_FOCAL_H = 900;
const BREAK_CANVAS_W = 1126;
const BREAK_CANVAS_H = 2436;
const BREAK_FOCAL_Y = 0;
const BREAK_FRAME_Y = 0;
const BREAK_DURATION = 5000;
const BREAK_AI_FIXED_PROMPT = '第一破框：\n第二次破框：\n每一破框只能维持1.5s';
const defaultBreakColorSchemes = [
    { id: 'aurora', label: '极光蓝紫', iconColor: '#6C63FF', gradientColor: '#35D5FF' },
    { id: 'pop', label: '活力粉橙', iconColor: '#FF3D8B', gradientColor: '#FFB13B' },
    { id: 'fresh', label: '清透绿青', iconColor: '#13C8A8', gradientColor: '#7CFFCB' },
];

const isPngFile = (file: File) => file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');

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
        width: `${(PENDANT_SIZE / CANVAS_W) * 100 * seed.scale}%`,
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

const loadVideoElement = async (url: string): Promise<HTMLVideoElement> => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('视频素材加载失败'));
    });
    await video.play().catch(() => undefined);
    return video;
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

const easeOutCubic = (value: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3);
const easeInOutCubic = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const getSpotlightSmallFrame = (index: number, elapsed: number) => {
    const availableW = CANVAS_W - SPOTLIGHT_SIDE_MARGIN * 2;
    const gap = (availableW - SPOTLIGHT_SMALL_W * 3) / 2;
    const targetX = SPOTLIGHT_SIDE_MARGIN + index * (SPOTLIGHT_SMALL_W + gap);
    const targetY = CANVAS_H - SPOTLIGHT_BOTTOM_MARGIN - SPOTLIGHT_SMALL_H;
    const enterStart = index * 260;
    const enterProgress = easeOutCubic((elapsed - enterStart) / 900);
    const mergeProgress = easeInOutCubic((elapsed - 2800) / 1200);
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
    const progress = easeOutCubic((elapsed - 3600) / 700);
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
    const splashInputRef = useRef<HTMLInputElement>(null);
    const magazineInputRef = useRef<HTMLInputElement>(null);
    const spotlightSmallInputRef = useRef<HTMLInputElement>(null);
    const spotlightLargeInputRef = useRef<HTMLInputElement>(null);
    const spotlightSplashInputRef = useRef<HTMLInputElement>(null);
    const breakFrameInputRef = useRef<HTMLInputElement>(null);
    const breakSplashInputRef = useRef<HTMLInputElement>(null);
    const breakFocalInputRef = useRef<HTMLInputElement>(null);
    const [expandedCategory, setExpandedCategory] = useState<string | null>('splash');
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>('dynamic-splash');
    const [categories, setCategories] = useState(defaultCreativeCategories);
    const [asset, setAsset] = useState<UploadState>(emptyUpload);
    const [splash, setSplash] = useState<UploadState>(emptyUpload);
    const [magazineAssets, setMagazineAssets] = useState<MagazineAsset[]>([]);
    const [magazinePreviewElapsed, setMagazinePreviewElapsed] = useState(0);
    const [spotlightSmallCards, setSpotlightSmallCards] = useState<SpotlightCardAsset[]>([]);
    const [spotlightLargeCard, setSpotlightLargeCard] = useState<UploadState>(emptyUpload);
    const [spotlightSplash, setSpotlightSplash] = useState<UploadState>(emptyUpload);
    const [spotlightPreviewElapsed, setSpotlightPreviewElapsed] = useState(0);
    const [breakFrameAsset, setBreakFrameAsset] = useState<UploadState>(emptyUpload);
    const [breakSplash, setBreakSplash] = useState<UploadState>(emptyUpload);
    const [breakFocal, setBreakFocal] = useState<UploadState>(emptyUpload);
    const [breakPrompt, setBreakPrompt] = useState('');
    const [breakIconColor, setBreakIconColor] = useState('#7C5CFF');
    const [breakGradientColor, setBreakGradientColor] = useState('#7C5CFF');
    const [breakFrameStartSecond, setBreakFrameStartSecond] = useState(3);
    const [prompt, setPrompt] = useState('');
    const [interactionType, setInteractionType] = useState<CreativeTemplateSettings['interactionType']>(defaultCreativeSettings.interactionType);
    const [cropAreaEnabled, setCropAreaEnabled] = useState(defaultCreativeSettings.cropAreaEnabled);
    const [selectedPlatforms, setSelectedPlatforms] = useState<CreativeTemplateSettings['platforms']>(defaultCreativeSettings.platforms);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);
    const [saveMessage, setSaveMessage] = useState('');
    const [dragTarget, setDragTarget] = useState<'asset' | 'splash' | 'magazine' | 'spotlight-small' | 'spotlight-large' | 'spotlight-splash' | 'break-frame' | 'break-splash' | 'break-focal' | null>(null);
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
    const [generatedVideoType, setGeneratedVideoType] = useState('video/webm');
    const [error, setError] = useState('');
    const previewVideoRef = useRef<HTMLVideoElement>(null);
    const breakFocalPreviewVideoRef = useRef<HTMLVideoElement>(null);
    const breakFramePreviewVideoRef = useRef<HTMLVideoElement>(null);
    const [breakPreviewElapsed, setBreakPreviewElapsed] = useState(0);

    useEffect(() => {
        let mounted = true;
        Promise.all([getCreativeSettings(), getCreativeTemplates()])
            .then(([settings, templateList]) => {
                if (!mounted) return;
                const creative = settings.creativeTemplateSettings || defaultCreativeSettings;
                setInteractionType(creative.interactionType || defaultCreativeSettings.interactionType);
                setCropAreaEnabled(creative.cropAreaEnabled ?? defaultCreativeSettings.cropAreaEnabled);
                setSelectedPlatforms(creative.platforms?.length ? creative.platforms : defaultCreativeSettings.platforms);
                setCategories(buildCreativeCategories(templateList));
            })
            .catch(() => {
                if (mounted) setSaveMessage('后台模版配置读取失败，已使用默认配置');
            });

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (expandedTemplate !== 'magazine-flip' || magazineAssets.length <= 1) {
            setMagazinePreviewElapsed(0);
            return undefined;
        }

        const startedAt = performance.now();
        let frameId = 0;
        const tick = (now: number) => {
            setMagazinePreviewElapsed((now - startedAt) % (magazineAssets.length * MAGAZINE_FRAME_MS));
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
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
        if (expandedTemplate !== 'break-frame-focal-3d' || generatedVideoUrl) {
            setBreakPreviewElapsed(0);
            return undefined;
        }

        const startedAt = performance.now();
        const triggerSecond = Math.max(3, Math.round(breakFrameStartSecond));
        const triggerMs = triggerSecond * 1000;
        const loopDuration = Math.max(BREAK_DURATION, (triggerSecond + 2) * 1000);
        let frameId = 0;
        const tick = (now: number) => {
            const focalVideo = breakFocalPreviewVideoRef.current;
            const focalDuration = focalVideo && Number.isFinite(focalVideo.duration) ? focalVideo.duration * 1000 : 0;
            if (focalVideo && !focalVideo.paused && focalDuration >= triggerMs + 350) {
                setBreakPreviewElapsed(focalVideo.currentTime * 1000);
            } else {
                setBreakPreviewElapsed((now - startedAt) % loopDuration);
            }
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [expandedTemplate, generatedVideoUrl, breakFocal.url, breakFrameStartSecond]);

    const togglePlatform = (platform: CreativeTemplateSettings['platforms'][number]) => {
        setSelectedPlatforms((current) => {
            if (current.includes(platform)) {
                return current.length === 1 ? current : current.filter((item) => item !== platform);
            }
            return [...current, platform];
        });
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

    const handleTemplateSelect = (templateId: string) => {
        if (templateId === expandedTemplate) return;
        resetOutput();
        setError('');
        setIsPreviewPlaying(true);
        setExpandedTemplate(templateId);
    };

    const resetOutput = () => {
        if (generatedVideoUrl) URL.revokeObjectURL(generatedVideoUrl);
        setGeneratedVideoUrl(null);
    };

    const updateAsset = async (file: File) => {
        setError('');
        resetOutput();
        if (file.type !== 'image/png') {
            setAsset({ file: null, url: null, status: 'invalid', message: '挂件素材仅支持 PNG' });
            return;
        }

        try {
            const size = await getImageSize(file);
            const url = URL.createObjectURL(file);
            const isValid = size.width === 450 && size.height === 450;
            setAsset({
                file,
                url,
                status: isValid ? 'valid' : 'invalid',
                message: isValid ? 'PNG 450 x 450，符合 MR 标准' : `当前 ${size.width} x ${size.height}，需上传 450 x 450 PNG`,
            });
        } catch (err) {
            setAsset({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '图片读取失败' });
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

    const updateBreakFrameAsset = async (file: File) => {
        setError('');
        resetOutput();
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            setBreakFrameAsset({ file: null, url: null, status: 'invalid', message: '破框素材支持图片或透明底视频' });
            return;
        }

        const url = URL.createObjectURL(file);
        try {
            if (file.type.startsWith('image/')) {
                const size = await getImageSize(file);
                const isValid = size.width === BREAK_FRAME_W && size.height === BREAK_FRAME_H;
                setBreakFrameAsset({
                    file,
                    url,
                    status: isValid ? 'valid' : 'adapted',
                    message: isValid ? '1126 x 1890，透明底容器' : `当前 ${size.width} x ${size.height}，生成时放入 1126 x 1890 透明底容器`,
                });
                return;
            }

            const meta = await getVideoMeta(file);
            if (meta.duration > 5) {
                URL.revokeObjectURL(url);
                setBreakFrameAsset({ file: null, url: null, status: 'invalid', message: `视频时长 ${meta.duration.toFixed(1)}s，需 5s 内` });
                return;
            }
            setBreakFrameAsset({
                file,
                url,
                status: meta.width === BREAK_FRAME_W && meta.height === BREAK_FRAME_H ? 'valid' : 'adapted',
                message: meta.width === BREAK_FRAME_W && meta.height === BREAK_FRAME_H ? `透明底视频 ${meta.duration.toFixed(1)}s` : `视频 ${meta.width} x ${meta.height}，生成时放入 1126 x 1890 容器`,
            });
        } catch (err) {
            URL.revokeObjectURL(url);
            setBreakFrameAsset({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '破框素材读取失败' });
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
        try {
            if (file.type.startsWith('image/')) {
                const size = await getImageSize(file);
                const isValid = size.width === BREAK_FOCAL_W && size.height === BREAK_FOCAL_H;
                setBreakFocal({
                    file,
                    url,
                    status: isValid ? 'valid' : 'adapted',
                    message: isValid ? '焦点视窗 1126 x 900' : `当前 ${size.width} x ${size.height}，生成时 AI 适配至 1126 x 900`,
                });
                await updateBreakColorSchemesFromSource(url, 'image');
                return;
            }
            if (file.type.startsWith('video/')) {
                const meta = await getVideoMeta(file);
                setBreakFocal({
                    file,
                    url,
                    status: meta.width === BREAK_FOCAL_W && meta.height === BREAK_FOCAL_H ? 'valid' : 'adapted',
                    message: meta.width === BREAK_FOCAL_W && meta.height === BREAK_FOCAL_H ? `焦点视频 ${meta.duration.toFixed(1)}s` : `视频 ${meta.width} x ${meta.height}，生成时 AI 适配`,
                });
                await updateBreakColorSchemesFromSource(url, 'video');
                return;
            }
            URL.revokeObjectURL(url);
            setBreakFocal({ file: null, url: null, status: 'invalid', message: '焦点视窗素材仅支持图片或视频' });
        } catch (err) {
            URL.revokeObjectURL(url);
            setBreakFocal({ file: null, url: null, status: 'invalid', message: err instanceof Error ? err.message : '焦点视窗读取失败' });
        }
    };

    const updateBreakColorSchemesFromSource = async (sourceUrl: string, type: 'image' | 'video') => {
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
                setBreakIconColor(nextSchemes[0].iconColor);
                setBreakGradientColor(nextSchemes[0].gradientColor);
            }
        } catch (err) {
            console.warn('破框焦点视窗智能配色失败', err);
            setBreakIconColor(defaultBreakColorSchemes[0].iconColor);
            setBreakGradientColor(defaultBreakColorSchemes[0].gradientColor);
        }
    };

    const generateBreakFrameByPrompt = async () => {
        const text = breakPrompt.trim() || '用户补充想法';
        const fullPrompt = `${BREAK_AI_FIXED_PROMPT}\n${text}`;
        const canvas = document.createElement('canvas');
        canvas.width = BREAK_FRAME_W;
        canvas.height = BREAK_FRAME_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建破框视频');

        const mimeType = [
            'video/webm;codecs=vp9',
            'video/webm',
        ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
        const stream = canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : { videoBitsPerSecond: 4_000_000 });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
        };
        const done = new Promise<Blob>((resolve) => {
            recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
        });
        const startedAt = performance.now();
        const duration = 3000;
        recorder.start();

        const drawAiFrame = (now: number) => {
            const elapsed = Math.min(now - startedAt, duration);
            const phase = elapsed < 1500 ? 0 : 1;
            const phaseProgress = ((elapsed % 1500) / 1500);
            ctx.clearRect(0, 0, BREAK_FRAME_W, BREAK_FRAME_H);
            ctx.save();
            ctx.translate(BREAK_FRAME_W / 2, BREAK_FRAME_H / 2);
            const pulse = 1 + Math.sin(phaseProgress * Math.PI) * 0.06;
            ctx.scale(pulse, pulse);
            ctx.rotate((phase === 0 ? -1 : 1) * 0.08 * Math.sin(phaseProgress * Math.PI));
            const gradient = ctx.createLinearGradient(-300, -360, 320, 360);
            gradient.addColorStop(0, phase === 0 ? '#8DEBFF' : '#A7FF68');
            gradient.addColorStop(0.5, phase === 0 ? '#7C5CFF' : '#00D6A3');
            gradient.addColorStop(1, phase === 0 ? '#FF4EB8' : '#35D5FF');
            ctx.fillStyle = gradient;
            ctx.shadowColor = phase === 0 ? 'rgba(124,92,255,0.55)' : 'rgba(0,214,163,0.55)';
            ctx.shadowBlur = 70;
            ctx.beginPath();
            ctx.roundRect(-340, -330, 680, 660, 96);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.24)';
            ctx.beginPath();
            ctx.ellipse(-90, -135, 235, 90, -0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '900 58px PingFang SC, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(phase === 0 ? '第一破框' : '第二次破框', 0, -18);
            ctx.font = '700 34px PingFang SC, sans-serif';
            ctx.fillText(text.slice(0, 12), 0, 58);
            ctx.restore();

            if (elapsed < duration) {
                requestAnimationFrame(drawAiFrame);
            } else {
                recorder.stop();
            }
        };
        requestAnimationFrame(drawAiFrame);

        const blob = await done;
        const file = new File([blob], 'break-frame-transparent-ai.webm', { type: blob.type || 'video/webm' });
        const url = URL.createObjectURL(blob);
        setBreakFrameAsset({
            file,
            url,
            status: 'valid',
            message: 'AI 已生成 1126 x 1890 透明底破框视频；不支持透明时按白/绿底抠像',
        });
        console.info('破框 AI 固定提示词', fullPrompt);
        return url;
    };

    const handleUploadDragOver = (event: React.DragEvent, target: 'asset' | 'splash' | 'magazine' | 'spotlight-small' | 'spotlight-large' | 'spotlight-splash' | 'break-frame' | 'break-splash' | 'break-focal') => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        setDragTarget(target);
    };

    const handleUploadDragLeave = (event: React.DragEvent, target: 'asset' | 'splash' | 'magazine' | 'spotlight-small' | 'spotlight-large' | 'spotlight-splash' | 'break-frame' | 'break-splash' | 'break-focal') => {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragTarget((current) => current === target ? null : current);
    };

    const handleUploadDrop = async (event: React.DragEvent, target: 'asset' | 'splash' | 'magazine' | 'spotlight-small' | 'spotlight-large' | 'spotlight-splash' | 'break-frame' | 'break-splash' | 'break-focal') => {
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
        else await updateBreakFocal(files[0]);
    };

    const generatePromptAsset = async () => {
        const text = prompt.trim() || '炫动开屏素材';
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
            message: '提示词已生成 PNG 450 x 450，符合 MR 标准',
        });
        return url;
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
            const outputUrl = URL.createObjectURL(output);
            setGeneratedVideoUrl(outputUrl);
            setGeneratedVideoType(mimeType);
        } catch (err) {
            setError(err instanceof Error ? err.message : '杂志翻页视频合成失败');
        } finally {
            setIsGenerating(false);
        }
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

                if (elapsed < SPOTLIGHT_DURATION) {
                    requestAnimationFrame(drawFrame);
                } else {
                    recorder.stop();
                    if (splashVideo) splashVideo.pause();
                }
            };

            requestAnimationFrame(drawFrame);
            const output = await done;
            const outputUrl = URL.createObjectURL(output);
            setGeneratedVideoUrl(outputUrl);
            setGeneratedVideoType(mimeType);
        } catch (err) {
            setError(err instanceof Error ? err.message : '聚光开屏视频合成失败');
        } finally {
            setIsGenerating(false);
        }
    };

    const buildBreakFrameFocalVideo = async () => {
        setError('');
        resetOutput();

        if (!breakFocal.url || !breakFocal.file || breakFocal.status === 'invalid') {
            setError('请上传 1126 x 900px 的焦点视窗素材');
            return;
        }
            const promptGeneratedUrl = breakFrameAsset.url ? null : await generateBreakFrameByPrompt();

            setIsGenerating(true);
            try {
                const frameUrl = breakFrameAsset.url || promptGeneratedUrl;
                if (!frameUrl) throw new Error('请上传破框素材，或使用提示词生成透明底素材');

            const canvas = document.createElement('canvas');
            canvas.width = BREAK_CANVAS_W;
            canvas.height = BREAK_CANVAS_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建视频画布');

            const focalIsVideo = breakFocal.file.type.startsWith('video/');
            const focalImage = focalIsVideo ? null : await loadImage(breakFocal.url);
            const focalVideo = focalIsVideo ? await loadVideoElement(breakFocal.url) : null;
            const frameIsVideo = Boolean(promptGeneratedUrl) || breakFrameAsset.file?.type.startsWith('video/');
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
            const duration = Math.max(BREAK_DURATION, (Math.max(3, Math.round(breakFrameStartSecond)) + 2) * 1000);
            let frameVideoStarted = false;
            recorder.start();

            const drawFrame = (now: number) => {
                const elapsed = Math.min(now - start, duration);
                const frameStartMs = Math.max(3, Math.round(breakFrameStartSecond)) * 1000;
                const frameElapsed = elapsed - frameStartMs;
                const entrance = frameElapsed >= 0 ? easeOutCubic(frameElapsed / 900) : 0;

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

                if (frameElapsed >= 0) {
                    if (frameVideo && !frameVideoStarted) {
                        frameVideo.currentTime = 0;
                        frameVideo.play().catch(() => undefined);
                        frameVideoStarted = true;
                    }
                    ctx.save();
                    ctx.globalAlpha = entrance;
                    ctx.translate(0, (1 - entrance) * 120);
                    if (frameVideo && frameVideo.readyState >= 2) {
                        drawContain(ctx, frameVideo, frameVideo.videoWidth || BREAK_FRAME_W, frameVideo.videoHeight || BREAK_FRAME_H, BREAK_FRAME_W, BREAK_FRAME_H, frameX, frameY);
                    } else if (frameImage) {
                        drawContain(ctx, frameImage, frameImage.naturalWidth, frameImage.naturalHeight, BREAK_FRAME_W, BREAK_FRAME_H, frameX, frameY);
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
            setGeneratedVideoUrl(URL.createObjectURL(output));
            setGeneratedVideoType(mimeType);
        } catch (err) {
            setError(err instanceof Error ? err.message : '破框焦点视窗3D 合成失败');
        } finally {
            setIsGenerating(false);
        }
    };

    const buildVideo = async () => {
        setError('');
        resetOutput();

        if (expandedTemplate === 'magazine-flip') {
            await buildMagazineVideo();
            return;
        }
        if (expandedTemplate === 'slide-splash') {
            await buildSpotlightVideo();
            return;
        }
        if (expandedTemplate === 'break-frame-focal-3d') {
            await buildBreakFrameFocalVideo();
            return;
        }

        if (expandedTemplate !== 'dynamic-splash') {
            setError('当前仅开放「炫动开屏」「杂志翻页」「聚光开屏」「破框焦点视窗3D」模版编辑');
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
                splashVideo.loop = true;
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
                    const size = PENDANT_SIZE * frame.scale;
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
            const outputUrl = URL.createObjectURL(output);
            setGeneratedVideoUrl(outputUrl);
            setGeneratedVideoType(mimeType);
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
    const isMagazineTemplate = expandedTemplate === 'magazine-flip';
    const isSpotlightTemplate = expandedTemplate === 'slide-splash';
    const isBreakFocalTemplate = expandedTemplate === 'break-frame-focal-3d';
    const outputSpec = isMagazineTemplate
        ? '输出规格 1440 x 2340 / 每 1.5s 翻页'
            : isSpotlightTemplate
                ? '输出规格 1440 x 2340 / 聚光合成'
                : isBreakFocalTemplate
                    ? '输出规格 1126 x 2436 / 破框 3D'
                : '输出规格 1440 x 2340 / 5s';
    const magazineActiveIndex = magazineAssets.length
        ? Math.floor(magazinePreviewElapsed / MAGAZINE_FRAME_MS) % magazineAssets.length
        : 0;
    const magazineNextIndex = magazineAssets.length ? (magazineActiveIndex + 1) % magazineAssets.length : 0;
    const magazineSlideProgress = magazineAssets.length
        ? (magazinePreviewElapsed % MAGAZINE_FRAME_MS) / MAGAZINE_FRAME_MS
        : 0;
    const getMagazinePreviewStyle = (index: number): React.CSSProperties => {
        if (magazineAssets.length <= 1) return { transform: 'translateX(0%)' };
        if (index === magazineActiveIndex) return { transform: `translateX(${-magazineSlideProgress * 100}%)` };
        if (index === magazineNextIndex) return { transform: `translateX(${(1 - magazineSlideProgress) * 100}%)` };
        return { transform: 'translateX(100%)', visibility: 'hidden' };
    };
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
    const breakFrameTriggerSecond = Math.max(3, Math.round(breakFrameStartSecond));
    const breakFramePreviewStarted = breakPreviewElapsed >= breakFrameTriggerSecond * 1000;

    return (
        <div className="fixed inset-0 top-[73px] bg-[#0A0A0A] z-0 overflow-hidden text-zinc-300">
            <div className="flex h-full gap-6 p-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <aside className="w-80 bg-zinc-950/40 backdrop-blur-3xl rounded-[20px] border border-white/5 p-6 flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
                    <div className="px-2 py-3 mb-6 flex items-center gap-3 shrink-0">
                        <div className="w-10 h-10 bg-white/5 rounded-[20px] flex items-center justify-center border border-white/10 shadow-inner">
                            <span className="material-symbols-outlined text-white text-2xl">auto_awesome_motion</span>
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-white tracking-widest uppercase">模版管理</h2>
                            <p className="text-[10px] text-zinc-600 font-bold tracking-tighter">TEMPLATE MANAGER</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                        {categories.map((cat) => (
                            <div key={cat.id} className="space-y-2">
                                <button
                                    onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                                    className={`w-full flex items-center justify-between px-5 py-4 rounded-[20px] transition-all duration-500 ${expandedCategory === cat.id ? 'bg-white/10 text-white shadow-inner' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
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
                                            <button
                                                key={tpl.id}
                                                onClick={() => handleTemplateSelect(tpl.id)}
                                                className={`w-full flex items-center justify-between px-5 py-3 rounded-[20px] text-xs font-bold transition-all duration-300 ${expandedTemplate === tpl.id ? 'text-white bg-white/15 shadow-2xl border border-white/10' : 'text-zinc-500 hover:text-zinc-200'}`}
                                            >
                                                <span>{tpl.label}</span>
                                                <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${expandedTemplate === tpl.id ? 'bg-primary shadow-[0_0_10px_#FF2E63]' : 'bg-zinc-800'}`} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/5 shrink-0">
                        <button
                            onClick={buildVideo}
                            disabled={isGenerating}
                            className="w-full bg-white text-black py-5 rounded-[20px] font-black text-[11px] shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:bg-zinc-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-[0.2em] group disabled:opacity-50"
                        >
                            <span className={`material-symbols-outlined text-xl ${isGenerating ? 'animate-spin' : 'group-hover:animate-bounce'}`}>{isGenerating ? 'sync' : 'bolt'}</span>
                            {isGenerating ? '正在生成视频' : '生成合成视频'}
                        </button>
                    </div>
                </aside>

                <main className="flex-1 bg-zinc-950/20 backdrop-blur-3xl rounded-[20px] border border-white/5 shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
                    <header className="px-10 py-8 border-b border-white/5 bg-black/10 backdrop-blur-md flex justify-between items-center shrink-0">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="px-3 py-1 rounded-[20px] bg-white/5 text-zinc-500 text-[9px] font-black uppercase tracking-widest border border-white/5">MR STANDARD</span>
                                <div className="flex items-center gap-1.5 antialiased">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#10B981]" />
                                    <span className="text-[9px] text-zinc-600 font-black uppercase tracking-tight">{isMagazineTemplate ? 'Magazine Flip' : isSpotlightTemplate ? 'Spotlight Splash' : isBreakFocalTemplate ? 'Break Frame Focal' : 'Dynamic Splash'}</span>
                                </div>
                            </div>
                            <h1 className="text-3xl font-black text-white tracking-tighter antialiased">{selectedTemplateName}模版</h1>
                        </div>
                        <div className="flex items-center gap-3">
                            {saveMessage && <span className="text-[10px] font-bold text-zinc-500">{saveMessage}</span>}
                            <div className="px-5 py-3 rounded-[20px] bg-white/5 text-zinc-400 text-[10px] font-bold border border-white/5">
                                {outputSpec}
                            </div>
                        </div>
                    </header>

                    <div className="flex-1 overflow-auto p-10 custom-scrollbar">
                        <div className="grid grid-cols-[420px_minmax(0,1fr)] gap-8 min-h-full">
                            <section className="space-y-5">
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
                                                            <video src={item.url} className="h-full aspect-[9/16] object-cover" muted loop playsInline />
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
                                                    <h2 className="text-white text-sm font-black">小卡素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">上传 3 张 PNG / 宽 275 x 高 370px</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${spotlightSmallCards.length === 3 ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20' : 'text-zinc-500 bg-white/5 border-white/5'}`}>
                                                    {spotlightSmallCards.length} / 3
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
                                            <button
                                                onClick={() => spotlightSmallInputRef.current?.click()}
                                                onDragOver={(event) => handleUploadDragOver(event, 'spotlight-small')}
                                                onDragLeave={(event) => handleUploadDragLeave(event, 'spotlight-small')}
                                                onDrop={(event) => handleUploadDrop(event, 'spotlight-small')}
                                                className={`w-full min-h-[132px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'spotlight-small' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                            >
                                                <div className="text-center">
                                                    <span className="material-symbols-outlined text-3xl text-zinc-600">dashboard_customize</span>
                                                    <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'spotlight-small' ? '松开上传小卡素材' : '点击或拖入 3 张小卡 PNG'}</p>
                                                </div>
                                            </button>
                                            <div className="grid grid-cols-3 gap-2">
                                                {spotlightSmallCards.map((item, index) => (
                                                    <div key={item.id} className="relative rounded-[14px] border border-white/5 bg-black/30 p-2">
                                                        <button
                                                            onClick={() => removeSpotlightSmallCard(item.id)}
                                                            className="absolute right-1 top-1 z-10 h-5 w-5 rounded-full bg-black/70 text-white/80 flex items-center justify-center"
                                                            title="移除小卡"
                                                        >
                                                            <span className="material-symbols-outlined text-xs">close</span>
                                                        </button>
                                                        <img src={item.url} alt={`小卡 ${index + 1}`} className="h-16 w-full object-contain rounded-[10px] bg-zinc-950" />
                                                        <p className="mt-1 text-[9px] font-bold text-zinc-500">小卡 {index + 1}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">大卡素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">PNG / 897 x 370px</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(spotlightLargeCard.status)}`}>{spotlightLargeCard.message}</span>
                                            </div>
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
                                            <button
                                                onClick={() => spotlightLargeInputRef.current?.click()}
                                                onDragOver={(event) => handleUploadDragOver(event, 'spotlight-large')}
                                                onDragLeave={(event) => handleUploadDragLeave(event, 'spotlight-large')}
                                                onDrop={(event) => handleUploadDrop(event, 'spotlight-large')}
                                                className={`w-full min-h-[116px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'spotlight-large' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                            >
                                                {spotlightLargeCard.url ? (
                                                    <img src={spotlightLargeCard.url} alt="大卡素材预览" className="h-20 w-full object-contain" />
                                                ) : (
                                                    <div className="text-center">
                                                        <span className="material-symbols-outlined text-3xl text-zinc-600">featured_play_list</span>
                                                        <p className="text-[10px] text-zinc-500 font-black mt-2">点击或拖入大卡 PNG</p>
                                                    </div>
                                                )}
                                            </button>
                                        </div>

                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">焦点视窗背景素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">图片 1126 x 2436px / 视频 5s 内</p>
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
                                            <button
                                                onClick={() => spotlightSplashInputRef.current?.click()}
                                                onDragOver={(event) => handleUploadDragOver(event, 'spotlight-splash')}
                                                onDragLeave={(event) => handleUploadDragLeave(event, 'spotlight-splash')}
                                                onDrop={(event) => handleUploadDrop(event, 'spotlight-splash')}
                                                className={`w-full min-h-[156px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'spotlight-splash' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                            >
                                                {spotlightSplash.url ? (
                                                    spotlightSplash.file?.type.startsWith('video/') ? (
                                                        <video src={spotlightSplash.url} className="h-36 aspect-[9/16] object-cover rounded-xl" muted loop playsInline />
                                                    ) : (
                                                        <img src={spotlightSplash.url} alt="开屏素材预览" className="h-36 aspect-[9/16] object-cover rounded-xl" />
                                                    )
                                                ) : (
                                                    <div className="text-center">
                                                        <span className="material-symbols-outlined text-3xl text-zinc-600">perm_media</span>
                                                        <p className="text-[10px] text-zinc-500 font-black mt-2">点击或拖入背景素材</p>
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    </>
                                ) : isBreakFocalTemplate ? (
                                    <>
                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">破框素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">图片/透明底视频 / 1126 x 1890px；AI 生成输出透明底视频</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(breakFrameAsset.status)}`}>{breakFrameAsset.message}</span>
                                            </div>
                                            <input
                                                ref={breakFrameInputRef}
                                                type="file"
                                                accept="image/*,video/*"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const input = e.currentTarget;
                                                    if (input.files?.[0]) await updateBreakFrameAsset(input.files[0]);
                                                    input.value = '';
                                                }}
                                            />
                                            <button
                                                onClick={() => breakFrameInputRef.current?.click()}
                                                onDragOver={(event) => handleUploadDragOver(event, 'break-frame')}
                                                onDragLeave={(event) => handleUploadDragLeave(event, 'break-frame')}
                                                onDrop={(event) => handleUploadDrop(event, 'break-frame')}
                                                className={`w-full min-h-[156px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'break-frame' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                            >
                                                {breakFrameAsset.url ? (
                                                    breakFrameAsset.file?.type.startsWith('video/') ? (
                                                        <video src={breakFrameAsset.url} className="h-36 max-w-full object-contain rounded-xl bg-zinc-950" muted loop playsInline />
                                                    ) : (
                                                        <img src={breakFrameAsset.url} alt="破框素材预览" className="h-36 max-w-full object-contain rounded-xl bg-zinc-950" />
                                                    )
                                                ) : (
                                                    <div className="text-center">
                                                        <span className="material-symbols-outlined text-3xl text-zinc-600">view_in_ar</span>
                                                        <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'break-frame' ? '松开上传破框素材' : '点击或拖入破框素材'}</p>
                                                        <p className="text-[9px] text-zinc-700 font-bold mt-1">生成区域固定为 1126 x 1890px，透明底</p>
                                                    </div>
                                                )}
                                            </button>
                                            <div className="rounded-[18px] border border-white/5 bg-black/20 p-4 flex items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">破框播放时间</p>
                                                    <p className="text-[9px] text-zinc-700 font-bold mt-1">焦点视窗播放 3 秒后，只能选择整秒</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        onClick={() => {
                                                            setBreakFrameStartSecond((current) => Math.max(3, current - 1));
                                                            resetOutput();
                                                        }}
                                                        className="h-8 w-8 rounded-xl bg-white/10 hover:bg-white/15 text-white flex items-center justify-center"
                                                        title="减少 1 秒"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">remove</span>
                                                    </button>
                                                    <div className="h-8 min-w-[70px] rounded-xl bg-zinc-950 border border-white/5 px-3 flex items-center justify-center text-xs font-black text-white">
                                                        第 {breakFrameStartSecond} 秒
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            setBreakFrameStartSecond((current) => current + 1);
                                                            resetOutput();
                                                        }}
                                                        className="h-8 w-8 rounded-xl bg-white/10 hover:bg-white/15 text-white flex items-center justify-center"
                                                        title="增加 1 秒"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">add</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="rounded-[18px] border border-white/5 bg-black/20 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-[18px] text-zinc-500">lock</span>
                                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">AI 提示词</p>
                                                </div>
                                                <textarea
                                                    value={`${BREAK_AI_FIXED_PROMPT}\n${breakPrompt}`}
                                                    onChange={(e) => {
                                                        const nextValue = e.target.value;
                                                        if (!nextValue.startsWith(BREAK_AI_FIXED_PROMPT)) return;
                                                        setBreakPrompt(nextValue.slice(BREAK_AI_FIXED_PROMPT.length).replace(/^\n/, ''));
                                                    }}
                                                    placeholder="在固定提示词后补充你的想法..."
                                                    className="w-full min-h-[132px] resize-none bg-zinc-950/80 border border-white/5 rounded-[18px] p-4 text-xs leading-5 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-white/20"
                                                />
                                                <p className="text-[9px] text-zinc-700 font-bold">固定提示词不可调整；优先输出透明底视频，若模型无法输出透明底，则输出白色或绿色底并通过遮罩抠像。</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    onClick={generateBreakFrameByPrompt}
                                                    className="h-10 rounded-[20px] bg-white/10 hover:bg-white/15 text-white text-[11px] font-black transition-all"
                                                >
                                                    文生视频素材
                                                </button>
                                                <button
                                                    onClick={generateBreakFrameByPrompt}
                                                    className="h-10 rounded-[20px] bg-white/10 hover:bg-white/15 text-white text-[11px] font-black transition-all"
                                                >
                                                    图生视频素材
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h2 className="text-white text-sm font-black">焦点视窗素材</h2>
                                                    <p className="text-[10px] text-zinc-600 font-bold mt-1">图片 / 视频不限时长 / 1126 x 900px</p>
                                                </div>
                                                <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(breakFocal.status)}`}>{breakFocal.message}</span>
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
                                            <button
                                                onClick={() => breakFocalInputRef.current?.click()}
                                                onDragOver={(event) => handleUploadDragOver(event, 'break-focal')}
                                                onDragLeave={(event) => handleUploadDragLeave(event, 'break-focal')}
                                                onDrop={(event) => handleUploadDrop(event, 'break-focal')}
                                                className={`w-full min-h-[132px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'break-focal' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                            >
                                                {breakFocal.url ? (
                                                    breakFocal.file?.type.startsWith('video/') ? (
                                                        <video src={breakFocal.url} className="h-24 w-full object-cover rounded-xl" muted loop playsInline />
                                                    ) : (
                                                        <img src={breakFocal.url} alt="焦点视窗预览" className="h-24 w-full object-cover rounded-xl" />
                                                    )
                                                ) : (
                                                    <div className="text-center">
                                                        <span className="material-symbols-outlined text-3xl text-zinc-600">crop_16_9</span>
                                                        <p className="text-[10px] text-zinc-500 font-black mt-2">点击或拖入焦点视窗素材</p>
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-white text-sm font-black">挂件素材</h2>
                                            <p className="text-[10px] text-zinc-600 font-bold mt-1">PNG / 450 x 450px / MR 标准</p>
                                        </div>
                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(asset.status)}`}>{asset.message}</span>
                                    </div>

                                    <input ref={assetInputRef} type="file" accept="image/png" className="hidden" onChange={(e) => e.target.files?.[0] && updateAsset(e.target.files[0])} />
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
                                                <p className="text-[10px] text-zinc-500 font-black mt-2">{dragTarget === 'asset' ? '松开上传 PNG 素材' : '点击或拖入 PNG 素材'}</p>
                                            </div>
                                        )}
                                    </button>

                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-zinc-600">magic_button</span>
                                        <input
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                            placeholder="无素材时输入提示词生成..."
                                            className="w-full h-11 bg-zinc-950/80 border border-white/5 rounded-[20px] pl-11 pr-4 text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-white/20"
                                        />
                                    </div>
                                    <button
                                        onClick={generatePromptAsset}
                                        className="w-full h-10 rounded-[20px] bg-white/10 hover:bg-white/15 text-white text-[11px] font-black transition-all"
                                    >
                                        用提示词生成 450 x 450 素材
                                    </button>
                                </div>

                                <div className="bg-white/[0.04] border border-white/5 rounded-[20px] p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-white text-sm font-black">开屏素材上传</h2>
                                            <p className="text-[10px] text-zinc-600 font-bold mt-1">图片 1440 x 2340px / 视频 5s 内</p>
                                        </div>
                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${statusClass(splash.status)}`}>{splash.message}</span>
                                    </div>

                                    <input ref={splashInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => e.target.files?.[0] && updateSplash(e.target.files[0])} />
                                    <button
                                        onClick={() => splashInputRef.current?.click()}
                                        onDragOver={(event) => handleUploadDragOver(event, 'splash')}
                                        onDragLeave={(event) => handleUploadDragLeave(event, 'splash')}
                                        onDrop={(event) => handleUploadDrop(event, 'splash')}
                                        className={`w-full min-h-[190px] border border-dashed rounded-[20px] transition-all flex items-center justify-center overflow-hidden ${dragTarget === 'splash' ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                    >
                                        {splash.url ? (
                                            splash.file?.type.startsWith('video/') ? (
                                                <video src={splash.url} className="h-44 aspect-[9/16] object-cover rounded-xl" muted loop playsInline />
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
                                </div>
                                    </>
                                )}

                                {error && (
                                    <div className="rounded-[20px] border border-rose-400/20 bg-rose-500/10 text-rose-200 text-xs font-bold px-5 py-4">
                                        {error}
                                    </div>
                                )}
                            </section>

                            <section className="bg-white/[0.04] border border-white/5 rounded-[20px] p-8 flex flex-col min-h-[640px]">
                                <div className="flex items-center justify-between gap-4 mb-4">
                                    <div>
                                        <h2 className="text-white text-sm font-black">合成预览</h2>
                                        <p className="text-[10px] text-zinc-600 font-bold mt-1">
                                            {isMagazineTemplate
                                                ? '当前页向左滑出，下一页紧贴右侧滑入，每 1.5s 完成一次翻页'
                                                : isSpotlightTemplate
                                                    ? '三张小卡从下往上弹出，同排定位后合并成一张大卡'
                                                    : isBreakFocalTemplate
                                                        ? '套用美图秀秀焦点视窗底层能力，破框素材覆盖在焦点视窗上方'
                                                        : '8 个挂件组成一整块，从上方滑入并在 5s 内滑出画面'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {!isMagazineTemplate && !isSpotlightTemplate && !isBreakFocalTemplate && <span className="text-[10px] text-zinc-500 font-bold mr-1">{interactionOptions.find((item) => item.id === interactionType)?.label}</span>}
                                        <a
                                            href={generatedVideoUrl || undefined}
                                            download={`${isMagazineTemplate ? 'magazine-flip' : isSpotlightTemplate ? 'spotlight-splash' : isBreakFocalTemplate ? 'break-frame-focal-3d' : 'dynamic-splash'}.${generatedVideoType.includes('mp4') ? 'mp4' : 'webm'}`}
                                            className={`h-9 px-4 rounded-[14px] text-[11px] font-black flex items-center justify-center gap-1.5 transition-all ${generatedVideoUrl ? 'bg-white text-black hover:bg-zinc-200' : 'bg-white/5 text-zinc-700 pointer-events-none'}`}
                                        >
                                            <span className="material-symbols-outlined text-base">download</span>
                                            下载
                                        </a>
                                        <button
                                            onClick={buildVideo}
                                            disabled={isGenerating}
                                            className="h-9 px-4 rounded-[14px] bg-primary/90 text-white text-[11px] font-black hover:bg-primary transition-all disabled:opacity-50"
                                        >
                                            {isGenerating ? '生成中' : '重新生成'}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 flex items-center justify-center min-h-0">
                                    <div
                                        className="relative h-full max-h-[68vh] rounded-[20px] overflow-hidden bg-zinc-950 border border-white/10 shadow-2xl group/preview"
                                        style={{ aspectRatio: isBreakFocalTemplate ? '1126 / 2436' : '1440 / 2340' }}
                                    >
                                        {generatedVideoUrl ? (
                                            <>
                                                <video
                                                    ref={previewVideoRef}
                                                    src={generatedVideoUrl}
                                                    className="w-full h-full object-cover"
                                                    autoPlay
                                                    loop
                                                    onPlay={() => setIsPreviewPlaying(true)}
                                                    onPause={() => setIsPreviewPlaying(false)}
                                                />
                                                <button
                                                    onClick={togglePreviewPlayback}
                                                    className="absolute inset-0 m-auto h-16 w-16 rounded-full bg-black/55 text-white backdrop-blur-md opacity-0 group-hover/preview:opacity-100 transition-all flex items-center justify-center border border-white/20"
                                                    aria-label={isPreviewPlaying ? '暂停视频' : '播放视频'}
                                                >
                                                    <span className="material-symbols-outlined text-4xl">{isPreviewPlaying ? 'pause' : 'play_arrow'}</span>
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                {isMagazineTemplate ? (
                                                    magazineAssets.length ? (
                                                        magazineAssets.map((item, index) => (
                                                            item.type === 'video' ? (
                                                                <video
                                                                    key={item.id}
                                                                    src={item.url}
                                                                    className="absolute inset-0 w-full h-full object-cover"
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
                                                            <span className="mt-3 text-[10px] font-black tracking-widest uppercase">3-5 Assets / 1.5s Slide</span>
                                                        </div>
                                                    )
                                                ) : isSpotlightTemplate ? (
                                                    <>
                                                        {spotlightSplash.url ? (
                                                            spotlightSplash.file?.type.startsWith('video/') ? (
                                                                <video src={spotlightSplash.url} className="absolute inset-0 w-full h-full object-cover" muted loop playsInline autoPlay />
                                                            ) : (
                                                                <img src={spotlightSplash.url} alt="聚光开屏预览" className="absolute inset-0 w-full h-full object-cover" />
                                                            )
                                                        ) : (
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700">
                                                                <span className="material-symbols-outlined text-6xl">highlight</span>
                                                                <span className="mt-3 text-[10px] font-black tracking-widest uppercase">Spotlight Splash</span>
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
                                                            {breakFocal.url ? (
                                                                breakFocal.file?.type.startsWith('video/') ? (
                                                                    <video
                                                                        ref={breakFocalPreviewVideoRef}
                                                                        src={breakFocal.url}
                                                                        className="w-full h-full object-cover"
                                                                        muted
                                                                        loop
                                                                        playsInline
                                                                        autoPlay
                                                                        onLoadedMetadata={(event) => {
                                                                            event.currentTarget.play().catch(() => undefined);
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <img src={breakFocal.url} alt="焦点视窗预览" className="w-full h-full object-cover" />
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
                                                        <div
                                                            className="absolute pointer-events-none z-[80]"
                                                            style={{
                                                                left: 0,
                                                                top: `${(BREAK_FRAME_Y / BREAK_CANVAS_H) * 100}%`,
                                                                width: '100%',
                                                                height: `${(BREAK_FRAME_H / BREAK_CANVAS_H) * 100}%`,
                                                                opacity: breakFramePreviewStarted ? 1 : 0,
                                                                transform: breakFramePreviewStarted ? 'translateY(0)' : 'translateY(18px)',
                                                                transition: 'opacity 0.35s ease-out, transform 0.35s ease-out',
                                                            }}
                                                        >
                                                            {breakFrameAsset.url && breakFramePreviewStarted ? (
                                                                breakFrameAsset.file?.type.startsWith('video/') ? (
                                                                    <video
                                                                        key={`${breakFrameAsset.url}-${breakFrameTriggerSecond}`}
                                                                        ref={breakFramePreviewVideoRef}
                                                                        src={breakFrameAsset.url}
                                                                        className="w-full h-full object-contain drop-shadow-2xl"
                                                                        muted
                                                                        loop
                                                                        playsInline
                                                                        autoPlay
                                                                        onLoadedMetadata={(event) => {
                                                                            event.currentTarget.currentTime = 0;
                                                                            event.currentTarget.play().catch(() => undefined);
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <img src={breakFrameAsset.url} alt="破框素材预览" className="w-full h-full object-contain drop-shadow-2xl" />
                                                                )
                                                            ) : !breakFrameAsset.url ? (
                                                                <div className="w-full h-full border border-dashed border-fuchsia-300/60 bg-fuchsia-300/5 flex items-center justify-center">
                                                                    <span className="text-[9px] font-black text-fuchsia-200 tracking-widest">1126 x 1890 / TRANSPARENT</span>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </>
                                                ) : splash.url ? (
                                                    splash.file?.type.startsWith('video/') ? (
                                                        <video src={splash.url} className="absolute inset-0 w-full h-full object-cover" muted loop playsInline autoPlay />
                                                    ) : (
                                                        <img src={splash.url} alt="开屏预览" className="absolute inset-0 w-full h-full object-cover" />
                                                    )
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                                                        <span className="material-symbols-outlined text-6xl">movie</span>
                                                    </div>
                                                )}
                                                {!isMagazineTemplate && !isSpotlightTemplate && !isBreakFocalTemplate && asset.url && (
                                                    <div
                                                        className="absolute inset-0 animate-pendant-group-drop pointer-events-none"
                                                        style={getPendantGroupPreviewStyle()}
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
                                                        {magazineActiveIndex + 1} / {magazineAssets.length}
                                                    </div>
                                                )}
                                                <div className="absolute inset-x-0 bottom-8 text-center">
                                                    <span className="text-[8px] font-black text-white/50 uppercase tracking-[0.3em]">1440 x 2340 / FINAL VIDEO</span>
                                                </div>
                                            </>
                                        )}
                                        {cropAreaEnabled && (
                                            <div
                                                className="absolute left-[10%] right-[10%] top-[12%] bottom-[16%] border border-dashed border-emerald-300/80 bg-emerald-300/5 pointer-events-none"
                                            >
                                                <span className="absolute left-2 top-2 text-[8px] font-black text-emerald-200 uppercase tracking-widest">裁剪安全区</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-3 shrink-0">
                                    <div className="rounded-[16px] border border-white/5 bg-black/20 p-3 space-y-2">
                                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">交互形式</p>
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
                                    </div>

                                    <div className="rounded-[16px] border border-white/5 bg-black/20 p-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">裁剪区域</p>
                                        </div>
                                        <button
                                            onClick={() => setCropAreaEnabled((current) => !current)}
                                            className={`h-6 w-11 rounded-full p-1 transition-all ${cropAreaEnabled ? 'bg-emerald-400/80' : 'bg-white/10'}`}
                                        >
                                            <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${cropAreaEnabled ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>

                                    <div className="rounded-[16px] border border-white/5 bg-black/20 p-3 space-y-2">
                                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">平台选择</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {platformOptions.map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => togglePlatform(item.id)}
                                                    className={`h-11 rounded-[14px] text-[10px] font-black transition-all flex items-center justify-center border ${selectedPlatforms.includes(item.id) ? 'bg-primary/15 border-primary/60 shadow-[0_0_18px_rgba(99,102,241,0.24)]' : 'bg-white/5 border-transparent text-zinc-500 hover:bg-white/10'}`}
                                                    title={item.label}
                                                >
                                                    <img src={item.icon} alt={item.label} className="h-6 w-6 rounded-[6px] object-contain" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default ConfigWorkspace;
