(function () {
  const dbRoot = firebase.database().ref('/servers');
  const dbVisitorSettings = firebase.database().ref('/visitorSettings');
  const $ = (id) => document.getElementById(id);

  let servers = {};
  let currentId = null;
  let currentListeners = [];
  let visitorSettings = {};

  // ---------- 방문자 사이트 제어 (관리자가 설정) ----------
  dbVisitorSettings.on('value', (snap) => {
    visitorSettings = snap.val() || {};
    applyVisitorSettings();
  });

  function applyVisitorSettings() {
    if (visitorSettings.disabled) {
      $('lockout-screen').classList.remove('hidden');
      $('app-root').classList.add('hidden');
      return;
    }
    $('lockout-screen').classList.add('hidden');
    $('app-root').classList.remove('hidden');

    toggleFeature('status-pill', visitorSettings.hideStatus);
    toggleFeature('players-pill', visitorSettings.hidePlayers);
    toggleFeature('card-monitor', visitorSettings.hideMonitor);
    toggleFeature('card-console', visitorSettings.hideConsole);
    toggleFeature('card-power', visitorSettings.hideStart);
    toggleFeature('card-map', visitorSettings.hideMap);
  }

  function toggleFeature(idOrClass, hidden) {
    const el = document.getElementById(idOrClass) || document.querySelector('.' + idOrClass);
    if (!el) return;
    el.classList.toggle('hidden', !!hidden);
  }

  // ---------- 서버 목록 (사이드바, 보기 전용) ----------
  dbRoot.on('value', (snap) => {
    servers = snap.val() || {};
    renderServerList();
  });

  function renderServerList() {
    const list = $('server-list');
    const ids = Object.keys(servers);
    if (ids.length === 0) {
      list.innerHTML = '<p class="empty-hint">등록된 서버가 없습니다.</p>';
      return;
    }
    list.innerHTML = '';
    ids.forEach((id) => {
      const s = servers[id];
      const meta = s.meta || {};
      const running = s.status && s.status.running;
      const item = document.createElement('div');
      item.className = 'server-item ' + (running ? 'on' : 'off') + (id === currentId ? ' active' : '');
      const iconHtml = s.iconDataUrl
        ? `<img class="server-icon" src="${s.iconDataUrl}" alt="" />`
        : `<span class="server-icon server-icon-placeholder">🗺</span>`;
      item.innerHTML = `${iconHtml}<span class="dot"></span><span>${meta.name || id}</span>`;
      item.addEventListener('click', () => selectServer(id));
      list.appendChild(item);
    });
  }

  // ---------- 서버 선택 ----------
  function selectServer(id) {
    currentId = id;
    renderServerList();
    $('empty-state').classList.add('hidden');
    $('server-detail').classList.remove('hidden');
    $('console-log').innerHTML = '';
    updateMapFrame(null);

    currentListeners.forEach(({ ref, type }) => ref.off(type));
    currentListeners = [];

    const meta = (servers[id] && servers[id].meta) || {};
    $('detail-name').textContent = meta.name || id;

    const ref = dbRoot.child(id);

    const metaRef = ref.child('meta');
    metaRef.on('value', (snap) => {
      const m = snap.val() || {};
      $('detail-name').textContent = m.name || id;
      updateMapFrame(m.mapUrl);
    });
    currentListeners.push({ ref: metaRef, type: 'value' });

    const statusRef = ref.child('status');
    statusRef.on('value', (snap) => updateStatus(snap.val() || {}));
    currentListeners.push({ ref: statusRef, type: 'value' });

    const monitorRef = ref.child('monitor');
    monitorRef.on('value', (snap) => updateMonitor(snap.val() || {}));
    currentListeners.push({ ref: monitorRef, type: 'value' });

    const playersRef = ref.child('players');
    playersRef.on('value', (snap) => updatePlayers(snap.val() || {}));
    currentListeners.push({ ref: playersRef, type: 'value' });

    const logsRef = ref.child('logs').limitToLast(150);
    logsRef.on('child_added', (snap) => appendLog((snap.val() || {}).line || ''));
    currentListeners.push({ ref: logsRef, type: 'child_added' });
  }

  // ---------- 상태 ----------
  function updateStatus(status) {
    const pill = $('status-pill');
    pill.classList.remove('on', 'off');
    if (status.running) {
      pill.classList.add('on');
      $('status-text').textContent = status.stopping ? '종료 중...' : '실행 중';
    } else {
      pill.classList.add('off');
      $('status-text').textContent = '꺼짐';
    }
  }

  // ---------- 서버 시작 (방문자는 시작만 가능, 종료는 불가) ----------
  $('btn-start').addEventListener('click', () => {
    if (!currentId) return;
    dbRoot.child(currentId).child('control').set({ action: 'start', requestedAt: Date.now() });
  });

  // ---------- 접속자 수 ----------
  function updatePlayers(p) {
    const count = p.count !== undefined ? p.count : '--';
    const max = p.max !== undefined ? p.max : '--';
    $('players-text').textContent = `${count} / ${max}`;
  }

  // ---------- 리소스 모니터 ----------
  function setMeter(fillId, valueId, percent) {
    const pct = Math.max(0, Math.min(100, percent || 0));
    $(fillId).style.width = pct + '%';
    $(valueId).textContent = pct.toFixed(1) + '%';
  }

  function updateMonitor(m) {
    setMeter('meter-cpu', 'value-cpu', m.sysCpuPercent);
    setMeter('meter-ram', 'value-ram', m.sysMemPercent);
  }

  // ---------- 콘솔 (보기 전용, 입력창 없음) ----------
  const consoleLog = $('console-log');
  function appendLog(line) {
    const div = document.createElement('div');
    if (line.startsWith('[ERROR]')) div.className = 'log-error';
    div.textContent = line;
    consoleLog.appendChild(div);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  // ---------- 지도 ----------
  function updateMapFrame(mapUrl) {
    const wrap = $('map-frame-wrap');
    const hint = $('map-empty-hint');
    const frame = $('map-frame');
    if (mapUrl) {
      frame.src = mapUrl;
      wrap.classList.remove('hidden');
      hint.classList.add('hidden');
    } else {
      frame.src = '';
      wrap.classList.add('hidden');
      hint.classList.remove('hidden');
    }
  }
})();
