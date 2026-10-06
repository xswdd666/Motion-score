const tracks = [
  { title: 'Runaway', artist: 'OneRepublic', cover: 'green', icon: '↗', time: '3:32', stage: '进入状态' },
  { title: '漫游指南', artist: '告五人', cover: 'blue', icon: '✦', time: '4:08', stage: '稳定节奏' },
  { title: 'Good Life', artist: 'OneRepublic', cover: 'pink', icon: '◒', time: '4:07', stage: '稳定节奏' },
  { title: 'Blinding Lights', artist: 'The Weeknd', cover: 'sun', icon: '✹', time: '3:20', stage: '最后冲刺' },
  { title: '日落之前', artist: '陈粒', cover: 'green', icon: '◌', time: '4:16', stage: '自然收束' }
];
const community = [
  { title: '深圳湾 40 分钟夜跑', meta: '南山 · 40 分钟 · 5.8 km', desc: '给下班后的身体一点风。前半段稳住，最后一公里刚好亮起来。', cover: 'green', icon: '↗', tags: ['跑步', '夜晚'], reuse: '128 人复用' },
  { title: '广州 → 深圳，沿江出发', meta: '驾车 · 1 小时 48 分钟', desc: '适合周五下午的长途路上，熟悉的歌和一点点新的惊喜。', cover: 'blue', icon: '⌁', tags: ['驾车', '长途'], reuse: '86 人复用' },
  { title: '大学城慢慢走', meta: '散步 · 32 分钟 · 3.1 km', desc: '不赶时间，走过树影和晚风，最后一首歌留给回到宿舍的路。', cover: 'pink', icon: '◒', tags: ['散步', '傍晚'], reuse: '42 人复用' }
];

