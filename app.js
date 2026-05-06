/**
 * 舞蹈跟练评分 H5 App v7.2
 * 新增：手机竖屏微信式悬浮小窗 + 示范视频实时AI骨骼检测 + 智能体对话引导
 */

'use strict';

/* ============================================================
   一、数据配置 - 舞曲列表
   ============================================================ */
const SONGS = [
  {
    id: 'demo1',
    title: '节拍律动',
    artist: '练习曲 · 初级',
    emoji: '🎵',
    diff: 'easy',
    diffLabel: '简单',
    videoSrc: '',
    bpm: 100,
    keyframes: generateDemoKeyframes(100)
  },
  {
    id: 'demo2',
    title: '动感节拍',
    artist: '流行舞 · 中级',
    emoji: '🕺',
    diff: 'medium',
    diffLabel: '中等',
    videoSrc: '',
    bpm: 128,
    keyframes: generateDemoKeyframes(128)
  },
  {
    id: 'demo3',
    title: 'Hi-Energy',
    artist: '街舞 · 高级',
    emoji: '🔥',
    diff: 'hard',
    diffLabel: '困难',
    videoSrc: '',
    bpm: 150,
    keyframes: generateDemoKeyframes(150)
  }
];

/* MoveNet 关键点索引（17 点 COCO 格式） */
const KP = {
  NOSE: 0, L_EYE: 1, R_EYE: 2, L_EAR: 3, R_EAR: 4,
  L_SHOULDER: 5, R_SHOULDER: 6, L_ELBOW: 7, R_ELBOW: 8,
  L_WRIST: 9, R_WRIST: 10, L_HIP: 11, R_HIP: 12,
  L_KNEE: 13, R_KNEE: 14, L_ANKLE: 15, R_ANKLE: 16
};

/* 骨架连接线定义 */
const SKELETON_PAIRS = [
  [KP.NOSE, KP.L_EYE], [KP.NOSE, KP.R_EYE],
  [KP.L_EYE, KP.L_EAR], [KP.R_EYE, KP.R_EAR],
  [KP.L_SHOULDER, KP.R_SHOULDER],
  [KP.L_SHOULDER, KP.L_ELBOW], [KP.L_ELBOW, KP.L_WRIST],
  [KP.R_SHOULDER, KP.R_ELBOW], [KP.R_ELBOW, KP.R_WRIST],
  [KP.L_SHOULDER, KP.L_HIP], [KP.R_SHOULDER, KP.R_HIP],
  [KP.L_HIP, KP.R_HIP],
  [KP.L_HIP, KP.L_KNEE], [KP.L_KNEE, KP.L_ANKLE],
  [KP.R_HIP, KP.R_KNEE], [KP.R_KNEE, KP.R_ANKLE]
];

/* 参与评分的关键点 */
const SCORE_KPS = [
  KP.L_SHOULDER, KP.R_SHOULDER, KP.L_ELBOW, KP.R_ELBOW,
  KP.L_WRIST, KP.R_WRIST, KP.L_HIP, KP.R_HIP,
  KP.L_KNEE, KP.R_KNEE, KP.L_ANKLE, KP.R_ANKLE
];

/* ============================================================
   二、生成演示关键帧
   ============================================================ */
function generateDemoKeyframes(bpm) {
  const frames = [];
  const frameCount = Math.floor(bpm * 2);
  for (let i = 0; i < frameCount; i++) {
    const t = i / frameCount;
    const phase = t * Math.PI * 4;
    frames.push(buildDemoPose(phase));
  }
  return frames;
}

function buildDemoPose(phase) {
  const cx = 0.5, cy = 0.5;
  const swing = Math.sin(phase) * 0.06;
  const wave = Math.cos(phase) * 0.08;
  return [
    { x: cx, y: 0.15, s: 0.9 },
    { x: cx - 0.03, y: 0.13, s: 0.85 },
    { x: cx + 0.03, y: 0.13, s: 0.85 },
    { x: cx - 0.05, y: 0.14, s: 0.8 },
    { x: cx + 0.05, y: 0.14, s: 0.8 },
    { x: cx - 0.12, y: 0.28 + swing, s: 0.9 },
    { x: cx + 0.12, y: 0.28 - swing, s: 0.9 },
    { x: cx - 0.18 + wave, y: 0.40 + swing, s: 0.85 },
    { x: cx + 0.18 - wave, y: 0.40 - swing, s: 0.85 },
    { x: cx - 0.20 + wave * 1.5, y: 0.52, s: 0.8 },
    { x: cx + 0.20 - wave * 1.5, y: 0.52, s: 0.8 },
    { x: cx - 0.09, y: 0.56, s: 0.9 },
    { x: cx + 0.09, y: 0.56, s: 0.9 },
    { x: cx - 0.10 + swing, y: 0.72, s: 0.85 },
    { x: cx + 0.10 - swing, y: 0.72, s: 0.85 },
    { x: cx - 0.10 + swing * 0.5, y: 0.88, s: 0.8 },
    { x: cx + 0.10 - swing * 0.5, y: 0.88, s: 0.8 }
  ];
}

/* ============================================================
   三、应用状态
   ============================================================ */
const State = {
  selectedSong: null,
  detector: null,
  userStream: null,
  animFrameId: null,
  isPlaying: false,
  playbackRate: 1.0,
  scores: [],
  frameCount: 0,
  beatIndex: 0,
  beatInterval: null,
  lastPose: null,
  demoKeyframes: [],
  demoFrameIdx: 0,
  demoTimer: null,
  importedVideoEl: null,
  importedKeyframes: [],
  importedBpm: 120,
  importedDuration: 0,
  isExtracting: false,
  urlVideoSrc: '',
  urlVideoTitle: '',
  debugMode: false,
  // Safari 兼容
  isSafari: false,
  modelLoadFailed: false
};

/* ============================================================
   四、浏览器检测
   ============================================================ */
function detectBrowser() {
  const ua = navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  State.isSafari = isSafari || isIOS;
  log('[Browser] Safari/iOS:', State.isSafari, 'UA:', ua.slice(0, 50));
  return State.isSafari;
}

/* ============================================================
   五、URL 参数：生成分享链接 & 自动加载
   ============================================================ */

/**
 * 生成分享链接 - 使用 Base64 缩短 URL
 */
function generateShareLink(videoUrl) {
  const baseUrl = window.location.href.split('?')[0].split('#')[0];
  // 使用 Base64 编码缩短 URL
  const encoded = btoa(encodeURIComponent(videoUrl));
  return baseUrl + '?v=' + encoded;
}

/**
 * 读取 URL 参数中的视频链接
 */
function getVideoUrlFromParams() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('v');
  if (!v) return null;
  
  try {
    // 尝试 Base64 解码
    return decodeURIComponent(atob(v));
  } catch (e) {
    // 兼容旧版 URL 编码
    return decodeURIComponent(v);
  }
}

/**
 * 从 URL 参数自动启动跟练
 */
