/**
 * 舞蹈跟练评分 H5 App v7
 * 新增：
 *  - 视频URL直接生成分享链接（?v= 参数）
 *  - 打开分享链接自动加载视频进入跟练
 *  - H5竖屏：小视窗可拖动（右下角悬浮）
 *  - PC横屏：左右分屏布局
 *  - 外网部署支持（纯静态，无需后端）
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
  // 导入视频状态
  importedVideoEl: null,
  importedKeyframes: [],
  importedBpm: 120,
  importedDuration: 0,
  isExtracting: false,
  // URL视频状态
  urlVideoSrc: '',
  urlVideoTitle: '',
  debugMode: false
};

/* ============================================================
   四、URL 参数：生成分享链接 & 自动加载
   ============================================================ */

/**
 * 生成分享链接
 * 将视频 URL 编码到 ?v= 参数
 */
function generateShareLink(videoUrl) {
  const baseUrl = window.location.href.split('?')[0].split('#')[0];
  const encoded = encodeURIComponent(videoUrl);
  return baseUrl + '?v=' + encoded;
}

/**
 * 读取 URL 参数中的视频链接
 * 如果存在 ?v= 则返回解码后的视频 URL
 */
function getVideoUrlFromParams() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('v');
  return v ? decodeURIComponent(v) : null;
}

/**
 * 从 URL 参数自动启动跟练
 * 应用初始化时调用
 */
async function autoStartFromUrl() {
  const videoUrl = getVideoUrlFromParams();
  if (!videoUrl) return;

  log('[AutoStart] 检测到 URL 参数 videoUrl:', videoUrl);

  // 更新标题显示
  const title = extractTitleFromUrl(videoUrl);
  State.urlVideoSrc = videoUrl;
  State.urlVideoTitle = title;

  // 构建歌曲对象（URL模式）
  const urlSong = buildUrlVideoSong(videoUrl, title);
  State.selectedSong = urlSong;

  // 隐藏启动页，直接跳转到跟练页
  document.getElementById('songNameHeader').textContent = title;
  updateScoreUI(0);
  showPage('page-practice');

  showLoading('正在加载 AI 模型…');
  try {
    if (!State.detector) await loadDetector();
  } catch (e) {
    log('[AutoStart] 模型加载失败:', e);
  }

  updateLoadingText('正在请求摄像头权限…');
  const camResult = await startCamera();
  hideLoading();

  if (!camResult.ok) {
    showCameraError(camResult.msg);
  }

  // 提示用户可以开始
  setTimeout(() => {
    showToast('视频已加载，点击「▶ 播放」开始跟练！');
  }, 800);
}

/**
 * 从视频 URL 提取文件名作为标题
 */
function extractTitleFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const filename = path.split('/').pop();
    return filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || '自定义跟练';
  } catch (_) {
    return '自定义跟练';
  }
}

/**
 * 构建 URL 视频歌曲对象（无需预提取关键帧，实时检测）
 */
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
    keyframes: generateDemoKeyframes(120) // 用演示关键帧兜底
  };
}

/* ============================================================
   五、视频导入 & 关键帧提取（文件上传模式）
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
      log('[Import] 视频时长:', duration.toFixed(1), 's, 尺寸:', video.videoWidth, 'x', video.videoHeight);

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
        alert('视频姿态分析失败：' + err.message + '\n\n请尝试其他视频，或使用内置演示曲目。');
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
   六、调试日志
   ============================================================ */
function log(...args) {
  if (State.debugMode) {
    console.log('[Dance v7]', new Date().toISOString().slice(11, 23), ...args);
  }
}

/* ============================================================
   七、绘制骨骼
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
   八、姿态相似度评分
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
   九、加载 TF.js MoveNet 检测器
   ============================================================ */
async function loadDetector() {
  updateLoadingText('正在加载 TF.js 运行时…');
  await tf.ready();

  updateLoadingText('正在加载 MoveNet 模型…');
  const model = poseDetection.SupportedModels.MoveNet;
  const detectorConfig = {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    enableSmoothing: true,
    minPoseScore: 0.25
  };
  State.detector = await poseDetection.createDetector(model, detectorConfig);
  log('[MoveNet] 模型加载完成');
}