const state = { route: 'home', mode: 'run', duration: 40, playing: false, paused: false, elapsed: 0, timer: null, selectedTrack: 0, createdFrom: 'new' };
const app = document.querySelector('#app');
const nav = document.querySelector('#bottom-nav');
const toast = document.querySelector('#toast');
const fmt = (sec) => `${Math.floor(sec / 60).toString().padStart(2, '0')}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;

function showToast(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200); }
function setRoute(route) { state.route = route; if (route !== 'play') stopTimer(); render(); }
function stopTimer() { clearInterval(state.timer); state.timer = null; state.playing = false; state.paused = false; }
function startTimer() {
  stopTimer(); state.playing = true; state.paused = false;
  state.timer = setInterval(() => {
    state.elapsed += 30;
    if (state.elapsed >= state.duration * 60) { state.elapsed = state.duration * 60; stopTimer(); state.route = 'complete'; render(); showToast('原声带已完成，正在生成卡片'); return; }
    state.selectedTrack = Math.min(tracks.length - 1, Math.floor((state.elapsed / (state.duration * 60)) * tracks.length));
    render();
  }, 650);
}
function startSession() { state.elapsed = 0; state.selectedTrack = 0; state.route = 'preview'; render(); }
function beginPlayback() { state.route = 'play'; startTimer(); render(); }
function togglePlayback() { if (state.playing) { state.playing = false; state.paused = true; clearInterval(state.timer); state.timer = null; } else { startTimer(); } render(); }
function endPlayback() { stopTimer(); state.route = 'complete'; render(); }
function goHome() { stopTimer(); state.route = 'home'; state.elapsed = 0; render(); }

function navMarkup(active) { nav.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.route === active)); nav.style.display = ['play', 'preview', 'create', 'complete'].includes(active) ? 'none' : 'flex'; }
function layout(html, active = state.route) { app.innerHTML = html; navMarkup(active); bind(); }

function homeView() {
  layout(`<div class="view-head"><div><div class="eyebrow">MOTION SCORE · 2026</div><h1>让这段路<br/>有自己的声音。</h1></div><div class="avatar">M</div></div>
  <div class="hero-card"><div class="hero-kicker">YOUR NEXT SOUNDTRACK</div><div class="hero-title">从出发到抵达，音乐会替你记住进度。</div><p class="hero-copy">根据移动方式、路线和你的 QQ 音乐偏好，自动编排一段不需要盯屏的原声带。</p><button class="primary-btn" data-action="create">开始一段移动原声带　→</button></div>
  <section class="section"><div class="section-head"><h2>现在适合</h2><span class="text-link">快速开始</span></div><div class="quick-grid"><button class="quick-card run" data-quick="run"><span class="glyph">↗</span><div><strong>开始跑步</strong><span>为 40 分钟安排节奏</span></div></button><button class="quick-card drive" data-quick="drive"><span class="glyph">⌁</span><div><strong>开始驾车</strong><span>沿路线自然收束</span></div></button></div></section>
  <section class="section"><div class="section-head"><h2>最近的原声带</h2><span class="text-link">查看全部</span></div><div class="soundtrack-list"><div class="soundtrack-card"><div class="cover green">↗</div><div class="track-meta"><strong>深圳湾夜跑 · 40 分钟</strong><span>跑步　5.8 km　昨天 21:14</span></div><div class="track-time">↗</div></div><div class="soundtrack-card"><div class="cover blue">⌁</div><div class="track-meta"><strong>广州 → 深圳</strong><span>驾车　1 小时 48 分钟　周五</span></div><div class="track-time">↗</div></div></div></section>`, 'home');
}

function createView() {
  layout(`<div class="back-row"><button class="icon-btn" data-action="home">←</button><h2>开始一段原声带</h2></div><div class="form-card"><label class="field-label">选择移动方式</label><div class="mode-row"><button class="mode-btn ${state.mode === 'run' ? 'selected' : ''}" data-mode="run"><b>↗ 跑步</b><span>跟着节奏进入状态</span></button><button class="mode-btn ${state.mode === 'drive' ? 'selected' : ''}" data-mode="drive"><b>⌁ 驾车</b><span>让路线自然收束</span></button></div><label class="field-label" style="margin-top:22px">这次大概多久</label><div class="duration-row">${[20, 30, 40, 60].map(d => `<button class="choice ${state.duration === d ? 'selected' : ''}" data-duration="${d}">${d} 分钟</button>`).join('')}</div><div class="input-like"><span>${state.mode === 'run' ? `轻松跑 · ${state.duration} 分钟` : '深圳湾 → 南山科技园'}</span><b>⌄</b></div><div class="preference-box"><div class="qq-mark">♫</div><div><strong>已连接 QQ 音乐偏好</strong><span>最近播放 · 收藏 · 常听歌手　共 286 首</span></div><span style="margin-left:auto;color:#6b5cff;font-size:14px">✓</span></div><button class="primary-btn wide-btn" data-action="generate">生成我的原声带　→</button></div><section class="section"><div class="section-head"><h2>这次会发生什么</h2></div><div class="soundtrack-list"><div class="soundtrack-card"><div class="cover green">01</div><div class="track-meta"><strong>音乐会跟着你的过程变化</strong><span>开始、稳定、接近终点，自然收束</span></div></div><div class="soundtrack-card"><div class="cover blue">02</div><div class="track-meta"><strong>不用频繁看手机</strong><span>歌曲切换就是轻量的进度提醒</span></div></div></div></section>`, 'create');
}

function previewView() {
  layout(`<div class="back-row"><button class="icon-btn" data-action="create">←</button><h2>你的原声带已准备好</h2></div><div class="preview-hero"><div class="eyebrow">${state.mode === 'run' ? 'EASY RUN' : 'ROAD TRIP'}</div><div class="preview-title">${state.mode === 'run' ? `深圳湾 · ${state.duration} 分钟夜跑` : '广州 → 深圳 · 沿江出发'}</div><div class="stats"><div class="stat"><b>${state.duration}</b><span>分钟</span></div><div class="stat"><b>${state.mode === 'run' ? '5.8' : '108'}</b><span>${state.mode === 'run' ? '公里' : '公里'}</span></div><div class="stat"><b>${tracks.length}</b><span>首歌</span></div></div></div><section class="playlist-box"><div class="section-head"><h2>这段路会听见</h2><span class="text-link">QQ 音乐偏好</span></div><div class="soundtrack-list">${tracks.map((t, i) => `<div class="soundtrack-card"><div class="cover ${t.cover}">${t.icon}</div><div class="track-meta"><strong>${t.title}</strong><span>${t.artist}　·　${t.stage}</span></div><div class="track-time">${t.time}</div></div>`).join('')}</div></section><button class="primary-btn wide-btn" data-action="play">开始播放　▶</button>`, 'preview');
}

function playView() {
  const current = tracks[state.selectedTrack]; const total = state.duration * 60; const percent = Math.max(2, Math.round((state.elapsed / total) * 100)); const phase = percent < 18 ? '进入状态' : percent < 70 ? '稳定节奏' : percent < 92 ? '最后冲刺' : '自然收束';
  const origin = state.mode === 'run' ? '深圳湾公园' : '广州天河';
  const destination = state.mode === 'run' ? `南山科技园 · ${state.duration} 分钟后` : `深圳湾 · ${state.duration} 分钟后`;
  layout(`<div class="play-page"><div class="back-row"><button class="icon-btn" data-action="end">×</button><h2>正在陪你移动</h2></div><div class="player-art">${current.icon}</div><div class="now-playing">${current.title}</div><div class="demo-note">演示模式 · 进度加速 · 音乐与接入为模拟</div><div class="now-artist">${current.artist}　·　来自你的 QQ 音乐偏好</div><div class="phase-pill">${phase}　·　${state.duration - Math.floor(state.elapsed / 60)} 分钟后抵达</div><div class="progress-wrap"><div class="progress-bar"><i style="width:${percent}%"></i></div><div class="time-row"><span>${fmt(state.elapsed)}</span><span>${fmt(total)}</span></div></div><div class="play-controls"><button class="control-btn" data-action="prev">↶</button><button class="control-btn main" data-action="toggle">${state.playing ? 'Ⅱ' : '▶'}</button><button class="control-btn" data-action="next">↷</button></div><div class="route-strip"><div><b style="color:#6b5cff">●</b><span>${origin}</span></div><div class="route-line"></div><div><b style="color:#ff845c">●</b><span>${destination}</span></div></div><button class="text-link" style="margin-top:22px" data-action="end">结束本次原声带</button></div>`, 'play');
}

function completeView() {
  layout(`<div class="back-row"><button class="icon-btn" data-action="home">←</button><h2>这段路，完成了</h2></div><div class="complete-card"><div class="eyebrow">SOUNDTRACK COMPLETE</div><h1>${state.mode === 'run' ? '深圳湾夜跑' : '沿江出发'}</h1><p class="complete-copy">你和这段音乐一起走过了 ${state.duration} 分钟。下一次路过这里，它会记得今天的节奏。</p><div class="complete-stats"><div><b>${state.duration}</b><span>分钟</span></div><div><b>${state.mode === 'run' ? '5.8' : '108'}</b><span>公里</span></div><div><b>${tracks.length}</b><span>首歌</span></div></div></div><div class="share-card"><div class="card-cover"></div><div class="share-meta"><div><strong>${state.mode === 'run' ? `深圳湾 · ${state.duration} 分钟夜跑` : '广州 → 深圳 · 沿江出发'}</strong><span style="display:block;margin-top:5px">移动原声带 · Motion Score</span></div><button class="outline-btn" data-action="publish">发布卡片</button></div></div><button class="primary-btn wide-btn" data-action="home">再来一段　→</button>`, 'complete');
}

function communityView() {
  layout(`<div class="community-head"><div class="eyebrow">COMMUNITY</div><h1>别人的路，<br/>也有自己的声音。</h1></div><div class="search-box">⌕　搜索城市、路线或场景 <span style="margin-left:auto">☷</span></div><div class="community-list">${community.map((c, i) => `<div class="community-card"><div class="community-top"><div class="cover ${c.cover}">${c.icon}</div><div class="community-info"><strong>${c.title}</strong><p>${c.meta}<br/>${c.desc}</p></div></div><div class="community-foot"><div class="tag-row">${c.tags.map(t => `<span class="tag">${t}</span>`).join('')}<span class="tag">${c.reuse}</span></div><button class="outline-btn" data-reuse="${i}">复用</button></div></div>`).join('')}</div>`, 'community');
}

function profileView() {
  layout(`<div class="community-head"><div class="eyebrow">PROFILE</div><h1>你的移动，<br/>正在留下声音。</h1></div><div class="profile-card"><div class="profile-row"><div class="profile-avatar">M</div><div><div class="profile-name">Ming 的原声带</div><div class="profile-caption">已连接 QQ 音乐偏好 · 2026.10 加入</div></div></div><div class="profile-stats"><div><b>12</b><span>完成原声带</span></div><div><b>286</b><span>偏好歌曲</span></div><div><b>04</b><span>分享卡片</span></div></div></div><div class="settings-list"><div class="setting"><span>QQ 音乐偏好</span><b style="color:#6b5cff">已连接　›</b></div><div class="setting"><span>路线与位置隐私</span><b>仅自己可见　›</b></div><div class="setting"><span>低打扰提示</span><b>已开启　›</b></div></div>`, 'profile');
}

function render() { ({ home: homeView, create: createView, preview: previewView, play: playView, complete: completeView, community: communityView, profile: profileView }[state.route] || homeView)(); }
function bind() {
  document.querySelectorAll('[data-route]').forEach(btn => btn.onclick = () => setRoute(btn.dataset.route));
  document.querySelectorAll('[data-action]').forEach(btn => btn.onclick = () => {
    const action = btn.dataset.action;
    if (action === 'create') setRoute('create');
    if (action === 'home') goHome();
    if (action === 'generate') startSession();
    if (action === 'play') beginPlayback();
    if (action === 'toggle') togglePlayback();
    if (action === 'end') endPlayback();
    if (action === 'community') setRoute('community');
    if (action === 'publish') {
      community.unshift({title: state.mode === 'run' ? `我的深圳湾 ${state.duration} 分钟原声带` : '我的沿江驾车原声带', meta: `${state.duration} 分钟 · 刚刚发布`, desc: '跟着自己的音乐，完成了这段路。', cover: 'green', icon: '↗', tags: [state.mode === 'run' ? '跑步' : '驾车', '我的分享'], reuse: '等待第一位同路人', mode: state.mode, duration: state.duration});
      setRoute('community'); showToast('卡片已发布到演示社区');
    }
    if (action === 'prev') { state.selectedTrack = Math.max(0, state.selectedTrack - 1); render(); }
    if (action === 'next') { state.selectedTrack = Math.min(tracks.length - 1, state.selectedTrack + 1); render(); }
  });
  document.querySelectorAll('[data-quick]').forEach(btn => btn.onclick = () => { state.mode = btn.dataset.quick; state.duration = state.mode === 'run' ? 40 : 60; setRoute('create'); });
  document.querySelectorAll('[data-mode]').forEach(btn => btn.onclick = () => { state.mode = btn.dataset.mode; render(); });
  document.querySelectorAll('[data-duration]').forEach(btn => btn.onclick = () => { state.duration = Number(btn.dataset.duration); render(); });
  document.querySelectorAll('[data-reuse]').forEach(btn => btn.onclick = () => { const chosen = community[Number(btn.dataset.reuse)]; state.mode = chosen.mode || (chosen.tags.includes('驾车') ? 'drive' : 'run'); state.duration = chosen.duration || (state.mode === 'drive' ? 60 : 40); showToast('已载入这段原声带，可按你的行程调整'); setRoute('create'); });
}
render();
