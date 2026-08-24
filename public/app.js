// Socket.io 연결 초기화
const socket = io();

// 전역 상태 정의
let roster = [];
let rounds = [];
let activeRoundId = null;
let editingSetup = false;
let editingMembers = false;
let myName = null;
let busy = 0;

async function withBusy(fn) {
  busy++;
  try { await fn(); }
  finally { busy--; }
}

function uid() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(() => t.classList.remove('show'), 1800);
}

// 로컬 스토리지 이름 관리
async function loadMyName() {
  try { myName = localStorage.getItem('ncs_my_name'); }
  catch (e) { myName = null; }
}

async function saveMyName() {
  try {
    if (myName) localStorage.setItem('ncs_my_name', myName);
    else localStorage.removeItem('ncs_my_name');
  } catch (e) {}
}

// 서버로부터 데이터 불러오기 (Promisify)
function fetchServerData(key) {
  return new Promise((resolve) => {
    socket.emit('getData', key, (res) => {
      resolve(res);
    });
  });
}

// 서버로 데이터 저장하기 요청
function saveServerData(key, value) {
  socket.emit('setData', { key, value });
}

// 초기 데이터 로드 함수
async function loadAll() {
  try {
    const r = await fetchServerData('roster');
    roster = r || [];
  } catch (e) { showToast('불러오기 실패'); }
  
  try {
    const rd = await fetchServerData('rounds');
    rounds = rd || [];
  } catch (e) { showToast('불러오기 실패'); }
  
  try {
    const a = await fetchServerData('activeRoundId');
    activeRoundId = a || null;
  } catch (e) { activeRoundId = null; }
}

async function saveRoster() {
  saveServerData('roster', roster);
}

async function saveRounds() {
  saveServerData('rounds', rounds);
}

async function saveActive() {
  saveServerData('activeRoundId', activeRoundId);
}

function getActiveRound() {
  return rounds.find(r => r.id === activeRoundId) || null;
}

// 계산 로직
function computeQuestionStats(round) {
  const stats = [];
  for (let q = 1; q <= round.totalQuestions; q++) {
    let o = 0, x = 0;
    roster.forEach(m => {
      const v = round.results[m] && round.results[m][q];
      if (v === 'O') o++;
      else if (v === 'X') x++;
    });
    const graded = o + x;
    stats.push({ q, o, x, graded, rate: graded > 0 ? x / graded : -1 });
  }
  return stats;
}

function computeMemberStats(round) {
  return roster.map(m => {
    let o = 0, x = 0;
    for (let q = 1; q <= round.totalQuestions; q++) {
      const v = round.results[m] && round.results[m][q];
      if (v === 'O') o++;
      else if (v === 'X') x++;
    }
    const graded = o + x;
    return { name: m, o, x, graded, acc: graded > 0 ? o / graded : -1 };
  });
}

function cycleMark(round, member, q) {
  if (!round.results[member]) round.results[member] = {};
  const cur = round.results[member][q];
  let next;
  if (cur === 'O') next = 'X';
  else if (cur === 'X') next = null;
  else next = 'O';

  if (next) round.results[member][q] = next;
  else delete round.results[member][q];
}

// UI 렌더링 로직
function renderTabs() {
  const wrap = document.getElementById('tabs');
  const cardWrap = document.getElementById('roundTabsCard');
  if (rounds.length === 0) { cardWrap.style.display = 'none'; return; }
  
  cardWrap.style.display = 'block';
  wrap.innerHTML = '';
  
  rounds.forEach(r => {
    const el = document.createElement('div');
    el.className = 'tab' + (r.id === activeRoundId ? ' active' : '');
    el.textContent = r.title;
    el.onclick = () => { withBusy(async () => { activeRoundId = r.id; await saveActive(); render(); }); };
    wrap.appendChild(el);
  });

  const plus = document.createElement('div');
  plus.className = 'tab new';
  plus.textContent = '+ 새 회차';
  plus.onclick = openSetupForNewRound;
  wrap.appendChild(plus);

  const round = getActiveRound();
  if (round) {
    let marked = 0, total = roster.length * round.totalQuestions;
    roster.forEach(m => {
      for (let q = 1; q <= round.totalQuestions; q++) {
        if (round.results[m] && round.results[m][q]) marked++;
      }
    });
    const pct = total > 0 ? Math.round(marked / total * 100) : 0;
    document.getElementById('progressLabel').textContent = round.title + ' 진행률';
    document.getElementById('progressPct').textContent = marked + ' / ' + total + ' (' + pct + '%)';
    document.getElementById('progressFill').style.width = pct + '%';
  }
}