/* ============================================================
   十、摄像头
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
   十一、用户骨骼检测循环
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

  State.animFrameId = requestAnimationFrame(detectionLoop);
}

function updateCameraHint(text) {
  const hint = document.getElementById('cameraHint');
  if (hint) hint.textContent = text;
}

/* ============================================================
   十二、实时分数反馈特效
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

  // 在H5竖屏模式下，反馈显示在示范视频区；PC模式显示在用户摄像头区
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
   十三、检测是否为竖屏/H5模式
   ============================================================ */
function isPortraitMode() {
  return window.innerWidth <= 600 || window.innerHeight > window.innerWidth;
}

/* ============================================================
   十四、示范骨骼动画
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
    // 导入视频模式
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
    // 外部视频链接模式（含 URL 参数自动加载的视频）
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
      renderDemoSkeleton();
    }, 80);
  } else {
    // 内置演示模式 - BPM 驱动
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
   十五、播放导入视频
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
   十六、评分记录与 UI 更新
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
   十七、节拍动画
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
   十八、Toast 提示
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
   十九、分数弹窗特效
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
   二十、彩带动画
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
   二十一、页面导航
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
   二十二、倒计时
   ============================================================ */
function startCountdown(onDone) {
  const mask = document.getElementById('countdownMask');
  const numEl = document.getElementById('countdownNum');
  let count = 3;

  mask.classList.remove('hidden');
  numEl.textContent = count;

  const iv = setInterval(() => {
    count--;
    if (count > 0) {
      numEl.textContent = count;
      numEl.style.animation = 'none';
      numEl.offsetHeight;
      numEl.style.animation = 'countPop 0.85s ease-out';
    } else {
      clearInterval(iv);
      mask.classList.add('hidden');
      onDone();
    }
  }, 900);
}

/* ============================================================
   二十三、开始 / 暂停 / 重练
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
   二十四、结束跟练
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
   二十五、H5 小视窗拖动（touch 事件）
   ============================================================ */
function initUserWrapDrag() {
  const wrap = document.getElementById('userWrap');
  if (!wrap) return;

  let startX, startY, origRight, origBottom;
  let isDragging = false;

  wrap.addEventListener('touchstart', (e) => {
    if (!isPortraitMode()) return;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;

    const style = window.getComputedStyle(wrap);
    origRight = parseInt(style.right) || 12;
    origBottom = parseInt(style.bottom) || 12;
    isDragging = true;
    e.preventDefault();
  }, { passive: false });

  wrap.addEventListener('touchmove', (e) => {
    if (!isDragging || !isPortraitMode()) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    const newRight = Math.max(4, Math.min(window.innerWidth - 80, origRight - dx));
    const newBottom = Math.max(80, Math.min(window.innerHeight - 160, origBottom - dy));

    wrap.style.right = newRight + 'px';
    wrap.style.bottom = newBottom + 'px';
    e.preventDefault();
  }, { passive: false });

  wrap.addEventListener('touchend', () => {
    isDragging = false;
  });
}

/* ============================================================
   二十六、渲染歌曲列表
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
   二十七、事件绑定
   ============================================================ */
function bindEvents() {
  // ——— 生成分享链接 ———
  document.getElementById('btnGenLink').addEventListener('click', () => {
    const url = document.getElementById('practiceVideoUrl').value.trim();
    if (!url) {
      showToast('请先粘贴视频链接'); return;
    }
    if (!url.startsWith('http')) {
      showToast('请输入有效的 http/https 链接'); return;
    }

    const shareLink = generateShareLink(url);
    document.getElementById('shareLinkInput').value = shareLink;
    document.getElementById('shareLinkBox').classList.remove('hidden');

    // 同时将此视频设为待启动歌曲
    const title = extractTitleFromUrl(url);
    State.urlVideoSrc = url;
    State.urlVideoTitle = title;
    State.selectedSong = buildUrlVideoSong(url, title);
    document.getElementById('btnStart').disabled = false;

    showToast('✅ 链接已生成！可复制分享');
  });

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
   二十八、初始化入口
   ============================================================ */
async function init() {
  log('[App] v7 初始化开始');
  renderSongCards();
  bindEvents();
  initUserWrapDrag();

  // 检查 URL 参数，如果有则自动启动
  const videoUrl = getVideoUrlFromParams();
  if (videoUrl) {
    // 有 URL 参数 → 直接跳转到跟练
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

  log('[App] v7 初始化完成');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