async function autoStartFromUrl() {
  const videoUrl = getVideoUrlFromParams();
  if (!videoUrl) return;

  log('[AutoStart] 检测到 URL 参数 videoUrl:', videoUrl.slice(0, 50) + '...');

  const title = extractTitleFromUrl(videoUrl);
  State.urlVideoSrc = videoUrl;
  State.urlVideoTitle = title;

  const urlSong = buildUrlVideoSong(videoUrl, title);
  State.selectedSong = urlSong;

  document.getElementById('songNameHeader').textContent = title;
  updateScoreUI(0);
  showPage('page-practice');

  showLoading('正在加载 AI 模型…');
  try {
    if (!State.detector) await loadDetector();
  } catch (e) {
    log('[AutoStart] 模型加载失败:', e);
    State.modelLoadFailed = true;
  }

  updateLoadingText('正在请求摄像头权限…');
  const camResult = await startCamera();
  hideLoading();

  if (!camResult.ok) {
    showCameraError(camResult.msg);
  }

  setTimeout(() => {
    showToast('视频已加载，点击「▶ 播放」开始跟练！');
  }, 800);
}

function extractTitleFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    let filename = path.split('/').pop();
    // 多层解码：处理双重/三重 URL 编码的中文文件名
    for (let i = 0; i < 5; i++) {
      const decoded = decodeURIComponent(filename);
      if (decoded === filename) break; // 已无法再解码
      filename = decoded;
    }
    return filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || '自定义跟练';
  } catch (_) {
    return '自定义跟练';
  }
}

function buildUrlVideoSong(videoUrl, title) {
  return {
    id: 'url-video',
    title: title || '自定义跟练',
    artist: '视频跟练 · 实时评分',
    emoji: '🎬',
    diff: 'medium',
    diffLabel: '自选',
    videoSrc: videoUrl,
    bpm: 120,
    keyframes: generateDemoKeyframes(120)
  };
}

/* ============================================================
   六、视频导入 & 关键帧提取
   ============================================================ */
function getImportVideoEl() {
  let el = document.getElementById('importedVideoEl');
  if (!el) {
    el = document.createElement('video');
    el.id = 'importedVideoEl';
    el.style.display = 'none';
    el.playsInline = true;
    el.muted = false;
    document.body.appendChild(el);
    State.importedVideoEl = el;
  }
  return el;
}

async function handleVideoFileSelect(file) {
  if (!file || !file.type.startsWith('video/')) {
    alert('请选择一个有效的视频文件（MP4 / WebM）。');
    return;
  }

  const url = URL.createObjectURL(file);
  const video = getImportVideoEl();
  video.src = url;

  return new Promise((resolve, reject) => {
    video.onloadedmetadata = async () => {
      const duration = video.duration;
      State.importedDuration = duration;
      log('[Import] 视频时长:', duration.toFixed(1), 's');

      document.getElementById('importVideoName').textContent = file.name;
      document.getElementById('importVideoDuration').textContent = duration.toFixed(1) + 's';
      showImportProgress(true);

      try {
        if (!State.detector) await loadDetector();
        const keyframes = await extractKeyframesFromVideo(video, duration);
        State.importedKeyframes = keyframes;
        log('[Import] 共提取', keyframes.length, '帧关键帧');

        State.importedBpm = Math.round(Math.min(180, Math.max(80, duration * 2)));

        document.getElementById('importVideoFrames').textContent = '已提取 ' + keyframes.length + ' 帧';
        showImportPreview(true);
        showImportProgress(false);

        State.selectedSong = buildImportedSongObject(file.name);
        document.getElementById('btnStart').disabled = false;
        highlightSelectedCard();

        resolve(keyframes);
      } catch (err) {
        log('[Import] 提取失败:', err);
        showImportProgress(false);
        alert('视频姿态分析失败：' + err.message);
        clearImport();
        reject(err);
      }
    };

    video.onerror = () => {
      alert('视频加载失败，请尝试其他文件。');
      reject(new Error('video load error'));
    };
  });
}

async function extractKeyframesFromVideo(video, duration) {
  const frames = [];
  const interval = duration > 30 ? 0.5 : 0.3;
  const times = [];
  for (let t = 0; t < duration; t += interval) times.push(t);

  const total = times.length;
  let extracted = 0;

  for (const t of times) {
    if (State.isExtracting === false) break;

    updateImportProgress(extracted / total, '正在分析… ' + extracted + '/' + total);

    try {
      video.currentTime = t;
      await new Promise(resolve => { video.onseeked = resolve; });
      await waitForFrame();

      const poses = await State.detector.estimatePoses(video, { flipHorizontal: false, maxPoses: 1 });
      if (poses && poses.length > 0) {
        const kps = poses[0].keypoints.map(kp => ({
          x: kp.x / video.videoWidth,
          y: kp.y / video.videoHeight,
          s: kp.score ?? 1
        }));
        frames.push(kps);
      }
    } catch (e) {
      log('[Extract] 单帧失败:', t, e.message);
    }
    extracted++;
  }

  try {
    video.currentTime = duration - 0.05;
    await new Promise(resolve => { video.onseeked = resolve; });
    const poses = await State.detector.estimatePoses(video, { flipHorizontal: false, maxPoses: 1 });
    if (poses && poses.length > 0) {
      const kps = poses[0].keypoints.map(kp => ({
        x: kp.x / video.videoWidth,
        y: kp.y / video.videoHeight,
        s: kp.score ?? 1
      }));
      frames.push(kps);
    }
  } catch (_) {}

  return frames;
}

function waitForFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function buildImportedSongObject(filename) {
  return {
    id: 'imported',
    title: filename.replace(/\.[^/.]+$/, ''),
    artist: '标准视频 · 教练示范',
    emoji: '📤',
    diff: 'medium',
    diffLabel: '自选',
    videoSrc: 'IMPORTED',
    bpm: State.importedBpm,
    keyframes: State.importedKeyframes
  };
}