function renderSetup() {
  const setupCard = document.getElementById('setupCard');
  const shouldShowSetup = rounds.length === 0 || editingSetup;
  setupCard.style.display = shouldShowSetup ? 'block' : 'none';
  document.getElementById('cancelSetupBtn').style.display = (editingSetup && rounds.length > 0) ? 'inline-block' : 'none';
}

function renderMembersEdit() {
  const card = document.getElementById('membersEditCard');
  card.style.display = editingMembers ? 'block' : 'none';
  if (editingMembers) renderMemberChips();
}

function renderMemberChips() {
  const chipWrap = document.getElementById('memberChips');
  chipWrap.innerHTML = '';
  roster.forEach(m => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = '<span></span>';
    chip.querySelector('span').textContent = m;
    
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.onclick = async () => {
      await withBusy(async () => {
        roster = roster.filter(x => x !== m);
        await saveRoster();
        rounds.forEach(r => { if (r.results[m]) delete r.results[m]; });
        await saveRounds();
        render();
      });
    };
    chip.appendChild(btn);
    chipWrap.appendChild(chip);
  });
  document.getElementById('memberHint').textContent = roster.length === 0 ? '스터디원을 1명 이상 추가해주세요.' : roster.length + '명 등록됨';
}

function renderMain() {
  const round = getActiveRound();
  const mainArea = document.getElementById('mainArea');
  const emptyState = document.getElementById('emptyState');

  if (!round || editingSetup) {
    mainArea.style.display = 'none';
    emptyState.style.display = (rounds.length === 0 && !editingSetup) ? 'block' : 'none';
    return;
  }
  emptyState.style.display = 'none';
  mainArea.style.display = 'block';

  renderSheet(round);
  renderRanking(round);
  renderMemberStats(round);
  renderMembersEdit();
}

