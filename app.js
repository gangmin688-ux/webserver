(function () {
  const dbRoot = firebase.database().ref('/servers');
  const dbComputers = firebase.database().ref('/computers');
  const dbVisitorSettings = firebase.database().ref('/visitorSettings');
  const $ = (id) => document.getElementById(id);

  let servers = {};       // 전체 서버 메타/상태 캐시 (사이드바 렌더링용)
  let currentId = null;   // 현재 선택된 서버 id
  let currentComputerId = null; // 현재 선택된 서버가 속한 컴퓨터 id
  let currentListeners = []; // 현재 선택된 서버에 붙은 리스너 해제용
  let listsData = { whitelist: [], ops: [], bannedPlayers: [], bannedIps: [] };
  let activeTab = 'whitelist';
  let trackerList = [];
  let selectedPlayerName = null;
  let computerStatusRef = null;

  // ---------- 서버 목록 (사이드바) ----------
  dbRoot.on('value', (snap) => {
    servers = snap.val() || {};
    renderServerList();
  });

  function renderServerList() {
    const list = $('server-list');
    const ids = Object.keys(servers);
    if (ids.length === 0) {
      list.innerHTML = '<p class="empty-hint">등록된 서버가 없습니다.<br/>오른쪽 위 "+ 서버 추가"를 눌러주세요.</p>';
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
    $('properties-list').innerHTML = '';
    $('plugins-list').innerHTML = '';
    listsData = { whitelist: [], ops: [], bannedPlayers: [], bannedIps: [] };
    $('lists-content').innerHTML = '';
    $('tracker-tbody').innerHTML = '';
    trackerList = [];
    selectedPlayerName = null;
    $('inventory-detail').classList.add('hidden');
    $('inventory-empty-hint').classList.remove('hidden');
    updateMapFrame(null);

    // 이전 서버에 붙어있던 리스너 정리
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
      const computerId = m.computerId || 'default';
      if (computerId !== currentComputerId) {
        currentComputerId = computerId;
        subscribeComputerStatus(computerId);
      }
    });
    currentListeners.push({ ref: metaRef, type: 'value' });

    const statusRef = ref.child('status');
    const onStatus = statusRef.on('value', (snap) => updateStatus(snap.val() || {}));
    currentListeners.push({ ref: statusRef, type: 'value' });

    const monitorRef = ref.child('monitor');
    const onMonitor = monitorRef.on('value', (snap) => updateMonitor(snap.val() || {}));
    currentListeners.push({ ref: monitorRef, type: 'value' });

    const logsRef = ref.child('logs').limitToLast(150);
    logsRef.on('child_added', (snap) => appendLog((snap.val() || {}).line || ''));
    currentListeners.push({ ref: logsRef, type: 'child_added' });

    const propsRef = ref.child('propertiesJson');
    const onProps = propsRef.on('value', (snap) => {
      const raw = snap.val();
      let list = [];
      try { list = raw ? JSON.parse(raw) : []; } catch (e) { list = []; }
      renderProperties(list);
    });
    currentListeners.push({ ref: propsRef, type: 'value' });

    const pluginsRef = ref.child('pluginsJson');
    const onPlugins = pluginsRef.on('value', (snap) => {
      const raw = snap.val();
      let list = [];
      try { list = raw ? JSON.parse(raw) : []; } catch (e) { list = []; }
      renderPlugins(list);
    });
    currentListeners.push({ ref: pluginsRef, type: 'value' });

    const playersRef = ref.child('players');
    const onPlayers = playersRef.on('value', (snap) => updatePlayers(snap.val() || {}));
    currentListeners.push({ ref: playersRef, type: 'value' });

    ['whitelist', 'ops', 'bannedPlayers', 'bannedIps'].forEach((tab) => {
      const nodeName = tab + 'Json';
      const r = ref.child(nodeName);
      r.on('value', (snap) => {
        const raw = snap.val();
        try { listsData[tab] = raw ? JSON.parse(raw) : []; } catch (e) { listsData[tab] = []; }
        if (activeTab === tab) renderLists();
      });
      currentListeners.push({ ref: r, type: 'value' });
    });

    const trackerRef = ref.child('playerTrackerJson');
    trackerRef.on('value', (snap) => {
      const raw = snap.val();
      let list = [];
      try { list = raw ? JSON.parse(raw) : []; } catch (e) { list = []; }
      renderTracker(list);
    });
    currentListeners.push({ ref: trackerRef, type: 'value' });
  }

  // ---------- 상태 ----------
  function updateStatus(status) {
    const pill = $('status-pill');
    pill.classList.remove('on', 'off');
    if (status.running) {
      pill.classList.add('on');
      $('status-text').textContent = status.stopping ? '종료 중...' : '실행 중';
      $('status-pid').textContent = status.pid ? `PID ${status.pid}` : '';
    } else {
      pill.classList.add('off');
      $('status-text').textContent = '꺼짐';
      $('status-pid').textContent = '';
    }
  }

  $('btn-start').addEventListener('click', () => {
    if (!currentId) return;
    dbRoot.child(currentId).child('control').set({ action: 'start', requestedAt: Date.now() });
  });
  $('btn-stop').addEventListener('click', () => {
    if (!currentId) return;
    dbRoot.child(currentId).child('control').set({ action: 'stop', requestedAt: Date.now() });
  });

  // ---------- 접속자 수 ----------
  function updatePlayers(p) {
    const count = p.count !== undefined ? p.count : '--';
    const max = p.max !== undefined ? p.max : '--';
    $('players-text').textContent = `${count} / ${max}`;
  }

  // ---------- 서버 삭제 ----------
  $('btn-delete-server').addEventListener('click', () => {
    if (!currentId) return;
    const meta = (servers[currentId] && servers[currentId].meta) || {};
    const running = servers[currentId] && servers[currentId].status && servers[currentId].status.running;
    const warn = running ? '\n(현재 실행 중입니다 — 대시보드 목록에서만 제거되고, 컴퓨터의 서버 프로세스는 직접 꺼야 할 수 있어요.)' : '';
    if (!confirm(`"${meta.name || currentId}" 서버를 대시보드에서 제거할까요?${warn}`)) return;
    dbRoot.child(currentId).remove().then(() => {
      currentId = null;
      $('server-detail').classList.add('hidden');
      $('empty-state').classList.remove('hidden');
    });
  });

  // ---------- 화이트리스트 / OP / 밴 목록 ----------
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderLists();
    });
  });

  function renderLists() {
    const container = $('lists-content');
    container.innerHTML = '';
    const data = listsData[activeTab] || [];
    if (data.length === 0) {
      container.innerHTML = '<li class="empty">목록이 비어 있습니다.</li>';
      return;
    }
    data.forEach((item) => {
      const li = document.createElement('li');
      if (activeTab === 'whitelist' || activeTab === 'ops') {
        const sub = activeTab === 'ops' && item.level !== undefined ? `권한 레벨 ${item.level}` : '';
        li.innerHTML = `<span class="item-main">${item.name || item.uuid || '-'}</span>` +
          (sub ? `<span class="item-sub">${sub}</span>` : '');
      } else if (activeTab === 'bannedPlayers') {
        li.innerHTML = `<span class="item-main">${item.name || item.uuid || '-'}</span>` +
          `<span class="item-sub">${item.reason || '사유 없음'}${item.expires && item.expires !== 'forever' ? ' · ' + item.expires : ''}</span>`;
      } else if (activeTab === 'bannedIps') {
        li.innerHTML = `<span class="item-main">${item.ip || '-'}</span>` +
          `<span class="item-sub">${item.reason || '사유 없음'}${item.expires && item.expires !== 'forever' ? ' · ' + item.expires : ''}</span>`;
      }
      container.appendChild(li);
    });
  }

  // ---------- 컴퓨터 전원 ----------
  function subscribeComputerStatus(computerId) {
    if (computerStatusRef) {
      computerStatusRef.off('value');
    }
    computerStatusRef = dbComputers.child(computerId).child('status');
    computerStatusRef.on('value', (snap) => {
      const s = snap.val() || {};
      const text = $('computer-status-text');
      if (s.shuttingDown) {
        const label = s.pendingAction === 'restart' ? '재시작' : '종료';
        text.textContent = `⚠ 컴퓨터 ${label}가 진행 중입니다. 필요하면 "종료/재시작 취소"를 눌러주세요.`;
      } else {
        text.textContent = `컴퓨터 ID: ${computerId} — 정상`;
      }
    });
  }

  $('btn-computer-shutdown').addEventListener('click', () => {
    if (!currentComputerId) return;
    const ok = confirm(
      `정말 컴퓨터(${currentComputerId})를 끌까요?\n` +
      '켜져 있는 마인크래프트 서버들을 먼저 정상 종료한 뒤 10초 후 꺼집니다.'
    );
    if (!ok) return;
    dbComputers.child(currentComputerId).child('control').set({ action: 'shutdown', requestedAt: Date.now() });
  });

  $('btn-computer-restart').addEventListener('click', () => {
    if (!currentComputerId) return;
    const ok = confirm(
      `정말 컴퓨터(${currentComputerId})를 재시작할까요?\n` +
      '켜져 있는 마인크래프트 서버들을 먼저 정상 종료한 뒤 10초 후 재시작됩니다.'
    );
    if (!ok) return;
    dbComputers.child(currentComputerId).child('control').set({ action: 'restart', requestedAt: Date.now() });
  });

  $('btn-computer-cancel').addEventListener('click', () => {
    if (!currentComputerId) return;
    dbComputers.child(currentComputerId).child('control').set({ action: 'cancelShutdown', requestedAt: Date.now() });
  });

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

  $('btn-map-settings').addEventListener('click', () => {
    if (!currentId) return;
    const currentPort = (servers[currentId] && servers[currentId].meta && servers[currentId].meta.mapLocalPort) || '';
    const input = prompt(
      '지도 플러그인(Pl3xMap 등)이 서버 컴퓨터에서 열려있는 포트 번호를 입력하세요.\n' +
      '예: 8080\n비워두고 확인을 누르면 지도를 끕니다.\n\n' +
      '(주소는 자동으로 안 넣으셔도 됩니다 — 에이전트가 cloudflared로 자동으로 터널을 만들고 주소를 알아서 반영합니다.)',
      currentPort
    );
    if (input === null) return; // 취소
    const trimmed = input.trim();
    const port = trimmed ? parseInt(trimmed, 10) : null;
    dbRoot.child(currentId).child('meta').update({
      mapLocalPort: port,
      mapUrl: null // 포트가 바뀌었으니, 에이전트가 새 터널 주소로 다시 채울 때까지 이전 주소는 지워둔다
    });
  });

  // ---------- 실시간 위치 추적 ----------
  function avatarUrl(name) {
    return `https://mc-heads.net/avatar/${encodeURIComponent(name)}/32`;
  }

  function renderTracker(list) {
    trackerList = list;
    const tbody = $('tracker-tbody');
    tbody.innerHTML = '';
    $('tracker-empty-hint').classList.toggle('hidden', list.length > 0);

    list.forEach((p) => {
      const tr = document.createElement('tr');
      tr.className = 'player-row' + (p.name === selectedPlayerName ? ' selected' : '');
      const coords = `${p.x}, ${p.y}, ${p.z}`;

      const equipParts = [];
      if (p.mainHand) equipParts.push(`주손: ${p.mainHand}`);
      if (p.offHand) equipParts.push(`보조손: ${p.offHand}`);
      if (p.helmet) equipParts.push(`머리: ${p.helmet}`);
      if (p.chestplate) equipParts.push(`갑옷: ${p.chestplate}`);
      if (p.leggings) equipParts.push(`레깅스: ${p.leggings}`);
      if (p.boots) equipParts.push(`신발: ${p.boots}`);
      const equipSummary = equipParts.length ? equipParts.join(', ') : '-';

      const looking = p.lookingAtBlock && p.lookingAtBlock !== 'AIR'
        ? `${p.lookingAtBlock} (${p.lookX}, ${p.lookY}, ${p.lookZ})`
        : '-';

      tr.innerHTML =
        `<td><img class="player-avatar" src="${avatarUrl(p.name || '')}" alt="" /></td>` +
        `<td class="name-cell">${p.name || '-'}</td>` +
        `<td>${p.world || '-'}</td><td>${coords}</td>` +
        `<td>${p.biome || '-'}</td>` +
        `<td>${equipSummary}</td>` +
        `<td>${looking}</td>`;
      tr.addEventListener('click', () => {
        selectedPlayerName = p.name;
        renderTracker(trackerList); // 선택 표시 갱신
        renderInventoryDetail(p);
      });
      tbody.appendChild(tr);
    });

    // 선택돼 있던 플레이어가 여전히 목록에 있으면 인벤토리도 최신 데이터로 갱신
    if (selectedPlayerName) {
      const stillHere = list.find((p) => p.name === selectedPlayerName);
      if (stillHere) {
        renderInventoryDetail(stillHere);
      } else {
        selectedPlayerName = null;
        $('inventory-detail').classList.add('hidden');
        $('inventory-empty-hint').classList.remove('hidden');
      }
    }
  }

  function invSlotHtml(item, amount, titlePrefix) {
    const prefix = titlePrefix ? `${titlePrefix}: ` : '';
    if (!item) {
      return `<div class="inv-slot" title="${prefix}(비어있음)"><span class="slot-empty-icon">·</span></div>`;
    }
    const label = item.replace(/_/g, ' ');
    return `<div class="inv-slot filled" title="${prefix}${item} ×${amount}">` +
      `<span class="slot-label">${label}</span>` +
      `<span class="slot-amt">${amount > 1 ? amount : ''}</span></div>`;
  }

  function renderInventoryDetail(p) {
    $('inventory-empty-hint').classList.add('hidden');
    $('inventory-detail').classList.remove('hidden');
    $('inv-player-avatar').src = avatarUrl(p.name || '');
    $('inv-player-name').textContent = p.name || '-';

    const inv = Array.isArray(p.inventory) ? p.inventory : [];
    const bySlot = {};
    inv.forEach((it) => { bySlot[it.slot] = it; });

    // 메인 저장공간: 슬롯 9~35 (3줄 x 9칸)
    let mainHtml = '';
    for (let slot = 9; slot <= 35; slot++) {
      const it = bySlot[slot];
      mainHtml += invSlotHtml(it ? it.item : null, it ? it.amount : 0);
    }
    $('inv-grid-main').innerHTML = mainHtml;

    // 핫바: 슬롯 0~8
    let hotbarHtml = '';
    for (let slot = 0; slot <= 8; slot++) {
      const it = bySlot[slot];
      hotbarHtml += invSlotHtml(it ? it.item : null, it ? it.amount : 0);
    }
    $('inv-grid-hotbar').innerHTML = hotbarHtml;

    // 장비: 주손/보조손/머리/갑옷/레깅스/신발
    const equipSlots = [
      ['주손', p.mainHand], ['보조손', p.offHand],
      ['머리', p.helmet], ['갑옷', p.chestplate],
      ['레깅스', p.leggings], ['신발', p.boots]
    ];
    $('inv-grid-equip').innerHTML = equipSlots
      .map(([label, item]) => invSlotHtml(item, item ? 1 : 0, label))
      .join('');
  }

  // ---------- 콘솔 ----------
  const consoleLog = $('console-log');
  function appendLog(line) {
    const div = document.createElement('div');
    if (line.startsWith('[ERROR]')) div.className = 'log-error';
    if (line.startsWith('>')) div.className = 'log-sent';
    div.textContent = line;
    consoleLog.appendChild(div);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  $('command-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentId) return;
    const input = $('command-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    dbRoot.child(currentId).child('commands').push({ text, ts: Date.now(), handled: false });
  });

  $('btn-clear-console').addEventListener('click', () => {
    consoleLog.innerHTML = '';
    if (currentId) {
      dbRoot.child(currentId).child('logs').remove(); // 저장된 로그 기록도 같이 지워서, 새로고침해도 다시 안 뜨게 함
    }
  });

  // ---------- 리소스 모니터 ----------
  function setMeter(fillId, valueId, percent, label) {
    const pct = Math.max(0, Math.min(100, percent || 0));
    $(fillId).style.width = pct + '%';
    $(valueId).textContent = label !== undefined ? label : pct.toFixed(1) + '%';
  }

  function updateMonitor(m) {
    setMeter('meter-cpu', 'value-cpu', m.sysCpuPercent);
    setMeter('meter-ram', 'value-ram', m.sysMemPercent);
    if (m.java && m.java.found) {
      setMeter('meter-java-cpu', 'value-java-cpu', m.java.cpuPercent);
      setMeter('meter-java-ram', 'value-java-ram', m.java.memPercent);
    } else {
      setMeter('meter-java-cpu', 'value-java-cpu', 0, '-- (미실행)');
      setMeter('meter-java-ram', 'value-java-ram', 0, '-- (미실행)');
    }
  }

  // ---------- server.properties ----------
  function renderProperties(list) {
    const container = $('properties-list');
    container.innerHTML = '';
    const items = list.map((item, index) => ({ index, key: item.key, value: item.value }));
    items.sort((a, b) => a.key.localeCompare(b.key));
    items.forEach(({ index, key, value }) => {
      const row = document.createElement('div');
      row.className = 'prop-row';
      const safeValue = String(value).replace(/"/g, '&quot;');
      row.innerHTML = `<label title="${key}">${key}</label><input data-key="${key}" value="${safeValue}" />`;
      container.appendChild(row);
    });
  }

  $('btn-save-properties').addEventListener('click', () => {
    if (!currentId) return;
    const inputs = document.querySelectorAll('#properties-list input');
    const updates = [];
    inputs.forEach((input) => {
      updates.push({ key: input.dataset.key, value: input.value });
    });
    dbRoot.child(currentId).child('propertyUpdates').push({ updates, ts: Date.now(), handled: false });
    $('properties-message').textContent = '저장 요청을 보냈습니다. (에이전트가 처리 중, 적용하려면 서버 재시작 필요)';
  });

  // ---------- 플러그인 ----------
  function renderPlugins(list) {
    const listEl = $('plugins-list');
    listEl.innerHTML = '';
    list.forEach((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      listEl.appendChild(li);
    });
  }

  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) uploadPlugin(fileInput.files[0]);
  });
  ['dragover', 'dragleave', 'drop'].forEach((evt) => dropZone.addEventListener(evt, (e) => e.preventDefault()));
  dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-over'));
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) uploadPlugin(file);
  });

  function uploadPlugin(file) {
    if (!currentId) return alert('먼저 서버를 선택해주세요.');
    if (!file.name.toLowerCase().endsWith('.jar')) return alert('.jar 파일만 업로드할 수 있습니다.');
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      dbRoot.child(currentId).child('pluginUploads').push({
        filename: file.name,
        data: base64,
        ts: Date.now(),
        handled: false
      });
    };
    reader.readAsDataURL(file);
  }

  // ---------- 서버 추가 ----------
  $('btn-add-server').addEventListener('click', () => $('add-modal').classList.remove('hidden'));
  $('btn-cancel-add').addEventListener('click', () => $('add-modal').classList.add('hidden'));

  function slugify(name) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[.#$\[\]\/\s]+/g, '-')
      .replace(/[^a-z0-9\-가-힣]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  $('btn-confirm-add').addEventListener('click', () => {
    const name = $('input-name').value.trim();
    const path = $('input-path').value.trim();
    const startScript = $('input-script').value.trim() || 'start.bat';
    const computerId = $('input-computer').value.trim() || 'default';

    if (!name || !path) {
      alert('서버 이름과 경로를 입력해주세요.');
      return;
    }

    let id = slugify(name) || 'server';
    if (servers[id]) {
      id = id + '-' + Date.now().toString(36);
    }

    dbRoot.child(id).child('meta').set({
      name, path, startScript, computerId,
      propertiesFile: 'server.properties',
      pluginsDir: 'plugins'
    }).then(() => {
      $('add-modal').classList.add('hidden');
      $('input-name').value = '';
      $('input-path').value = '';
      $('input-script').value = 'start.bat';
      selectServer(id);
    });
  });

  // ---------- 방문자 사이트 제어 ----------
  const VS_TOGGLE_IDS = ['disabled', 'hideStatus', 'hidePlayers', 'hideMonitor', 'hideConsole', 'hideStart', 'hideMap'];

  $('btn-visitor-settings').addEventListener('click', () => {
    dbVisitorSettings.get().then((snap) => {
      const settings = snap.val() || {};
      VS_TOGGLE_IDS.forEach((key) => {
        $('vs-' + key).checked = !!settings[key];
      });
      $('visitor-settings-modal').classList.remove('hidden');
    });
  });

  $('btn-cancel-visitor-settings').addEventListener('click', () => {
    $('visitor-settings-modal').classList.add('hidden');
  });

  $('btn-save-visitor-settings').addEventListener('click', () => {
    const settings = {};
    VS_TOGGLE_IDS.forEach((key) => {
      settings[key] = $('vs-' + key).checked;
    });
    dbVisitorSettings.set(settings).then(() => {
      $('visitor-settings-modal').classList.add('hidden');
    });
  });
})();