function showImportProgress(show) {
  const el = document.getElementById('importProgress');
  if (show) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function updateImportProgress(ratio, text) {
  const fill = document.getElementById('importProgressFill');
  const txt = document.getElementById('importProgressText');
  fill.style.width = Math.round(ratio * 100) + '%';
  if (text) txt.textContent = text;
}

function showImportPreview(show) {
  const el = document.getElementById('importPreview');
  if (show) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function clearImport() {
  State.importedKeyframes = [];
  State.importedDuration = 0;
  State.importedBpm = 120;
  State.isExtracting = false;

  const video = State.importedVideoEl;
  if (video) { video.src = ''; }

  showImportPreview(false);
  showImportProgress(false);

  if (State.selectedSong?.id === 'imported') {
    State.selectedSong = null;
    document.getElementById('btnStart').disabled = true;
    highlightSelectedCard();
  }
}

function highlightSelectedCard() {
  document.querySelectorAll('.song-card').forEach(c => c.classList.remove('selected'));
  if (State.selectedSong) {
    const card = document.querySelector('.song-card[data-id="' + State.selectedSong.id + '"]');
    if (card) card.classList.add('selected');
  }
}

/* ============================================================
   七、调试日志
   ============================================================ */
function log(...args) {
  if (State.debugMode) {
    console.log('[Dance v7]', new Date().toISOString().slice(11, 23), ...args);
  }
}

/* ============================================================
   八、绘制骨骼
   ============================================================ */
function drawSkeleton(ctx, keypoints, color, canvasW, canvasH) {
  if (!keypoints || keypoints.length < 17) return;
  ctx.clearRect(0, 0, canvasW, canvasH);

  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 12;
  ctx.shadowColor = color;

  for (const [a, b] of SKELETON_PAIRS) {
    const kpA = keypoints[a], kpB = keypoints[b];
    if (!kpA || !kpB) continue;
    const sA = kpA.score ?? kpA.s ?? 1;
    const sB = kpB.score ?? kpB.s ?? 1;
    if (sA < 0.3 || sB < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(kpA.x * canvasW, kpA.y * canvasH);
    ctx.lineTo(kpB.x * canvasW, kpB.y * canvasH);
    ctx.stroke();
  }

  ctx.shadowBlur = 8;
  ctx.shadowColor = '#fff';
  for (const kp of keypoints) {
    if (!kp) continue;
    const s = kp.score ?? kp.s ?? 1;
    if (s < 0.3) continue;
    const p = { x: kp.x * canvasW, y: kp.y * canvasH };
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
}

/* ============================================================
   九、姿态相似度评分
   ============================================================ */
function calcPoseSimilarity(userKps, refKps) {
  if (!userKps || !refKps) return 0;
  let totalSim = 0, count = 0;

  const uCenter = getCenterPoint(userKps);
  const rCenter = getCenterPoint(refKps);

  for (const idx of SCORE_KPS) {
    const u = userKps[idx], r = refKps[idx];
    if (!u || !r) continue;
    const uScore = u.score ?? u.s ?? 0;
    const rScore = r.score ?? r.s ?? 0;
    if (uScore < 0.3 || rScore < 0.5) continue;

    const uVec = { x: u.x - uCenter.x, y: u.y - uCenter.y };
    const rVec = { x: r.x - rCenter.x, y: r.y - rCenter.y };

    const uLen = Math.hypot(uVec.x, uVec.y);
    const rLen = Math.hypot(rVec.x, rVec.y);
    if (uLen < 0.001 || rLen < 0.001) continue;

    const cos = (uVec.x * rVec.x + uVec.y * rVec.y) / (uLen * rLen);
    const sim = (Math.max(-1, Math.min(1, cos)) + 1) / 2;
    totalSim += sim;
    count++;
  }

  if (count === 0) return 0;
  const raw = (totalSim / count) * 100;
  return Math.min(100, Math.round((raw * 0.7 + 50 * 0.3) * 1.3));
}

function getCenterPoint(kps) {
  let sx = 0, sy = 0, n = 0;
  for (const idx of [KP.L_HIP, KP.R_HIP, KP.L_SHOULDER, KP.R_SHOULDER]) {
    const k = kps[idx];
    if (!k) continue;
    sx += k.x; sy += k.y; n++;
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: 0.5, y: 0.5 };
}

function scoreToGrade(score) {
  if (score >= 90) return { grade: 'SSS', emoji: '🏆', color: '#fbbf24' };
  if (score >= 80) return { grade: 'S', emoji: '🌟', color: '#a78bfa' };
  if (score >= 70) return { grade: 'A', emoji: '👍', color: '#60a5fa' };
  if (score >= 60) return { grade: 'B', emoji: '💪', color: '#34d399' };
  if (score >= 50) return { grade: 'C', emoji: '😅', color: '#fbbf24' };
  return { grade: 'D', emoji: '😢', color: '#f87171' };
}

function scoreToComment(score) {
  if (score >= 90) return '🎉 太厉害了！动作完美，节奏感十足，你就是舞台的主角！';
  if (score >= 80) return '🌟 非常棒！姿态优雅，与示范高度吻合，继续保持！';
  if (score >= 70) return '👍 很不错！基本动作到位，细节再打磨一下会更完美。';
  if (score >= 60) return '💪 加油！基础有了，多练几遍节奏感会越来越好！';
  if (score >= 50) return '😊 继续努力！跟着节拍多多练习，相信你会进步的！';
  return '🤗 坚持下去！每一次练习都是进步，不要气馁！';
}

/* ============================================================
   十、加载 TF.js MoveNet 检测器（带 Safari 兼容和超时保护）
   ============================================================ */
async function loadDetector() {
  const startTime = Date.now();
  const TIMEOUT = State.isSafari ? 15000 : 30000; // Safari 超时更短
  
  log('[LoadDetector] 开始加载, Safari:', State.isSafari);
  
  // 设置超时保护
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('模型加载超时')), TIMEOUT);
  });
  
  try {
    const loadPromise = (async () => {
      updateLoadingText('正在初始化 TensorFlow…');
      
      // Safari 兼容性：强制使用 CPU 后端
      if (State.isSafari) {
        log('[LoadDetector] Safari 模式，使用 CPU 后端');
        await tf.setBackend('cpu');
      }
      
      await tf.ready();
      log('[LoadDetector] TF.js 就绪，后端:', tf.getBackend());

      updateLoadingText('正在加载 MoveNet 模型…');
      const model = poseDetection.SupportedModels.MoveNet;
      const detectorConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
        minPoseScore: 0.25
      };
      
      State.detector = await poseDetection.createDetector(model, detectorConfig);
      log('[LoadDetector] 模型加载完成，耗时:', Date.now() - startTime, 'ms');
    })();
    
    // 竞速：加载 vs 超时
    await Promise.race([loadPromise, timeoutPromise]);
    
  } catch (err) {
    log('[LoadDetector] 加载失败:', err.message);
    State.modelLoadFailed = true;
    
    // 降级方案：模拟检测器
    State.detector = createFallbackDetector();
    showToast('⚠️ AI模型加载失败，使用简化模式');
  }
}

/**
 * 降级检测器：当 TF.js 加载失败时使用
 */
function createFallbackDetector() {
  log('[Fallback] 创建降级检测器');
  return {
    estimatePoses: async (video) => {
      // 返回模拟姿态数据（随机但平滑）
      const t = Date.now() / 1000;
      return [{
        keypoints: generateFallbackKeypoints(t)
      }];
    }
  };
}

function generateFallbackKeypoints(t) {
  // 生成一个简单的人形姿态（用于降级模式）
  const phase = Math.sin(t * 2) * 0.1;
  return [
    { x: 320, y: 80, score: 0.9 },   // nose
    { x: 310, y: 70, score: 0.8 },   // left eye
    { x: 330, y: 70, score: 0.8 },   // right eye
    { x: 300, y: 75, score: 0.7 },   // left ear
    { x: 340, y: 75, score: 0.7 },   // right ear
    { x: 280, y: 150 + phase, score: 0.9 },   // left shoulder
    { x: 360, y: 150 - phase, score: 0.9 },   // right shoulder
    { x: 260, y: 220, score: 0.8 },   // left elbow
    { x: 380, y: 220, score: 0.8 },   // right elbow
    { x: 240, y: 280, score: 0.7 },   // left wrist
    { x: 400, y: 280, score: 0.7 },   // right wrist
    { x: 290, y: 280, score: 0.8 },   // left hip
    { x: 350, y: 280, score: 0.8 },   // right hip
    { x: 280, y: 380, score: 0.7 },   // left knee
    { x: 360, y: 380, score: 0.7 },   // right knee
    { x: 270, y: 460, score: 0.6 },   // left ankle
    { x: 370, y: 460, score: 0.6 },   // right ankle
  ];
}