function renderSheet(round) {
  const table = document.getElementById('sheetTable');
  table.innerHTML = '';
  
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  const thq = document.createElement('th');
  thq.className = 'qcol';
  thq.textContent = '문제';
  trh.appendChild(thq);

  roster.forEach(m => {
    const th = document.createElement('th');
    th.className = 'member-th';
    th.innerHTML = '<div>' + m + '</div>';
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let q = 1; q <= round.totalQuestions; q++) {
    const tr = document.createElement('tr');
    const tdq = document.createElement('td');
    tdq.className = 'qnum';
    tdq.textContent = q;
    tr.appendChild(tdq);

    roster.forEach(m => {
      const td = document.createElement('td');
      td.className = 'markcell';
      const v = round.results[m] && round.results[m][q];
      td.innerHTML = markSpan(v);
      td.onclick = async () => {
        await withBusy(async () => {
          cycleMark(round, m, q);
          await saveRounds();
          render();
        });
      };
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

function markSpan(v) {
  if (v === 'O') return '<span class="mark o">O</span>';
  if (v === 'X') return '<span class="mark x">X</span>';
  return '<span class="mark blank">·</span>';
}

function renderRanking(round) {
  const stats = computeQuestionStats(round).filter(s => s.graded > 0).sort((a, b) => b.rate - a.rate || b.x - a.x);
  const list = document.getElementById('rankList');
  list.innerHTML = '';

  if (stats.length === 0) {
    list.innerHTML = '<div class="rank-empty">채점된 문제가 아직 없어요.</div>';
    return;
  }

  stats.slice(0, 10).forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'rank-item';
    const pct = Math.round(s.rate * 100);
    item.innerHTML =
      '<div class="rank-badge">' + (i + 1) + '</div>' +
      '<div class="rank-body">' +
        '<div class="rank-top"><span>' + s.q + '번 문제</span><span class="rank-pct">' + pct + '% 오답 (' + s.x + '/' + s.graded + ')</span></div>' +
        '<div class="rank-bar-track"><div class="rank-bar-fill" style="width:' + pct + '%;"></div></div>' +
      '</div>';
    list.appendChild(item);
  });
}

function renderMemberStats(round) {
  const stats = computeMemberStats(round);
  const wrap = document.getElementById('memberStats');
  wrap.innerHTML = '';

  if (roster.length === 0) {
    wrap.innerHTML = '<div class="rank-empty">스터디원이 없어요.</div>';
    return;
  }

  stats.forEach(s => {
    const overallPct = round.totalQuestions > 0 ? Math.round(s.o / round.totalQuestions * 100) : 0;
    const solvedPct = s.graded > 0 ? Math.round(s.acc * 100) : 0;
    const block = document.createElement('div');
    block.className = 'member-block';
    block.innerHTML =
      '<div class="member-name">' + s.name + '</div>' +
      '<div class="member-substat">' +
        '<span class="sub-label">전체 정답률</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + overallPct + '%;"></div></div>' +
        '<span class="pct">' + overallPct + '%</span>' +
      '</div>' +
      '<div class="member-substat">' +
        '<span class="sub-label">푼 문제 중</span>' +
        '<div class="bar-track"><div class="bar-fill alt" style="width:' + solvedPct + '%;"></div></div>' +
        '<span class="pct">' + (s.graded > 0 ? solvedPct + '%' : '-') + '</span>' +
      '</div>';
    wrap.appendChild(block);
  });
}

function openSetupForNewRound() {
  editingSetup = true;
  document.getElementById('roundTitle').value = '';
  document.getElementById('qCount').value = 30;
  render();
}

function renderJoin() {
  const joinCard = document.getElementById('joinCard');
  const whoAmI = document.getElementById('whoAmI');

  if (!myName) {
    joinCard.style.display = 'block';
    whoAmI.style.display = 'none';
    return;
  }

  joinCard.style.display = 'none';
  whoAmI.style.display = 'block';
  whoAmI.innerHTML = myName + '님으로 입장 중 · <span id="changeNameLink" style="text-decoration:underline;cursor:pointer;">이름 변경</span>';
  
  document.getElementById('changeNameLink').onclick = () => {
    withBusy(async () => {
      myName = null;
      await saveMyName();
      render();
    });
  };
}

function render() {
  renderJoin();
  if (!myName) {
    document.getElementById('roundTabsCard').style.display = 'none';
    document.getElementById('setupCard').style.display = 'none';
    document.getElementById('mainArea').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    return;
  }
  renderTabs();
  renderSetup();
  renderMain();
}

// 이벤트 핸들러 바인딩
document.getElementById('addMemberBtn').onclick = async () => {
  const input = document.getElementById('memberInput');
  const name = input.value.trim();
  if (!name) return;
  if (roster.includes(name)) { showToast('이미 등록된 이름이에요'); return; }

  await withBusy(async () => {
    roster.push(name);
    input.value = '';
    await saveRoster();
    render();
  });
};

document.getElementById('memberInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('addMemberBtn').click();
});

document.getElementById('joinBtn').onclick = async () => {
  const input = document.getElementById('myNameInput');
  const name = input.value.trim();
  if (!name) { showToast('이름을 입력해주세요'); return; }

  await withBusy(async () => {
    myName = name;
    await saveMyName();
    if (!roster.includes(name)) {
      roster.push(name);
      await saveRoster();
    }
    render();
    showToast(name + '님, 환영해요');
  });
};

document.getElementById('myNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('joinBtn').click();
});

document.getElementById('startRoundBtn').onclick = async () => {
  const titleInput = document.getElementById('roundTitle');
  const qInput = document.getElementById('qCount');
  const title = titleInput.value.trim() || ('회차 ' + (rounds.length + 1));
  const qCount = Math.max(1, Math.min(200, parseInt(qInput.value, 10) || 30));

  await withBusy(async () => {
    const round = { id: uid(), title, totalQuestions: qCount, results: {}, createdAt: Date.now() };
    rounds.push(round);
    activeRoundId = round.id;
    editingSetup = false;
    await saveRounds();
    await saveActive();
    render();
    showToast('채점 시작!');
  });
};

document.getElementById('cancelSetupBtn').onclick = () => {
  editingSetup = false;
  render();
};

document.getElementById('deleteRoundBtn').onclick = async () => {
  const round = getActiveRound();
  if (!round) return;
  const ok = confirm('"' + round.title + '" 회차를 삭제할까요?\n채점 기록이 모두 사라지고 되돌릴 수 없어요.');
  if (!ok) return;

  await withBusy(async () => {
    rounds = rounds.filter(r => r.id !== round.id);
    activeRoundId = rounds.length > 0 ? rounds[rounds.length - 1].id : null;
    editingSetup = rounds.length === 0;
    await saveRounds();
    await saveActive();
    render();
    showToast('회차를 삭제했어요');
  });
};

document.getElementById('newRoundBtn').onclick = openSetupForNewRound;

document.getElementById('editMembersBtn').onclick = () => {
  editingMembers = !editingMembers;
  render();
};

// 앱 초기화 및 소켓 실시간 업데이트 리스너 연결
(async function init() {
  await loadMyName();
  await loadAll();

  if (myName && !roster.includes(myName)) {
    roster.push(myName);
    await saveRoster();
  }

  if (rounds.length === 0) { editingSetup = true; }
  render();
  document.body.classList.add('loaded');

  // 실시간 동기화 수신 (서버에서 데이터 변경 이벤트가 오면 즉시 반영)
  socket.on('dataUpdated', ({ key, value }) => {
    if (key === 'roster') roster = value || [];
    if (key === 'rounds') rounds = value || [];
    if (key === 'activeRoundId') activeRoundId = value || null;
    render();
  });
})();