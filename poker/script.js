(function () {
  'use strict';

  const STORAGE_KEY = 'riverbank-poker-v1';
  const STREETS = ['preflop', 'flop', 'turn', 'river'];
  const $ = (id) => document.getElementById(id);
  const money = (value) => `$${Number(value || 0).toLocaleString()}`;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  let undoStack = [];
  let modalMode = 'add';
  let toastTimer;
  let state = freshState();

  function freshState() {
    return {
      version: 1, gameName: '', smallBlind: 5, bigBlind: 10, defaultBuyIn: 500,
      startedAt: null, handNumber: 0, dealerIndex: -1, smallBlindIndex: -1,
      bigBlindIndex: -1, activeIndex: -1, street: null, handActive: false,
      showdown: false, currentBet: 0, minRaise: 10, pot: 0, players: [],
      pots: [], acted: [], raiseLocked: [], history: [], handLog: []
    };
  }

  function snapshot() {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > 30) undoStack.shift();
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function restoreSaved() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || !parsed.startedAt || !Array.isArray(parsed.players)) return false;
      state = parsed;
      undoStack = [];
      openGame();
      toast('Saved game restored');
      return true;
    } catch (_) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
  }

  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
  }

  function addSetupRow(name = '', buyIn) {
    if ($('setupPlayers').children.length >= 9) return;
    const row = document.createElement('div');
    row.className = 'setup-player';
    row.innerHTML = `<span class="seat-number"></span><input class="setup-name" maxlength="20" placeholder="Player name" value="${escapeAttr(name)}" aria-label="Player name"><input class="buyin-input" type="number" min="1" value="${buyIn || $('defaultBuyIn').value || 500}" aria-label="Buy-in"><button class="remove-setup-player" type="button" aria-label="Remove player">×</button>`;
    row.querySelector('button').addEventListener('click', () => {
      if ($('setupPlayers').children.length > 2) row.remove();
      renumberSetupRows();
    });
    $('setupPlayers').appendChild(row);
    renumberSetupRows();
  }

  function renumberSetupRows() {
    [...$('setupPlayers').children].forEach((row, i) => row.querySelector('.seat-number').textContent = i + 1);
    $('addSetupPlayer').disabled = $('setupPlayers').children.length >= 9;
  }

  function escapeAttr(text) {
    return String(text).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function beginSession(event) {
    event.preventDefault();
    const names = [...document.querySelectorAll('.setup-name')].map(input => input.value.trim());
    const rows = [...document.querySelectorAll('.setup-player')];
    const sb = Number($('setupSmallBlind').value);
    const bb = Number($('setupBigBlind').value);
    $('setupError').textContent = '';
    if (names.filter(Boolean).length < 2) return setupError('Add at least two player names.');
    if (new Set(names.filter(Boolean).map(n => n.toLowerCase())).size !== names.filter(Boolean).length) return setupError('Player names must be unique.');
    if (sb <= 0 || bb < sb * 2) return setupError('Big blind must be at least twice the small blind.');

    state = freshState();
    state.gameName = $('gameName').value.trim() || 'Poker Night';
    state.smallBlind = sb;
    state.bigBlind = bb;
    state.minRaise = bb;
    state.defaultBuyIn = Number($('defaultBuyIn').value) || 500;
    state.startedAt = Date.now();
    rows.forEach((row, index) => {
      const name = row.querySelector('.setup-name').value.trim();
      const buyIn = Number(row.querySelector('.buyin-input').value);
      if (name) state.players.push(makePlayer(name, buyIn > 0 ? buyIn : state.defaultBuyIn, index));
    });
    save();
    openGame();
  }

  function setupError(message) {
    $('setupError').textContent = message;
  }

  function makePlayer(name, buyIn, seat) {
    return { id: uid(), name, seat, stack: buyIn, buyIns: buyIn, paidOut: 0, wins: 0, handsWon: 0, bet: 0, contributed: 0, folded: false, allIn: false, sittingOut: false };
  }

  function openGame() {
    $('setupView').classList.add('hidden');
    $('gameView').classList.remove('hidden');
    $('headerGameName').textContent = state.gameName.toUpperCase();
    $('menuGameName').textContent = state.gameName;
    render();
  }

  function activePlayers() {
    return state.players.filter(p => !p.sittingOut && p.stack > 0);
  }

  function contenders() {
    return state.players.filter(p => !p.sittingOut && !p.folded && p.contributed >= 0 && (p.stack > 0 || p.allIn));
  }

  function nextIndex(from, predicate) {
    for (let offset = 1; offset <= state.players.length; offset++) {
      const index = (from + offset + state.players.length) % state.players.length;
      if (predicate(state.players[index])) return index;
    }
    return -1;
  }

  function startHand() {
    if (activePlayers().length < 2) return toast('At least two funded players are needed');
    snapshot();
    state.handNumber += 1;
    state.street = 'preflop';
    state.handActive = true;
    state.showdown = false;
    state.pot = 0;
    state.currentBet = 0;
    state.minRaise = state.bigBlind;
    state.acted = [];
    state.raiseLocked = [];
    state.pots = [];
    state.handLog = [];
    state.players.forEach(p => Object.assign(p, { bet: 0, contributed: 0, folded: p.sittingOut || p.stack <= 0, allIn: false }));
    state.dealerIndex = nextIndex(state.dealerIndex, p => !p.folded);
    const live = activePlayers();
    if (live.length === 2) {
      state.smallBlindIndex = state.dealerIndex;
      state.bigBlindIndex = nextIndex(state.dealerIndex, p => !p.folded);
      postBlind(state.smallBlindIndex, state.smallBlind, 'small blind');
      postBlind(state.bigBlindIndex, state.bigBlind, 'big blind');
      state.activeIndex = state.smallBlindIndex;
    } else {
      state.smallBlindIndex = nextIndex(state.dealerIndex, p => !p.folded);
      state.bigBlindIndex = nextIndex(state.smallBlindIndex, p => !p.folded);
      postBlind(state.smallBlindIndex, state.smallBlind, 'small blind');
      postBlind(state.bigBlindIndex, state.bigBlind, 'big blind');
      state.activeIndex = nextIndex(state.bigBlindIndex, p => !p.folded && !p.allIn);
    }
    state.currentBet = Math.max(...state.players.map(p => p.bet));
    logHand(`Hand ${state.handNumber} begins. ${state.players[state.dealerIndex].name} has the button.`);
    autoAdvanceIfNeeded();
    commit();
  }

  function postBlind(index, amount, label) {
    const player = state.players[index];
    const paid = Math.min(player.stack, amount);
    player.stack -= paid;
    player.bet += paid;
    player.contributed += paid;
    state.pot += paid;
    player.allIn = player.stack === 0;
    logHand(`${player.name} posts ${money(paid)} ${label}.`);
  }

  function logHand(message) {
    state.handLog.push({ time: Date.now(), message });
  }

  function act(type) {
    const player = state.players[state.activeIndex];
    if (!player || !state.handActive) return;
    snapshot();
    const toCall = Math.max(0, state.currentBet - player.bet);
    if (type === 'fold') {
      player.folded = true;
      logHand(`${player.name} folds.`);
      markActed(player);
    } else if (type === 'checkCall') {
      const paid = Math.min(player.stack, toCall);
      player.stack -= paid;
      player.bet += paid;
      player.contributed += paid;
      state.pot += paid;
      player.allIn = player.stack === 0;
      logHand(toCall ? `${player.name} calls ${money(paid)}${player.allIn ? ' all-in' : ''}.` : `${player.name} checks.`);
      markActed(player);
    } else if (type === 'raise') {
      if (state.raiseLocked.includes(player.id)) { undoStack.pop(); return toast('Action was not reopened by the short all-in'); }
      const target = Number($('raiseAmount').value);
      const max = player.bet + player.stack;
      if (target <= state.currentBet || target > max) { undoStack.pop(); return toast('Choose a valid raise amount'); }
      const increase = target - state.currentBet;
      const isAllIn = target === max;
      if (increase < state.minRaise && !isAllIn) { undoStack.pop(); return toast(`Minimum raise is ${money(state.currentBet + state.minRaise)}`); }
      const paid = target - player.bet;
      const isFirstWager = state.currentBet === 0;
      const previousActors = [...state.acted];
      player.stack -= paid;
      player.bet = target;
      player.contributed += paid;
      state.pot += paid;
      player.allIn = player.stack === 0;
      const fullRaise = increase >= state.minRaise;
      if (fullRaise) state.minRaise = increase;
      state.currentBet = target;
      if (fullRaise) {
        state.acted = [player.id];
        state.raiseLocked = [];
      } else {
        state.acted = [...new Set([...state.acted, player.id])];
        state.raiseLocked = [...new Set([...state.raiseLocked, ...previousActors])];
      }
      logHand(`${player.name} ${isFirstWager ? 'bets' : 'raises to'} ${money(target)}${player.allIn ? ' all-in' : ''}.`);
    }
    advanceTurn();
    commit();
  }

  function markActed(player) {
    if (!state.acted.includes(player.id)) state.acted.push(player.id);
  }

  function autoAdvanceIfNeeded() {
    const able = contenders().filter(p => !p.allIn);
    if (able.length <= 1 && able.every(p => p.bet === state.currentBet)) runToShowdown();
  }

  function advanceTurn() {
    if (contenders().length === 1) return winByFold();
    const able = contenders().filter(p => !p.allIn);
    if (able.length <= 1 && able.every(p => p.bet === state.currentBet)) return runToShowdown();
    const roundDone = able.every(p => state.acted.includes(p.id) && p.bet === state.currentBet);
    if (roundDone) return advanceStreet();
    state.activeIndex = nextIndex(state.activeIndex, p => !p.folded && !p.sittingOut && !p.allIn && p.stack > 0);
  }

  function advanceStreet() {
    state.players.forEach(p => p.bet = 0);
    state.currentBet = 0;
    state.minRaise = state.bigBlind;
    state.acted = [];
    state.raiseLocked = [];
    const index = STREETS.indexOf(state.street);
    if (index === STREETS.length - 1) return beginShowdown();
    state.street = STREETS[index + 1];
    logHand(`${streetName(state.street)} betting begins.`);
    state.activeIndex = nextIndex(state.dealerIndex, p => !p.folded && !p.sittingOut && !p.allIn && p.stack > 0);
    if (state.activeIndex === -1) runToShowdown();
  }

  function runToShowdown() {
    state.street = 'river';
    state.players.forEach(p => p.bet = 0);
    logHand('All betting is complete. Run out the board.');
    beginShowdown();
  }

  function computePots() {
    const contributors = state.players.filter(p => p.contributed > 0);
    const levels = [...new Set(contributors.map(p => p.contributed))].sort((a, b) => a - b);
    let previous = 0;
    return levels.map((level, index) => {
      const layer = contributors.filter(p => p.contributed >= level);
      const eligible = layer.filter(p => !p.folded).map(p => p.id);
      const amount = (level - previous) * layer.length;
      previous = level;
      return { id: uid(), name: index === 0 ? 'Main pot' : `Side pot ${index}`, amount, eligible, awarded: false };
    }).filter(p => p.amount > 0 && p.eligible.length > 0);
  }

  function beginShowdown() {
    state.handActive = false;
    state.showdown = true;
    state.activeIndex = -1;
    state.street = 'showdown';
    state.pots = computePots();
    logHand('Showdown. Compare the physical cards and award each pot.');
  }

  function awardPot(potId) {
    const pot = state.pots.find(item => item.id === potId);
    const selected = [...document.querySelectorAll(`[data-pot="${potId}"]:checked`)].map(input => input.value);
    if (!selected.length) return toast('Select at least one winner');
    snapshot();
    const ordered = selected.map(id => state.players.find(p => p.id === id)).filter(Boolean).sort((a, b) => {
      const ai = state.players.indexOf(a), bi = state.players.indexOf(b);
      return ((ai - state.dealerIndex + state.players.length) % state.players.length) - ((bi - state.dealerIndex + state.players.length) % state.players.length);
    });
    const share = Math.floor(pot.amount / ordered.length);
    let remainder = pot.amount - share * ordered.length;
    ordered.forEach(player => { player.stack += share; player.wins += share; });
    for (let i = 0; i < remainder; i++) { ordered[i % ordered.length].stack += 1; ordered[i % ordered.length].wins += 1; }
    pot.awarded = true;
    pot.winners = ordered.map(p => p.name);
    logHand(`${ordered.map(p => p.name).join(' & ')} ${ordered.length > 1 ? 'split' : 'wins'} the ${pot.name.toLowerCase()} (${money(pot.amount)}).`);
    if (state.pots.every(item => item.awarded)) finishHand(ordered);
    commit();
  }

  function winByFold() {
    const winner = contenders()[0];
    winner.stack += state.pot;
    winner.wins += state.pot;
    logHand(`${winner.name} wins ${money(state.pot)} uncontested.`);
    finishHand([winner]);
  }

  function finishHand(lastWinners) {
    const potWinnerNames = state.pots.flatMap(pot => pot.winners || []);
    const names = [...new Set(potWinnerNames.length ? potWinnerNames : lastWinners.map(p => p.name))];
    state.players.filter(player => names.includes(player.name)).forEach(player => player.handsWon += 1);
    state.history.unshift({ hand: state.handNumber, time: Date.now(), pot: state.pot, winners: names, summary: state.handLog.map(item => item.message) });
    state.players.forEach(p => Object.assign(p, { bet: 0, contributed: 0, folded: false, allIn: false }));
    state.handActive = false;
    state.showdown = false;
    state.street = null;
    state.activeIndex = -1;
    state.currentBet = 0;
    state.pot = 0;
    state.pots = [];
    toast(`${names.join(' & ')} won hand ${state.handNumber}`);
  }

  function commit() {
    save();
    render();
  }

  function undo() {
    if (!undoStack.length) return;
    state = JSON.parse(undoStack.pop());
    commit();
    toast('Last action undone');
  }

  function render() {
    const active = state.handActive ? state.players[state.activeIndex] : null;
    $('handLabel').textContent = state.handNumber ? `HAND ${state.handNumber}` : 'READY';
    $('streetLabel').textContent = state.showdown ? 'Showdown' : state.handActive ? streetName(state.street) : 'Start a hand';
    $('potValue').textContent = money(state.pot);
    $('undoBtn').disabled = !undoStack.length;
    $('actionTitle').textContent = active ? `${active.name}'s turn` : state.showdown ? 'Award the pot' : 'Table ready';
    $('actionStack').textContent = active ? `${money(active.stack)} behind` : `${activePlayers().length} seated`;
    $('idleControls').classList.toggle('hidden', state.handActive || state.showdown);
    $('actionControls').classList.toggle('hidden', !state.handActive);
    $('showdownControls').classList.toggle('hidden', !state.showdown);
    $('startHandBtn').disabled = activePlayers().length < 2;
    $('addPlayerBtn').disabled = state.handActive || state.showdown || state.players.length >= 9;
    $('roundGuide').textContent = guideText(active);
    renderTable();
    renderAction(active);
    renderPots();
    renderRoster();
    renderLedger();
  }

  function streetName(street) {
    return ({ preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' })[street] || 'Between hands';
  }

  function guideText(active) {
    if (state.showdown) return 'Compare hands, then award every pot';
    if (active) return `${active.name} is deciding · ${streetName(state.street)}`;
    return state.handNumber ? 'Button will move one seat clockwise' : 'Settle in and start the first hand';
  }

  function renderTable() {
    const table = $('pokerTable');
    table.querySelectorAll('.seat').forEach(node => node.remove());
    const players = state.players;
    players.forEach((player, index) => {
      const angle = Math.PI / 2 + (Math.PI * 2 * index / players.length);
      const x = 50 + 52 * Math.cos(angle);
      const y = 50 + 59 * Math.sin(angle);
      const seat = document.createElement('div');
      seat.className = `seat${index === state.activeIndex ? ' active' : ''}${player.folded ? ' folded' : ''}${player.sittingOut || player.stack <= 0 ? ' out' : ''}`;
      seat.style.left = `${x}%`;
      seat.style.top = `${y}%`;
      let status = player.paidOut && !player.stack ? 'Cashed out' : player.sittingOut ? 'Sitting out' : player.allIn ? 'All-in' : player.folded ? 'Folded' : '';
      if (index === state.smallBlindIndex && (state.handActive || state.showdown)) status = status || 'Small blind';
      if (index === state.bigBlindIndex && (state.handActive || state.showdown)) status = status || 'Big blind';
      seat.innerHTML = `<div class="seat-card">${index === state.dealerIndex ? '<span class="dealer-button">D</span>' : ''}<div class="seat-name">${escapeAttr(player.name)}</div><div class="seat-stack">${money(player.stack)}</div>${player.bet ? `<div class="seat-bet">${money(player.bet)}</div>` : ''}<div class="seat-status">${status}</div></div>`;
      table.appendChild(seat);
    });
  }

  function renderAction(player) {
    if (!player) return;
    const toCall = Math.max(0, state.currentBet - player.bet);
    $('callout').querySelector('strong').textContent = money(toCall);
    $('checkCallBtn').querySelector('small').textContent = toCall ? `Match ${money(toCall)}` : 'Stay in';
    $('checkCallBtn').querySelector('strong').textContent = toCall ? 'Call' : 'Check';
    const min = Math.min(player.bet + player.stack, Math.max(state.currentBet + state.minRaise, state.bigBlind));
    const max = player.bet + player.stack;
    const range = $('raiseAmount');
    range.min = Math.min(min, max);
    range.max = max;
    range.step = Math.max(1, state.smallBlind);
    range.value = min;
    $('raiseBtn').disabled = max <= state.currentBet || state.raiseLocked.includes(player.id);
    updateRaiseDisplay();
  }

  function updateRaiseDisplay() {
    const amount = Number($('raiseAmount').value);
    $('raiseDisplay').textContent = money(amount);
    $('raiseButtonValue').textContent = money(amount);
  }

  function quickBet(kind) {
    const player = state.players[state.activeIndex];
    if (!player) return;
    const max = player.bet + player.stack;
    const min = Math.min(max, Math.max(state.currentBet + state.minRaise, state.bigBlind));
    const afterCallPot = state.pot + Math.max(0, state.currentBet - player.bet);
    const values = { min, half: state.currentBet + Math.round(afterCallPot / 2), pot: state.currentBet + afterCallPot, all: max };
    $('raiseAmount').value = Math.max(min, Math.min(max, values[kind]));
    updateRaiseDisplay();
  }

  function renderPots() {
    $('potBreakdown').innerHTML = state.pots.length > 1 ? state.pots.map(p => `<span class="pot-chip">${p.name} ${money(p.amount)}</span>`).join('') : '';
    const container = $('showdownPots');
    container.innerHTML = '';
    state.pots.filter(p => !p.awarded).forEach(pot => {
      const box = document.createElement('div');
      box.className = 'award-pot';
      const eligible = pot.eligible.map(id => state.players.find(p => p.id === id)).filter(Boolean);
      box.innerHTML = `<div class="award-pot-head"><span>${pot.name}</span><strong>${money(pot.amount)}</strong></div><div class="winner-options">${eligible.map((player, i) => `<label class="winner-option"><input type="checkbox" data-pot="${pot.id}" value="${player.id}" ${eligible.length === 1 || (state.pots.length === 1 && i === 0) ? 'checked' : ''}><span>${escapeAttr(player.name)}</span></label>`).join('')}</div><button class="primary award-button" type="button">Award pot</button>`;
      box.querySelector('button').addEventListener('click', () => awardPot(pot.id));
      container.appendChild(box);
    });
  }

  function renderRoster() {
    $('playerRoster').innerHTML = state.players.map(player => {
      const profit = player.stack + (player.paidOut || 0) - player.buyIns;
      const stackNote = player.paidOut && !player.stack ? `${money(player.paidOut)} paid out` : `${money(player.stack)} stack`;
      return `<article class="roster-player"><span class="avatar">${escapeAttr(player.name.slice(0, 2).toUpperCase())}</span><div><strong>${escapeAttr(player.name)}</strong><small>${stackNote} · ${profit >= 0 ? '+' : ''}${money(profit)}</small></div><div class="player-tools"><button data-rebuy="${player.id}" title="Add buy-in">＋</button><button data-sit="${player.id}" title="${player.sittingOut ? 'Sit in' : 'Sit out'}">${player.sittingOut ? '▶' : 'Ⅱ'}</button><button data-cashout="${player.id}" title="Cash out player">$</button></div></article>`;
    }).join('');
    document.querySelectorAll('[data-rebuy]').forEach(btn => btn.addEventListener('click', () => openPlayerModal('rebuy', btn.dataset.rebuy)));
    document.querySelectorAll('[data-sit]').forEach(btn => btn.addEventListener('click', () => toggleSitOut(btn.dataset.sit)));
    document.querySelectorAll('[data-cashout]').forEach(btn => btn.addEventListener('click', () => cashOutPlayer(btn.dataset.cashout)));
  }

  function renderLedger() {
    const totalBuyIns = state.players.reduce((sum, p) => sum + p.buyIns, 0);
    const unsettledPot = state.showdown ? state.pots.filter(p => !p.awarded).reduce((sum, p) => sum + p.amount, 0) : state.pot;
    const totalStacks = state.players.reduce((sum, p) => sum + p.stack + (p.paidOut || 0), 0) + unsettledPot;
    const leader = [...state.players].sort((a, b) => (b.stack - b.buyIns) - (a.stack - a.buyIns))[0];
    $('sessionBalance').textContent = totalBuyIns === totalStacks ? '✓ Ledger balanced' : `${money(totalBuyIns - totalStacks)} unsettled`;
    $('ledgerStats').innerHTML = `<div class="stat-card"><span>Total buy-ins</span><strong>${money(totalBuyIns)}</strong></div><div class="stat-card"><span>Hands played</span><strong>${state.handNumber}</strong></div><div class="stat-card"><span>Table leader</span><strong>${leader ? escapeAttr(leader.name) : '—'}</strong></div><div class="stat-card"><span>Players</span><strong>${state.players.length}</strong></div>`;
    $('handHistory').innerHTML = state.history.length ? state.history.map(hand => `<div class="history-row"><time>HAND ${hand.hand}</time><span>${escapeAttr(hand.winners.join(' & '))} won</span><b>${money(hand.pot)}</b></div>`).join('') : '<p class="empty-history">Completed hands will appear here.</p>';
  }

  function openPlayerModal(mode, playerId) {
    if (state.handActive || state.showdown) return toast('Manage players between hands');
    modalMode = mode;
    const player = state.players.find(p => p.id === playerId);
    $('playerEditId').value = playerId || '';
    $('modalPlayerName').disabled = mode === 'rebuy';
    $('modalPlayerName').value = player ? player.name : '';
    $('modalAmount').value = state.defaultBuyIn;
    $('playerModalTitle').textContent = mode === 'rebuy' ? `Rebuy for ${player.name}` : 'Add player';
    $('amountLabel').textContent = mode === 'rebuy' ? 'Additional buy-in' : 'Buy-in amount';
    $('playerModalHelp').textContent = mode === 'rebuy' ? 'This amount is added to both their stack and total buy-ins.' : 'The player joins at the next available seat.';
    showOverlay('playerModal');
    setTimeout(() => (mode === 'rebuy' ? $('modalAmount') : $('modalPlayerName')).focus(), 50);
  }

  function submitPlayer(event) {
    event.preventDefault();
    const amount = Number($('modalAmount').value);
    if (amount <= 0) return;
    snapshot();
    if (modalMode === 'rebuy') {
      const player = state.players.find(p => p.id === $('playerEditId').value);
      player.stack += amount;
      player.buyIns += amount;
      player.sittingOut = false;
      toast(`${money(amount)} added to ${player.name}`);
    } else {
      const name = $('modalPlayerName').value.trim();
      if (!name || state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) { undoStack.pop(); return toast('Enter a unique player name'); }
      if (state.players.length >= 9) { undoStack.pop(); return toast('The table is full'); }
      state.players.push(makePlayer(name, amount, state.players.length));
      toast(`${name} joined the table`);
    }
    hideOverlay('playerModal');
    commit();
  }

  function toggleSitOut(id) {
    if (state.handActive || state.showdown) return toast('Change seats between hands');
    snapshot();
    const player = state.players.find(p => p.id === id);
    if (player.sittingOut && player.stack <= 0) { undoStack.pop(); return toast('Add a buy-in before sitting back in'); }
    player.sittingOut = !player.sittingOut;
    commit();
  }

  function cashOutPlayer(id) {
    if (state.handActive || state.showdown) return toast('Cash out players between hands');
    const player = state.players.find(p => p.id === id);
    if (!player || player.stack <= 0) return toast('This player has no stack to cash out');
    if (!confirm(`Cash out ${player.name} for ${money(player.stack)}?`)) return;
    snapshot();
    const payout = player.stack;
    player.paidOut = (player.paidOut || 0) + payout;
    player.stack = 0;
    player.sittingOut = true;
    commit();
    toast(`${player.name} cashed out ${money(payout)}`);
  }

  function showOverlay(id) { $(id).classList.remove('hidden'); }
  function hideOverlay(id) { $(id).classList.add('hidden'); }

  function showCashout() {
    if (state.handActive || state.showdown) return toast('Finish the current hand first');
    $('cashoutList').innerHTML = state.players.map(player => {
      const paidOut = player.paidOut || 0;
      const profit = player.stack + paidOut - player.buyIns;
      const note = paidOut ? `${money(player.buyIns)} in · ${money(paidOut)} already paid` : `${money(player.buyIns)} bought in`;
      return `<div class="cashout-row"><div><strong>${escapeAttr(player.name)}</strong><small>${note}</small></div><strong>${money(player.stack)}</strong><span class="profit${profit < 0 ? ' negative' : ''}">${profit >= 0 ? '+' : ''}${money(profit)}</span></div>`;
    }).join('');
    hideOverlay('menuOverlay');
    showOverlay('cashoutModal');
  }

  function finishSession() {
    localStorage.removeItem(STORAGE_KEY);
    hideOverlay('cashoutModal');
    state = freshState();
    undoStack = [];
    $('gameView').classList.add('hidden');
    $('setupView').classList.remove('hidden');
    $('resumeBtn').classList.add('hidden');
    toast('Session closed and ledger cleared');
  }

  function discardSession() {
    if (!confirm('Discard this entire session? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  function showDrawer(which) {
    const ledger = which === 'ledger';
    $('rosterDrawer').classList.toggle('hidden', ledger);
    $('ledgerDrawer').classList.toggle('hidden', !ledger);
    $('playersBtn').classList.toggle('active', !ledger);
    $('ledgerBtn').classList.toggle('active', ledger);
    hideOverlay('menuOverlay');
    (ledger ? $('ledgerDrawer') : $('rosterDrawer')).scrollIntoView({ behavior: 'smooth' });
  }

  function wireEvents() {
    $('setupForm').addEventListener('submit', beginSession);
    $('addSetupPlayer').addEventListener('click', () => addSetupRow('', Number($('defaultBuyIn').value)));
    $('defaultBuyIn').addEventListener('change', (event) => document.querySelectorAll('.buyin-input').forEach(input => input.value = event.target.value));
    $('resumeBtn').addEventListener('click', restoreSaved);
    $('startHandBtn').addEventListener('click', startHand);
    $('foldBtn').addEventListener('click', () => act('fold'));
    $('checkCallBtn').addEventListener('click', () => act('checkCall'));
    $('raiseBtn').addEventListener('click', () => act('raise'));
    $('raiseAmount').addEventListener('input', updateRaiseDisplay);
    document.querySelectorAll('[data-bet]').forEach(btn => btn.addEventListener('click', () => quickBet(btn.dataset.bet)));
    $('undoBtn').addEventListener('click', undo);
    $('openMenuBtn').addEventListener('click', () => showOverlay('menuOverlay'));
    $('playersBtn').addEventListener('click', () => showDrawer('players'));
    $('ledgerBtn').addEventListener('click', () => showDrawer('ledger'));
    $('addPlayerBtn').addEventListener('click', () => openPlayerModal('add'));
    $('menuAddPlayer').addEventListener('click', () => { hideOverlay('menuOverlay'); openPlayerModal('add'); });
    $('menuHistory').addEventListener('click', () => showDrawer('ledger'));
    $('endGameBtn').addEventListener('click', showCashout);
    $('newGameBtn').addEventListener('click', discardSession);
    $('finishSessionBtn').addEventListener('click', finishSession);
    $('playerForm').addEventListener('submit', submitPlayer);
    document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => hideOverlay(btn.dataset.close)));
    document.querySelectorAll('.overlay').forEach(overlay => overlay.addEventListener('click', event => { if (event.target === overlay) hideOverlay(overlay.id); }));
  }

  function init() {
    wireEvents();
    ['Alex', 'Sam', 'Jordan', 'Casey'].forEach(name => addSetupRow(name, 500));
    $('resumeBtn').classList.toggle('hidden', !localStorage.getItem(STORAGE_KEY));
  }

  init();
})();