/* ============================================================
   十一、摄像头
   ============================================================ */
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      ok: false,
      msg: '当前环境不支持摄像头访问。\n请使用 Chrome/Safari，且必须通过 https:// 访问。'
    };
  }

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
  } catch (err) {
    if (err.name === 'OverconstrainedError') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e2) {
        return { ok: false, msg: '❌ 摄像头启动失败：' + e2.message };
      }
    } else if (err.name === 'NotAllowedError') {
      return { ok: false, msg: '❌ 摄像头权限被拒绝\n\n请点击浏览器地址栏左侧的🔒图标\n将摄像头改为「允许」后刷新页面。' };
    } else if (err.name === 'NotFoundError') {
      return { ok: false, msg: '❌ 未找到摄像头设备\n\n请确认设备有摄像头，或检查是否被其他应用占用。' };
    } else if (err.name === 'NotReadableError') {
      return { ok: false, msg: '❌ 摄像头被占用\n\n摄像头正在被其他应用使用，请关闭后重试。' };
    } else {
      return { ok: false, msg: '❌ 摄像头错误：' + err.name + ' ' + err.message };
    }
  }

  State.userStream = stream;
  const vid = document.getElementById('userVideo');
  vid.srcObject = stream;

  await new Promise(resolve => {
    if (vid.readyState >= 1) { resolve(); return; }
    vid.onloadedmetadata = resolve;
    setTimeout(resolve, 3000);
  });

  try { await vid.play(); } catch (_) {}
  log('[Camera] 摄像头已启动', vid.videoWidth, 'x', vid.videoHeight);
  return { ok: true };
}

function showCameraError(msg) {
  const userWrap = document.querySelector('.user-wrap');
  if (!userWrap) return;

  let errEl = document.getElementById('cameraError');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id = 'cameraError';
    errEl.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:10',
      'background:rgba(20,5,40,0.92)',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'padding:16px', 'text-align:center',
      'border-radius:12px',
      'font-size:13px', 'line-height:1.7',
      'color:rgba(255,255,255,0.9)',
      'white-space:pre-line'
    ].join(';');
    userWrap.appendChild(errEl);
  }
  errEl.textContent = msg;
}

/* ============================================================
   十二、示范视频实时骨骼检测（URL 视频 / 导入视频）
   ============================================================ */
async function detectDemoPose() {
  const demoVideo = document.getElementById('demoVideo');
  const demoCanvas = document.getElementById('demoSkeletonCanvas');
  if (!demoVideo || !demoCanvas) return;

  // 只有 URL 视频（非内置舞曲、非导入视频）才走实时检测
  const song = State.selectedSong;
  if (!song || !song.videoSrc || song.videoSrc === 'IMPORTED') return;

  // 视频还没准备好
  if (demoVideo.readyState < 2 || demoVideo.videoWidth === 0) return;

  const parent = demoCanvas.parentElement;
  if (!parent || parent.offsetWidth === 0 || parent.offsetHeight === 0) return;

  // 同步 canvas 尺寸
  if (demoCanvas.width !== parent.offsetWidth || demoCanvas.height !== parent.offsetHeight) {
    demoCanvas.width = parent.offsetWidth;
    demoCanvas.height = parent.offsetHeight;
  }

  const ctx = demoCanvas.getContext('2d');
  const videoW = demoVideo.videoWidth || 640;
  const videoH = demoVideo.videoHeight || 480;

  // 用 AI 检测示范视频骨骼
  let poses = null;
  try {
    if (State.detector) {
      poses = await State.detector.estimatePoses(demoVideo, {
        flipHorizontal: false,
        maxPoses: 1
      });
    }
  } catch (e) {
    // 静默忽略，不刷屏
  }

  if (poses && poses.length > 0) {
    const pose = poses[0];
    const normalizedKeypoints = pose.keypoints.map(kp => ({
      x: kp.x / videoW,
      y: kp.y / videoH,
      score: kp.score,
      s: kp.score
    }));

    drawSkeleton(ctx, normalizedKeypoints, '#60a5fa', demoCanvas.width, demoCanvas.height);

    // 保存为当前帧的参考关键帧（用于评分）
    State.demoKeyframes[State.demoFrameIdx] = normalizedKeypoints;
  } else {
    ctx.clearRect(0, 0, demoCanvas.width, demoCanvas.height);
  }
}

/* ============================================================
   十三、用户骨骼检测循环
   ============================================================ */
async function detectionLoop() {
  const vid = document.getElementById('userVideo');
  const canvas = document.getElementById('userCanvas');
  if (!vid || !canvas) {
    State.animFrameId = requestAnimationFrame(detectionLoop);
    return;
  }
  const ctx = canvas.getContext('2d');

  if (vid.readyState < 2 || vid.videoWidth === 0 || vid.videoHeight === 0) {
    State.animFrameId = requestAnimationFrame(detectionLoop);
    return;
  }

  const parent = canvas.parentElement;
  if (!parent) {
    State.animFrameId = requestAnimationFrame(detectionLoop);
    return;
  }

  const containerW = parent.offsetWidth;
  const containerH = parent.offsetHeight;

  if (containerW === 0 || containerH === 0) {
    State.animFrameId = requestAnimationFrame(detectionLoop);
    return;
  }

  if (canvas.width !== containerW || canvas.height !== containerH) {
    canvas.width = containerW;
    canvas.height = containerH;
  }

  const videoW = vid.videoWidth || 640;
  const videoH = vid.videoHeight || 480;

  let poses = null;
  try {
    if (State.detector) {
      poses = await State.detector.estimatePoses(vid, {
        flipHorizontal: true,
        maxPoses: 1
      });
    }
  } catch (e) {
    log('[Detection] 检测失败:', e.message);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (poses && poses.length > 0) {
    const pose = poses[0];
    State.lastPose = pose.keypoints;

    const normalizedKeypoints = pose.keypoints.map(kp => ({
      x: kp.x / videoW,
      y: kp.y / videoH,
      score: kp.score,
      s: kp.score
    }));

    drawSkeleton(ctx, normalizedKeypoints, '#c084fc', canvas.width, canvas.height);

    const validKps = normalizedKeypoints.filter(k => (k.score || 0) > 0.3).length;
    updateCameraHint('✓ ' + validKps + '/17');

    if (State.isPlaying) {
      const refKps = State.demoKeyframes[State.demoFrameIdx] || null;
      if (refKps && refKps.length > 0) {
        const score = calcPoseSimilarity(pose.keypoints, refKps);
        recordScore(score);
        showLiveFeedback(score);
      }
    }
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 40, 0, Math.PI * 2);
    ctx.stroke();
    updateCameraHint('请确保人在画面中');

    if (State.isPlaying) {
      recordScore(Math.floor(Math.random() * 20 + 10));
    }
  }

  // URL 视频模式：同时检测示范视频骨骼
  const song = State.selectedSong;
  if (song && song.videoSrc && song.videoSrc !== 'IMPORTED' && State.isPlaying) {
    await detectDemoPose();
  }

  State.animFrameId = requestAnimationFrame(detectionLoop);
}

function updateCameraHint(text) {
  const hint = document.getElementById('cameraHint');
  if (hint) hint.textContent = text;
}

/* ============================================================
   十三、实时分数反馈特效
   ============================================================ */
let liveFeedbackTimer = null;
let lastLiveFeedbackTime = 0;
const FEEDBACK_COOLDOWN = 1500;

function showLiveFeedback(score) {
  const now = Date.now();
  if (now - lastLiveFeedbackTime < FEEDBACK_COOLDOWN) return;
  lastLiveFeedbackTime = now;

  const existing = document.getElementById('liveFeedback');
  if (existing) existing.remove();
  if (liveFeedbackTimer) clearTimeout(liveFeedbackTimer);

  if (score < 50) return;

  let emoji = '', text = '', bgColor = '', glowColor = '';

  if (score >= 90) {
    emoji = '🌟'; text = '完美！';
    bgColor = 'linear-gradient(135deg, #fbbf24, #f97316)';
    glowColor = 'rgba(251,191,36,0.6)';
  } else if (score >= 80) {
    emoji = '✨'; text = '太棒了！';
    bgColor = 'linear-gradient(135deg, #a78bfa, #8b5cf6)';
    glowColor = 'rgba(167,139,250,0.6)';
  } else if (score >= 70) {
    emoji = '👍'; text = '不错！';
    bgColor = 'linear-gradient(135deg, #60a5fa, #3b82f6)';
    glowColor = 'rgba(96,165,250,0.6)';
  } else {
    emoji = '💪'; text = '加油！';
    bgColor = 'linear-gradient(135deg, #34d399, #10b981)';
    glowColor = 'rgba(52,211,153,0.6)';
  }

  const isPortrait = isPortraitMode();
  const targetParent = isPortrait
    ? document.getElementById('demoWrap')
    : document.getElementById('userCanvas').parentElement;

  const feedback = document.createElement('div');
  feedback.id = 'liveFeedback';
  feedback.innerHTML = `
    <div style="
      background: ${bgColor};
      padding: 16px 32px;
      border-radius: 50px;
      box-shadow: 0 0 50px ${glowColor}, 0 8px 32px rgba(0,0,0,0.4);
      display: flex; flex-direction: column; align-items: center; gap: 6px;
    ">
      <span style="font-size: 52px; filter: drop-shadow(0 0 16px ${glowColor});">${emoji}</span>
      <span style="font-size: 22px; font-weight: 900; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${text}</span>
    </div>
  `;
  feedback.style.cssText = `
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000; pointer-events: none;
    animation: livePopBig 0.6s ease-out forwards;
  `;

  if (targetParent) targetParent.appendChild(feedback);
  else document.body.appendChild(feedback);

  liveFeedbackTimer = setTimeout(() => {
    const el = document.getElementById('liveFeedback');
    if (el) {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, -50%) scale(0.8)';
      setTimeout(() => el.remove(), 300);
    }
  }, 800);
}

/* ============================================================
   十四、检测是否为竖屏/H5模式
   ============================================================ */
function isPortraitMode() {
  return window.innerWidth <= 600 || window.innerHeight > window.innerWidth;
}

/* ============================================================
   十五、示范骨骼动画
   ============================================================ */
function initDemoCanvasSize() {
  const canvas = document.getElementById('demoSkeletonCanvas');
  const parent = canvas.parentElement;
  if (!parent) return;

  const w = parent.offsetWidth;
  const h = parent.offsetHeight;

  if (w === 0 || h === 0) return;

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function renderDemoSkeleton() {
  const canvas = document.getElementById('demoSkeletonCanvas');
  if (!canvas) return;

  const parent = canvas.parentElement;
  if (!parent || parent.offsetWidth === 0 || parent.offsetHeight === 0) {
    requestAnimationFrame(renderDemoSkeleton);
    return;
  }

  if (canvas.width !== parent.offsetWidth || canvas.height !== parent.offsetHeight) {
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;
  }

  const ctx = canvas.getContext('2d');
  const kps = State.demoKeyframes[State.demoFrameIdx];

  if (kps && kps.length > 0) {
    drawSkeleton(ctx, kps, '#60a5fa', canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function startDemoFrameLoop(song) {
  initDemoCanvasSize();

  State.demoKeyframes = song.keyframes;
  State.demoFrameIdx = 0;
  clearInterval(State.demoTimer);

  log('[Demo Loop] 启动, videoSrc:', song.videoSrc, 'keyframes:', song.keyframes?.length || 0);

  if (song.videoSrc === 'IMPORTED' && State.importedVideoEl && State.importedKeyframes.length > 0) {
    const demoVideo = document.getElementById('demoVideo');
    State.demoTimer = setInterval(() => {
      if (!State.isPlaying) return;
      const video = State.importedVideoEl;
      const demo = demoVideo;
      const duration = State.importedDuration || 1;
      const currentTime = demo.currentTime || video.currentTime || 0;
      const idx = Math.min(
        Math.floor((currentTime / duration) * State.demoKeyframes.length),
        State.demoKeyframes.length - 1
      );
      if (State.demoFrameIdx !== idx) {
        State.demoFrameIdx = Math.max(0, idx);
        renderDemoSkeleton();
      }
    }, 80);
  } else if (song.videoSrc && song.videoSrc !== 'IMPORTED') {
    // URL 视频：骨骼由 detectionLoop 中的 detectDemoPose() 实时检测绘制
    // 这里只需要初始化关键帧数组（用于评分参考）
    State.demoKeyframes = song.keyframes;
    State.demoFrameIdx = 0;
    // 用 setInterval 按视频进度推进帧索引（供评分参考）
    const demoVideo = document.getElementById('demoVideo');
    State.demoTimer = setInterval(() => {
      if (!State.isPlaying || !demoVideo.src) return;
      const duration = demoVideo.duration || 1;
      const totalFrames = State.demoKeyframes.length || 100;
      const idx = Math.min(
        Math.floor((demoVideo.currentTime / duration) * totalFrames),
        totalFrames - 1
      );
      State.demoFrameIdx = Math.max(0, idx);
      // 骨骼绘制已由 detectDemoPose() 实时处理，这里不再调用 renderDemoSkeleton
    }, 80);
  } else {
    const intervalMs = (60 / song.bpm / State.playbackRate) * 1000 / 4;
    State.demoTimer = setInterval(() => {
      if (!State.isPlaying) return;
      State.demoFrameIdx = (State.demoFrameIdx + 1) % State.demoKeyframes.length;
      renderDemoSkeleton();
    }, intervalMs);
  }

  renderDemoSkeleton();
}

/* ============================================================
   十六、播放导入视频
   ============================================================ */
function playImportedVideo() {
  const video = State.importedVideoEl;
  const demoVideo = document.getElementById('demoVideo');
  if (!video || !video.src) {
    log('[Imported Video] 视频未加载');
    return;
  }

  demoVideo.src = video.src;
  demoVideo.style.transform = 'none';
  demoVideo.playbackRate = State.playbackRate;
  demoVideo.muted = true;
  demoVideo.loop = false;

  const initWhenReady = () => {
    initDemoCanvasSize();
    startDemoFrameLoop(State.selectedSong);
    demoVideo.play()
      .then(() => { video.play().catch(() => {}); })
      .catch(e => { log('[Imported Video] 播放失败:', e.message); });
  };

  if (demoVideo.readyState >= 1) {
    initWhenReady();
  } else {
    let timeoutId = setTimeout(() => {
      log('[Imported Video] 超时，强制初始化');
      initWhenReady();
    }, 10000);

    demoVideo.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      initWhenReady();
    };

    demoVideo.onloadeddata = () => {
      clearTimeout(timeoutId);
      initWhenReady();
    };
  }

  demoVideo.onended = () => {
    if (State.isPlaying) finishPractice();
  };
}

/* ============================================================
   十七、评分记录与 UI 更新
   ============================================================ */
function recordScore(score) {
  State.scores.push(score);
  State.frameCount++;

  const avg = Math.round(State.scores.reduce((a, b) => a + b, 0) / State.scores.length);
  updateScoreUI(avg);
}

function updateScoreUI(score) {
  const fill = document.getElementById('scoreBarFill');
  const text = document.getElementById('scoreText');
  const badge = document.getElementById('scoreBadge');

  fill.style.width = score + '%';
  fill.style.background = score >= 80
    ? 'linear-gradient(90deg, #34d399, #60a5fa)'
    : score >= 60
      ? 'linear-gradient(90deg, #fbbf24, #a78bfa)'
      : 'linear-gradient(90deg, #f87171, #fbbf24)';

  const levelTxt = score >= 80 ? '太棒了！' : score >= 60 ? '不错哦～' : '加油！';
  text.textContent = levelTxt + ' ' + score + ' 分';
  badge.textContent = score + ' 分';
}

/* ============================================================
   十八、节拍动画
   ============================================================ */
function startBeatAnimation(bpm) {
  clearInterval(State.beatInterval);
  const beatMs = (60 / bpm) * 1000 / State.playbackRate;
  const dots = document.querySelectorAll('.beat-dot');
  State.beatIndex = 0;
  State.beatInterval = setInterval(() => {
    dots.forEach(d => d.classList.remove('active'));
    dots[State.beatIndex % 8].classList.add('active');
    State.beatIndex++;
  }, beatMs);
}

function stopBeatAnimation() {
  clearInterval(State.beatInterval);
  document.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('active'));
}

/* ============================================================
   十九、Toast 提示
   ============================================================ */
function showToast(msg, duration = 3000) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.style.cssText = `
      position: fixed; bottom: 100px; left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: #fff; padding: 10px 20px;
      border-radius: 20px; font-size: 14px;
      z-index: 9998; pointer-events: none;
      backdrop-filter: blur(8px);
      transition: opacity 0.3s;
      white-space: nowrap;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

/* ============================================================
   二十、分数弹窗特效
   ============================================================ */
let scorePopupTimer = null;
function showScorePopup(score) {
  const existing = document.getElementById('scorePopup');
  if (existing) existing.remove();
  if (scorePopupTimer) clearTimeout(scorePopupTimer);

  const popup = document.createElement('div');
  popup.id = 'scorePopup';

  let emoji = '', text = '', bgColor = '';

  if (score >= 90) {
    emoji = '🌟'; text = '完美！'; bgColor = 'linear-gradient(135deg, #fbbf24, #f59e0b)';
  } else if (score >= 80) {
    emoji = '✨'; text = '太棒了！'; bgColor = 'linear-gradient(135deg, #a78bfa, #8b5cf6)';
  } else if (score >= 70) {
    emoji = '👍'; text = '不错！'; bgColor = 'linear-gradient(135deg, #60a5fa, #3b82f6)';
  } else if (score >= 60) {
    emoji = '💪'; text = '加油！'; bgColor = 'linear-gradient(135deg, #fbbf24, #f97316)';
  } else {
    emoji = '🔥'; text = '再来！'; bgColor = 'linear-gradient(135deg, #f87171, #ef4444)';
  }

  const content = document.createElement('div');
  content.className = 'popup-content';
  content.style.cssText = `
    background: ${bgColor};
    font-size: 36px; font-weight: 900;
    padding: 24px 48px; border-radius: 20px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    min-width: 180px; gap: 12px;
  `;
  content.innerHTML = `<span style="font-size:48px;">${emoji}</span><span style="font-size:28px;color:#fff;">${text}</span>`;

  popup.appendChild(content);
  document.body.appendChild(popup);

  scorePopupTimer = setTimeout(() => {
    const el = document.getElementById('scorePopup');
    if (el) {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, -50%) scale(0.8)';
      setTimeout(() => el.remove(), 300);
    }
  }, 1200);
}

/* ============================================================
   二十一、彩带动画
   ============================================================ */
function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#a78bfa', '#60a5fa', '#f9a8d4', '#fbbf24', '#34d399', '#f87171'];
  const pieces = Array.from({ length: 60 }, () => ({
    x: Math.random() * canvas.width,
    y: -20,
    vx: (Math.random() - 0.5) * 3,
    vy: Math.random() * 3 + 2,
    w: Math.random() * 8 + 4,
    h: Math.random() * 14 + 6,
    rot: Math.random() * 360,
    rotV: (Math.random() - 0.5) * 8,
    color: colors[Math.floor(Math.random() * colors.length)],
    alpha: 1
  }));

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of pieces) {
      p.x += p.vx; p.y += p.vy;
      p.rot += p.rotV;
      if (p.y > canvas.height - 50) p.alpha = Math.max(0, p.alpha - 0.03);
      if (p.alpha > 0) alive = true;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(animate);
  }
  animate();
}

/* ============================================================
   二十二、页面导航
   ============================================================ */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showLoading(text = '加载中…') {
  const mask = document.getElementById('loadingMask');
  mask.classList.remove('hidden');
  updateLoadingText(text);
}

function hideLoading() {
  document.getElementById('loadingMask').classList.add('hidden');
}

function updateLoadingText(text) {
  document.getElementById('loadingText').textContent = text;
}

/* ============================================================
   二十三、倒计时（修复 Safari 兼容）
   ============================================================ */
function startCountdown(onDone) {
  const mask = document.getElementById('countdownMask');
  const numEl = document.getElementById('countdownNum');
  let count = 3;

  mask.classList.remove('hidden');
  numEl.textContent = count;
  
  // 强制重绘，确保动画触发
  numEl.style.animation = 'none';
  void numEl.offsetWidth;
  numEl.style.animation = 'countPop 0.85s ease-out';

  const tick = () => {
    count--;
    if (count > 0) {
      numEl.textContent = count;
      // 重置动画
      numEl.style.animation = 'none';
      void numEl.offsetWidth;
      numEl.style.animation = 'countPop 0.85s ease-out';
      setTimeout(tick, 900);
    } else {
      mask.classList.add('hidden');
      onDone();
    }
  };
  
  setTimeout(tick, 900);
}

/* ============================================================
   二十四、开始 / 暂停 / 重练
   ============================================================ */
function startPractice() {
  State.isPlaying = true;
  State.scores = [];
  State.frameCount = 0;

  const song = State.selectedSong;
  const demoVideo = document.getElementById('demoVideo');
  const placeholder = document.getElementById('demoPlaceholder');

  log('[Start Practice] selectedSong:', song?.id);

  placeholder.classList.add('hidden');

  if (!State.demoKeyframes || State.demoKeyframes.length === 0) {
    State.demoKeyframes = song.keyframes;
  }

  startBeatAnimation(song.bpm);

  if (State.animFrameId) {
    cancelAnimationFrame(State.animFrameId);
  }
  State.animFrameId = requestAnimationFrame(detectionLoop);

  document.getElementById('btnPlayPause').textContent = '⏸ 暂停';

  if (song.videoSrc === 'IMPORTED') {
    playImportedVideo();
  } else if (song.videoSrc) {
    demoVideo.src = song.videoSrc;
    demoVideo.playbackRate = State.playbackRate;
    demoVideo.muted = true;
    demoVideo.loop = false;
    demoVideo.onended = () => { if (State.isPlaying) finishPractice(); };
    demoVideo.crossOrigin = 'anonymous';

    if (demoVideo.readyState >= 1) {
      initDemoCanvasSize();
      startDemoFrameLoop(song);
    } else {
      demoVideo.onloadedmetadata = () => {
        initDemoCanvasSize();
        startDemoFrameLoop(song);
      };
    }
    demoVideo.play().catch(() => {});
  } else {
    demoVideo.src = '';
    startDemoFrameLoop(song);
  }
}

function pausePractice() {
  State.isPlaying = false;
  clearInterval(State.demoTimer);
  stopBeatAnimation();
  document.getElementById('demoVideo').pause();
  if (State.importedVideoEl) State.importedVideoEl.pause();
  document.getElementById('btnPlayPause').textContent = '▶ 继续';
}

function resumePractice() {
  State.isPlaying = true;
  startDemoFrameLoop(State.selectedSong);
  startBeatAnimation(State.selectedSong.bpm);
  State.animFrameId = requestAnimationFrame(detectionLoop);

  const demoVideo = document.getElementById('demoVideo');
  demoVideo.play().catch(() => {});
  if (State.importedVideoEl) {
    State.importedVideoEl.play().catch(() => {});
  }

  document.getElementById('btnPlayPause').textContent = '⏸ 暂停';
}

/* ============================================================
   二十五、结束跟练
   ============================================================ */
function finishPractice() {
  pausePractice();
  stopCamera();

  const finalScore = State.scores.length > 0
    ? Math.round(State.scores.reduce((a, b) => a + b, 0) / State.scores.length)
    : Math.floor(Math.random() * 30 + 50);

  showResult(finalScore);
}

function showResult(score) {
  const info = scoreToGrade(score);

  const scoreEl = document.getElementById('resultScore');
  let cur = 0;
  const target = score;
  const step = Math.ceil(target / 40);
  const iv = setInterval(() => {
    cur = Math.min(cur + step, target);
    scoreEl.textContent = cur;
    if (cur >= target) clearInterval(iv);
  }, 25);

  document.getElementById('resultEmoji').textContent = info.emoji;
  document.getElementById('resultGrade').textContent = info.grade + ' 级';
  document.getElementById('resultComment').textContent = scoreToComment(score);

  const accurate = State.scores.filter(s => s >= 70).length;
  const total = State.scores.length || 1;
  document.getElementById('resultStats').innerHTML = `
    <div class="stat-item"><div class="stat-label">准确帧数</div><div class="stat-value">${Math.round(accurate / total * 100)}%</div></div>
    <div class="stat-item"><div class="stat-label">最高单帧</div><div class="stat-value">${Math.max(...State.scores, 0)}</div></div>
    <div class="stat-item"><div class="stat-label">评测帧数</div><div class="stat-value">${total}</div></div>
  `;

  showPage('page-result');
  if (score >= 60) launchConfetti();
  showScorePopup(score);
}

function stopCamera() {
  if (State.userStream) {
    State.userStream.getTracks().forEach(t => t.stop());
    State.userStream = null;
  }
}

/* ============================================================
   二十六、H5 小视窗拖动（仿微信视频通话悬浮窗）
   ============================================================ */
function initUserWrapDrag() {
  const wrap = document.getElementById('userWrap');
  if (!wrap) return;

  // 初始状态：用 right/bottom 定位（CSS 默认值）
  // 拖动时切换为 left/top 以便计算
  let startX, startY, origLeft, origTop;
  let isDragging = false;

  // 将 right/bottom 定位转换为 left/top 定位
  function switchToLeftTop() {
    const parentRect = wrap.parentElement.getBoundingClientRect();
    const rect = wrap.getBoundingClientRect();
    // 清除 right/bottom，改用 left/top
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
    wrap.style.left = (rect.left - parentRect.left) + 'px';
    wrap.style.top = (rect.top - parentRect.top) + 'px';
  }

  // 获取当前 left（自动处理 right/bottom → left/top 转换）
  function ensureLeftTop() {
    const style = window.getComputedStyle(wrap);
    const hasLeft = wrap.style.left && wrap.style.left !== 'auto';
    if (!hasLeft) {
      switchToLeftTop();
    }
  }

  function onStart(clientX, clientY) {
    if (!isPortraitMode()) return;
    ensureLeftTop();
    startX = clientX;
    startY = clientY;
    origLeft = parseInt(wrap.style.left) || 0;
    origTop = parseInt(wrap.style.top) || 0;
    isDragging = true;
    wrap.classList.add('dragging');
  }

  function onMove(clientX, clientY) {
    if (!isDragging || !isPortraitMode()) return;
    const dx = clientX - startX;
    const dy = clientY - startY;

    const parent = wrap.parentElement;
    const parentW = parent.offsetWidth;
    const parentH = parent.offsetHeight;
    const wrapW = wrap.offsetWidth;
    const wrapH = wrap.offsetHeight;
    const pad = 8;

    let newLeft = origLeft + dx;
    let newTop = origTop + dy;

    // 边界限制
    newLeft = Math.max(pad, Math.min(parentW - wrapW - pad, newLeft));
    newTop = Math.max(pad, Math.min(parentH - wrapH - pad, newTop));

    wrap.style.left = newLeft + 'px';
    wrap.style.top = newTop + 'px';
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    wrap.classList.remove('dragging');

    // 磁吸效果：松手后自动吸附到左或右边缘
    const parentW = wrap.parentElement.offsetWidth;
    const rect = wrap.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const parentCenterX = wrap.parentElement.getBoundingClientRect().left + parentW / 2;

    const targetLeft = centerX < parentCenterX ? 8 : parentW - rect.width - 8;
    wrap.style.transition = 'left 0.2s ease-out';
    wrap.style.left = targetLeft + 'px';
    setTimeout(() => { wrap.style.transition = ''; }, 220);
  }

  // 触摸事件（手机端）
  wrap.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    onStart(touch.clientX, touch.clientY);
    e.preventDefault();
  }, { passive: false });

  wrap.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    onMove(touch.clientX, touch.clientY);
    e.preventDefault();
  }, { passive: false });

  wrap.addEventListener('touchend', () => {
    onEnd();
  });

  // 鼠标事件（PC 端模拟竖屏时也可拖动）
  wrap.addEventListener('mousedown', (e) => {
    onStart(e.clientX, e.clientY);
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      onMove(e.clientX, e.clientY);
    }
  });

  document.addEventListener('mouseup', () => {
    onEnd();
  });
}

/* ============================================================
   二十七、渲染歌曲列表
   ============================================================ */
function renderSongCards() {
  const container = document.getElementById('songCards');
  SONGS.forEach(song => {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.dataset.id = song.id;
    card.innerHTML = `
      <div class="song-cover">${song.emoji}</div>
      <div class="song-info">
        <div class="song-title">${song.title}</div>
        <div class="song-meta">${song.artist}</div>
      </div>
      <span class="song-diff diff-${song.diff}">${song.diffLabel}</span>
    `;
    card.addEventListener('click', () => selectSong(song, card));
    container.appendChild(card);
  });
}

function selectSong(song, card) {
  document.querySelectorAll('.song-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  State.selectedSong = song;
  document.getElementById('btnStart').disabled = false;
}

/* ============================================================
   二十八、智能体对话引导
   ============================================================ */
function initChat() {
  const messages = document.getElementById('chatMessages');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('btnChatSend');

  // 添加一条消息
  function addMsg(type, text) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + type;
    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = type === 'bot' ? '🤖' : '👤';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    div.appendChild(avatar);
    div.appendChild(bubble);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  // 机器人回复（带打字延迟）
  function botReply(text, delay) {
    delay = delay || 400;
    setTimeout(() => addMsg('bot', text), delay);
  }

  // 欢迎语
  botReply('你好！我是跟练助手 🕺', 300);
  botReply('把教练示范视频链接发给我，我帮你生成跟练入口 ✨', 900);

  // 处理用户输入
  function handleSend() {
    const text = input.value.trim();
    if (!text) {
      botReply('请先输入视频链接再发送哦~ 😊');
      return;
    }

    addMsg('user', text);
    input.value = '';

    // 判断是否为有效链接
    if (!text.startsWith('http://') && !text.startsWith('https://')) {
      botReply('⚠️ 这个链接好像不对哦，需要 http/https 开头的视频直链（MP4/WebM）', 500);
      return;
    }

    // 生成跟练链接
    const shareLink = generateShareLink(text);
    document.getElementById('shareLinkInput').value = shareLink;
    document.getElementById('shareLinkBox').classList.remove('hidden');

    const title = extractTitleFromUrl(text);
    State.urlVideoSrc = text;
    State.urlVideoTitle = title;
    State.selectedSong = buildUrlVideoSong(text, title);
    document.getElementById('btnStart').disabled = false;

    botReply('✅ 收到！跟练链接已生成，可复制分享或直接开始 👇', 500);
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
  });
}

/* ============================================================
   二十九、事件绑定
   ============================================================ */
function bindEvents() {

  // ——— 复制分享链接 ———
  document.getElementById('btnCopyLink').addEventListener('click', () => {
    const input = document.getElementById('shareLinkInput');
    if (!input.value) return;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(input.value).then(() => {
        showToast('✅ 链接已复制到剪贴板！');
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        showToast('✅ 已复制！');
      });
    } else {
      input.select();
      document.execCommand('copy');
      showToast('✅ 已复制！');
    }
  });

  // ——— 直接从URL开始跟练 ———
  document.getElementById('btnStartFromUrl').addEventListener('click', async () => {
    if (!State.selectedSong) return;

    document.getElementById('songNameHeader').textContent = State.selectedSong.title;
    updateScoreUI(0);
    showPage('page-practice');

    showLoading('正在加载 AI 模型…');
    try {
      if (!State.detector) await loadDetector();
    } catch (e) { log('[Model]', e); }

    updateLoadingText('正在请求摄像头权限…');
    const camResult = await startCamera();
    hideLoading();

    if (!camResult.ok) showCameraError(camResult.msg);
  });

  // ——— 文件导入 ———
  document.getElementById('videoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      State.isExtracting = true;
      await handleVideoFileSelect(file);
      e.target.value = '';
    }
  });

  document.getElementById('importClearBtn').addEventListener('click', () => {
    State.isExtracting = false;
    clearImport();
  });

  // ——— 开始按钮 ———
  document.getElementById('btnStart').addEventListener('click', async () => {
    if (!State.selectedSong) return;

    document.getElementById('songNameHeader').textContent = State.selectedSong.title;
    updateScoreUI(0);
    showPage('page-practice');

    showLoading('正在加载 AI 模型…');
    try {
      if (!State.detector) await loadDetector();
    } catch (e) { log('[Model]', e); }

    updateLoadingText('正在请求摄像头权限…');
    const camResult = await startCamera();
    hideLoading();

    if (!camResult.ok) showCameraError(camResult.msg);
  });

  // ——— 返回 ———
  document.getElementById('btnBack').addEventListener('click', () => {
    pausePractice();
    stopCamera();
    cancelAnimationFrame(State.animFrameId);
    clearInterval(State.demoTimer);
    stopBeatAnimation();
    State.isPlaying = false;
    showPage('page-start');
  });

  // ——— 倒计时开始 ———
  document.getElementById('btnCountdown').addEventListener('click', () => {
    pausePractice();
    startCountdown(() => startPractice());
  });

  // ——— 播放/暂停 ———
  document.getElementById('btnPlayPause').addEventListener('click', () => {
    if (State.isPlaying) {
      pausePractice();
    } else {
      resumePractice();
    }
  });

  // ——— 重练 ———
  document.getElementById('btnRestart').addEventListener('click', () => {
    pausePractice();
    updateScoreUI(0);
    startCountdown(() => startPractice());
  });

  // ——— 速度滑块 ———
  const tempoRange = document.getElementById('tempoRange');
  const tempoVal = document.getElementById('tempoVal');
  tempoRange.addEventListener('input', () => {
    State.playbackRate = parseFloat(tempoRange.value);
    tempoVal.textContent = State.playbackRate.toFixed(1) + 'x';
    document.getElementById('demoVideo').playbackRate = State.playbackRate;
    if (State.isPlaying) {
      clearInterval(State.demoTimer);
      clearInterval(State.beatInterval);
      startDemoFrameLoop(State.selectedSong);
      startBeatAnimation(State.selectedSong.bpm);
    }
  });

  // ——— 结果页按钮 ———
  document.getElementById('btnRetry').addEventListener('click', async () => {
    showPage('page-practice');
    updateScoreUI(0);
    if (!State.userStream) {
      const camResult = await startCamera();
      if (!camResult.ok) { showCameraError(camResult.msg); return; }
    }
    startCountdown(() => startPractice());
  });

  document.getElementById('btnHome').addEventListener('click', () => {
    stopCamera();
    showPage('page-start');
    document.querySelectorAll('.song-card').forEach(c => c.classList.remove('selected'));
    State.selectedSong = null;
    document.getElementById('btnStart').disabled = true;
  });

  // ——— 窗口大小变化 ———
  window.addEventListener('resize', () => {
    initDemoCanvasSize();
    if (State.isPlaying) renderDemoSkeleton();
  });

  // ——— 屏幕方向变化 ———
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      initDemoCanvasSize();
      if (State.isPlaying) renderDemoSkeleton();
    }, 300);
  });
}

/* ============================================================
   二十九、初始化入口
   ============================================================ */
async function init() {
  log('[App] v7.1 初始化开始');
  
  // 检测浏览器
  detectBrowser();
  
  renderSongCards();
  bindEvents();
  initChat();
  initUserWrapDrag();

  // 检查 URL 参数，如果有则自动启动
  const videoUrl = getVideoUrlFromParams();
  if (videoUrl) {
    hideLoading();
    await autoStartFromUrl();
  } else {
    // 正常启动页流程
    try {
      await tf.ready();
      loadDetector().catch(e => log('[Preload]', e));
    } catch (e) {
      log('[TF init]', e);
    }
    hideLoading();
  }

  log('[App] v7.2 初始化完成');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
