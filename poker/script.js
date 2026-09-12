// Texas Hold'em Chips - a virtual chip tracker / companion app for a live game.
// Handles: adding players, blind rotation, full betting rounds (preflop, flop,
// turn, river), player actions (fold, check, call, bet/raise, all-in),
// side-pot calculation for all-in situations, and a table view.
// NOTE: this app does not deal or evaluate cards - it is a chip/action tracker
// meant to be used alongside a physical (or other) deck of cards. At showdown
// you manually pick the winner(s) of each pot.

(function () {
    'use strict';

    const STREETS = ['preflop', 'flop', 'turn', 'river'];

    function streetLabel(s) {
        switch (s) {
            case 'preflop': return 'Pre-Flop';
            case 'flop': return 'Flop';
            case 'turn': return 'Turn';
            case 'river': return 'River';
            case 'showdown': return 'Showdown';
            default: return 'Waiting';
        }
    }

    const state = {
        players: [], // { id, name, stack, bet, totalContributed, folded, allIn, busted }
        pot: 0,
        dealerIndex: -1,
        sbIndex: -1,
        bbIndex: -1,
        activeIndex: -1, // index of player whose turn it is
        currentBet: 0, // highest bet on the table this street
        minRaise: 0, // minimum raise increment for the next raise
        handActive: false,
        street: null, // 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
        lastRaiserIndex: -1,
        actedSinceRaise: new Set(),
        smallBlind: 5,
        bigBlind: 10,
        nextId: 1,
        handNumber: 0,
        sidePots: [], // [{ id, amount, eligiblePlayerIds, awarded }]
        awaitingShowdown: false,
    };

    // ---------- DOM references ----------
    const el = {
        handNumber: document.getElementById('handNumber'),
        streetChip: document.getElementById('streetChip'),
        potAmount: document.getElementById('potAmount'),
        tablePotAmount: document.getElementById('tablePotAmount'),
        sidePotsInline: document.getElementById('sidePotsInline'),
        pokerTable: document.getElementById('pokerTable'),
        setupSection: document.getElementById('setupSection'),
        addPlayerForm: document.getElementById('addPlayerForm'),
        playerName: document.getElementById('playerName'),
        playerStack: document.getElementById('playerStack'),
        smallBlind: document.getElementById('smallBlind'),
        bigBlind: document.getElementById('bigBlind'),
        startHandBtn: document.getElementById('startHandBtn'),
        resetGameBtn: document.getElementById('resetGameBtn'),
        playersList: document.getElementById('playersList'),
        turnIndicator: document.getElementById('turnIndicator'),
        foldBtn: document.getElementById('foldBtn'),
        checkBtn: document.getElementById('checkBtn'),
        callBtn: document.getElementById('callBtn'),
        betRaiseBtn: document.getElementById('betRaiseBtn'),
        allInBtn: document.getElementById('allInBtn'),
        betAmount: document.getElementById('betAmount'),
        quickMinRaise: document.getElementById('quickMinRaise'),
        quickHalfPot: document.getElementById('quickHalfPot'),
        quickPot: document.getElementById('quickPot'),
        showdownSection: document.getElementById('showdownSection'),
        potsToAward: document.getElementById('potsToAward'),
        logSection: document.getElementById('logSection'),
        logList: document.getElementById('logList'),
    };

    // ---------- Helpers ----------
    function log(message) {
        const li = document.createElement('li');
        li.textContent = message;
        el.logList.insertBefore(li, el.logList.firstChild);
    }

    function activePlayers() {
        // players still in the game (have chips / haven't busted)
        return state.players.filter(p => !p.busted);
    }

    function contenders() {
        // players still in the current hand (not folded, not busted)
        return state.players.filter(p => !p.busted && !p.folded);
    }

    function findNextIndex(fromIndex, predicate) {
        const n = state.players.length;
        if (n === 0) return -1;
        for (let i = 1; i <= n; i++) {
            const idx = (fromIndex + i) % n;
            if (predicate(state.players[idx])) return idx;
        }
        return -1;
    }

    function markActed(p) {
        state.actedSinceRaise.add(p.id);
    }

    // ---------- Side pot calculation ----------
    // Standard layered side-pot algorithm. Any player who put chips in the
    // pot this hand (folded or not) contributes to pot size, but only
    // non-folded players are eligible to win a given layer.
    function computeSidePots() {
        const contributors = state.players
            .filter(p => p.totalContributed > 0)
            .map(p => ({ id: p.id, amount: p.totalContributed, folded: p.folded }));

        if (contributors.length === 0) return [];

        const levels = Array.from(new Set(contributors.map(c => c.amount))).sort((a, b) => a - b);
        const pots = [];
        let prev = 0;
        let potIndex = 0;
        for (const level of levels) {
            const layerContributors = contributors.filter(c => c.amount >= level);
            const layerAmount = (level - prev) * layerContributors.length;
            if (layerAmount > 0) {
                const eligiblePlayerIds = layerContributors.filter(c => !c.folded).map(c => c.id);
                potIndex += 1;
                pots.push({
                    id: potIndex,
                    amount: layerAmount,
                    eligiblePlayerIds,
                    awarded: false,
                });
            }
            prev = level;
        }
        return pots;
    }

    // ---------- Rendering ----------
    function render() {
        el.handNumber.textContent = state.handNumber;
        el.streetChip.textContent = state.handActive || state.awaitingShowdown ? streetLabel(state.street) : 'Waiting';
        el.potAmount.textContent = state.pot;
        el.tablePotAmount.textContent = state.pot;

        renderSidePotsInline();
        renderTable();
        renderPlayersList();
        renderTurnAndActions();
        renderShowdown();

        el.startHandBtn.textContent = state.handActive ? 'Force Next Hand' : 'Start / Next Hand';
        el.startHandBtn.disabled = state.awaitingShowdown;
    }

    function renderSidePotsInline() {
        el.sidePotsInline.innerHTML = '';
        if (state.sidePots.length > 1) {
            state.sidePots.forEach((pot, i) => {
                const span = document.createElement('div');
                span.className = 'side-pot-chip' + (pot.awarded ? ' awarded' : '');
                span.textContent = `${i === 0 ? 'Main' : 'Side ' + i}: ${pot.amount}`;
                el.sidePotsInline.appendChild(span);
            });
        }
    }

    function renderTable() {
        el.pokerTable.querySelectorAll('.seat').forEach(n => n.remove());

        const n = state.players.length;
        if (n === 0) return;

        const radiusX = 44; // percent
        const radiusY = 40; // percent

        state.players.forEach((p, idx) => {
            const angle = (2 * Math.PI * idx / n) - Math.PI / 2; // start at top, go clockwise
            const x = 50 + radiusX * Math.cos(angle);
            const y = 50 + radiusY * Math.sin(angle);

            const seat = document.createElement('div');
            seat.className = 'seat';
            if (p.busted) seat.className += ' busted';
            else if (p.folded) seat.className += ' folded';
            if (p.allIn) seat.className += ' allin';
            if (state.handActive && idx === state.activeIndex) seat.className += ' active-turn';
            seat.style.left = x + '%';
            seat.style.top = y + '%';

            const badges = document.createElement('div');
            badges.className = 'seat-badges';
            if (idx === state.dealerIndex) badges.appendChild(makeBadge('D', 'dealer'));
            if (idx === state.sbIndex) badges.appendChild(makeBadge('SB', 'sb'));
            if (idx === state.bbIndex) badges.appendChild(makeBadge('BB', 'bb'));
            seat.appendChild(badges);

            const nameEl = document.createElement('div');
            nameEl.className = 'seat-name';
            nameEl.textContent = p.name;
            seat.appendChild(nameEl);

            const stackEl = document.createElement('div');
            stackEl.className = 'seat-stack';
            stackEl.textContent = p.busted ? 'Busted' : `${p.stack} chips`;
            seat.appendChild(stackEl);

            if (p.bet > 0) {
                const betEl = document.createElement('div');
                betEl.className = 'seat-bet';
                betEl.textContent = `Bet: ${p.bet}`;
                seat.appendChild(betEl);
            }

            if (p.folded && !p.busted) {
                const foldEl = document.createElement('div');
                foldEl.className = 'seat-tag';
                foldEl.textContent = 'Folded';
                seat.appendChild(foldEl);
            } else if (p.allIn) {
                const allinEl = document.createElement('div');
                allinEl.className = 'seat-tag allin-tag';
                allinEl.textContent = 'All-In';
                seat.appendChild(allinEl);
            }

            el.pokerTable.appendChild(seat);
        });
    }

    function makeBadge(text, cls) {
        const b = document.createElement('span');
        b.className = 'badge ' + cls;
        b.textContent = text;
        return b;
    }

    function renderPlayersList() {
        el.playersList.innerHTML = '';
        state.players.forEach((p, idx) => {
            const li = document.createElement('li');
            li.className = 'player-item';
            if (p.busted) li.className += ' busted';
            else if (p.folded) li.className += ' folded';
            if (state.handActive && idx === state.activeIndex) li.className += ' active-turn';

            const info = document.createElement('div');
            info.className = 'player-info';
            const nameEl = document.createElement('span');
            nameEl.className = 'name';
            nameEl.textContent = p.name;
            const metaEl = document.createElement('span');
            metaEl.className = 'meta';
            metaEl.textContent = `Stack: ${p.stack}` + (p.bet > 0 ? ` | Bet: ${p.bet}` : '') +
                (p.folded ? ' | Folded' : '') + (p.allIn ? ' | All-In' : '') + (p.busted ? ' | Busted' : '');
            info.appendChild(nameEl);
            info.appendChild(metaEl);

            const status = document.createElement('div');
            status.className = 'player-status';
            if (idx === state.dealerIndex) status.appendChild(makeBadge('D', 'dealer'));
            if (idx === state.sbIndex) status.appendChild(makeBadge('SB', 'sb'));
            if (idx === state.bbIndex) status.appendChild(makeBadge('BB', 'bb'));
            if (state.handActive && idx === state.activeIndex) status.appendChild(makeBadge('Turn', 'turn'));
            if (!state.handActive && !state.awaitingShowdown) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-player';
                removeBtn.textContent = 'Remove';
                removeBtn.addEventListener('click', () => removePlayer(p.id));
                status.appendChild(removeBtn);
            }

            li.appendChild(info);
            li.appendChild(status);
            el.playersList.appendChild(li);
        });
    }

    function renderTurnAndActions() {
        const canAct = state.handActive && state.activeIndex !== -1 && !state.awaitingShowdown;
        const current = canAct ? state.players[state.activeIndex] : null;

        if (!state.players.length) {
            el.turnIndicator.textContent = 'Add players to begin.';
        } else if (state.awaitingShowdown) {
            el.turnIndicator.textContent = 'Betting complete. Award the pot(s) below to finish the hand.';
        } else if (!state.handActive) {
            el.turnIndicator.textContent = 'No active hand. Click "Start / Next Hand" to begin.';
        } else if (current) {
            const toCall = state.currentBet - current.bet;
            const minTotal = state.currentBet + (state.minRaise || state.bigBlind);
            el.turnIndicator.textContent = toCall > 0
                ? `${streetLabel(state.street)}: ${current.name}'s turn - needs ${toCall} to call (current bet: ${state.currentBet}, min raise to: ${minTotal})`
                : `${streetLabel(state.street)}: ${current.name}'s turn - no bet to call (check, or bet at least ${state.minRaise || state.bigBlind})`;
        }

        el.foldBtn.disabled = !canAct;
        el.allInBtn.disabled = !canAct || (current && current.stack <= 0);
        el.betRaiseBtn.disabled = !canAct;
        if (canAct) {
            const toCall = state.currentBet - current.bet;
            el.checkBtn.disabled = toCall > 0;
            el.callBtn.disabled = toCall <= 0 || current.stack <= 0;
        } else {
            el.checkBtn.disabled = true;
            el.callBtn.disabled = true;
        }
    }

    function renderShowdown() {
        if (!state.awaitingShowdown) {
            el.showdownSection.classList.add('hidden');
            return;
        }
        el.showdownSection.classList.remove('hidden');
        el.potsToAward.innerHTML = '';

        state.sidePots.forEach((pot, i) => {
            if (pot.awarded) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'pot-award-box';

            const title = document.createElement('h3');
            title.textContent = (i === 0 ? 'Main Pot' : `Side Pot ${i}`) + `: ${pot.amount} chips`;
            wrapper.appendChild(title);

            const eligiblePlayers = pot.eligiblePlayerIds
                .map(id => state.players.find(p => p.id === id))
                .filter(Boolean);

            if (eligiblePlayers.length === 1) {
                const onlyOne = document.createElement('p');
                onlyOne.className = 'hint';
                onlyOne.textContent = `Only ${eligiblePlayers[0].name} is eligible for this pot.`;
                wrapper.appendChild(onlyOne);
            }

            const checkList = document.createElement('div');
            checkList.className = 'winner-checklist';
            eligiblePlayers.forEach(p => {
                const label = document.createElement('label');
                label.className = 'winner-option';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = p.id;
                cb.checked = eligiblePlayers.length === 1;
                label.appendChild(cb);
                const span = document.createElement('span');
                span.textContent = p.name;
                label.appendChild(span);
                checkList.appendChild(label);
            });
            wrapper.appendChild(checkList);

            const awardBtn = document.createElement('button');
            awardBtn.textContent = eligiblePlayers.length === 1 ? 'Award Pot' : 'Award to Selected (split evenly)';
            awardBtn.className = 'award-btn';
            awardBtn.addEventListener('click', () => awardPot(pot, checkList));
            wrapper.appendChild(awardBtn);

            el.potsToAward.appendChild(wrapper);
        });
    }

    // ---------- Player management ----------
    function addPlayer(name, stack) {
        state.players.push({
            id: state.nextId++,
            name,
            stack,
            bet: 0,
            totalContributed: 0,
            folded: false,
            allIn: false,
            busted: false,
        });
        log(`${name} joined the table with ${stack} chips.`);
        render();
    }

    function removePlayer(id) {
        const idx = state.players.findIndex(p => p.id === id);
        if (idx === -1) return;
        const [removed] = state.players.splice(idx, 1);
        log(`${removed.name} left the table.`);
        if (state.dealerIndex >= state.players.length) state.dealerIndex = state.players.length - 1;
        render();
    }

    function resetGame() {
        state.players = [];
        state.pot = 0;
        state.dealerIndex = -1;
        state.sbIndex = -1;
        state.bbIndex = -1;
        state.activeIndex = -1;
        state.currentBet = 0;
        state.minRaise = 0;
        state.handActive = false;
        state.street = null;
        state.lastRaiserIndex = -1;
        state.actedSinceRaise = new Set();
        state.handNumber = 0;
        state.sidePots = [];
        state.awaitingShowdown = false;
        el.logList.innerHTML = '';
        el.setupSection.open = true;
        el.logSection.open = false;
        log('Game reset.');
        render();
    }

    // ---------- Hand flow ----------
    function startHand() {
        const players = activePlayers();
        if (players.length < 2) {
            alert('You need at least 2 players (with chips) to start a hand.');
            return;
        }

        state.smallBlind = Math.max(0, parseInt(el.smallBlind.value, 10) || 0);
        state.bigBlind = Math.max(0, parseInt(el.bigBlind.value, 10) || 0);

        // reset per-hand state
        state.players.forEach(p => {
            if (!p.busted) {
                p.folded = false;
                p.allIn = false;
            }
            p.bet = 0;
            p.totalContributed = 0;
        });
        state.pot = 0;
        state.currentBet = 0;
        state.minRaise = state.bigBlind;
        state.actedSinceRaise = new Set();
        state.sidePots = [];
        state.awaitingShowdown = false;
        state.street = 'preflop';
        state.handNumber += 1;

        // move dealer button to next non-busted player
        state.dealerIndex = findNextIndex(state.dealerIndex, p => !p.busted);
        if (state.dealerIndex === -1) {
            alert('Not enough players to start a hand.');
            return;
        }

        const active = contenders();
        if (active.length === 2) {
            // heads-up: dealer posts small blind, other posts big blind.
            // Dealer/SB also acts first preflop, and last (out of position) postflop.
            state.sbIndex = state.dealerIndex;
            state.bbIndex = findNextIndex(state.dealerIndex, p => !p.busted && !p.folded);
            postBlind(state.sbIndex, state.smallBlind);
            postBlind(state.bbIndex, state.bigBlind);
            state.activeIndex = state.sbIndex;
        } else {
            state.sbIndex = findNextIndex(state.dealerIndex, p => !p.busted && !p.folded);
            state.bbIndex = findNextIndex(state.sbIndex, p => !p.busted && !p.folded);
            postBlind(state.sbIndex, state.smallBlind);
            postBlind(state.bbIndex, state.bigBlind);
            state.activeIndex = findNextIndex(state.bbIndex, p => !p.busted && !p.folded);
        }

        const sbPlayer = state.players[state.sbIndex];
        const bbPlayer = state.players[state.bbIndex];
        state.currentBet = Math.max(sbPlayer ? sbPlayer.bet : 0, bbPlayer ? bbPlayer.bet : 0);
        state.handActive = true;

        el.setupSection.open = false;
        el.logSection.open = false;

        log(`--- Hand #${state.handNumber} started. Dealer: ${state.players[state.dealerIndex].name} ---`);
        log(`--- ${streetLabel(state.street)} ---`);

        // If the very first action is already capped (e.g. both players all-in on the blinds),
        // run the board out immediately.
        maybeAutoAdvance();
        render();
    }

    function postBlind(idx, amount) {
        if (idx === -1) return;
        const p = state.players[idx];
        const post = Math.min(amount, p.stack);
        p.stack -= post;
        p.bet += post;
        p.totalContributed += post;
        state.pot += post;
        if (p.stack === 0) p.allIn = true;
        log(`${p.name} posts blind of ${post}.`);
    }

    function bettingCapped(stillToAct) {
        if (stillToAct.length === 0) return true;
        if (stillToAct.length === 1 && stillToAct[0].bet === state.currentBet) return true;
        return false;
    }

    function maybeAutoAdvance() {
        // Called right after blinds are posted, in case action is already capped.
        const contendersNow = contenders();
        if (contendersNow.length <= 1) {
            endHandByFold();
            return;
        }
        const stillToAct = contendersNow.filter(p => !p.allIn);
        if (bettingCapped(stillToAct)) {
            runOutRemainingStreets();
        }
    }

    function advanceTurn() {
        const contendersNow = contenders();
        if (contendersNow.length <= 1) {
            endHandByFold();
            return;
        }

        const stillToAct = contendersNow.filter(p => !p.allIn);

        if (bettingCapped(stillToAct)) {
            runOutRemainingStreets();
            return;
        }

        const allMatched = stillToAct.every(p => p.bet === state.currentBet && state.actedSinceRaise.has(p.id));

        if (allMatched) {
            advanceStreet();
            return;
        }

        const next = findNextIndex(state.activeIndex, p => !p.busted && !p.folded && !p.allIn);
        if (next === -1) {
            advanceStreet();
            return;
        }
        state.activeIndex = next;
        render();
    }

    function advanceStreet() {
        state.players.forEach(p => { p.bet = 0; });
        state.currentBet = 0;
        state.minRaise = state.bigBlind;
        state.actedSinceRaise = new Set();

        const idx = STREETS.indexOf(state.street);
        if (idx === STREETS.length - 1) {
            goToShowdown();
            return;
        }
        state.street = STREETS[idx + 1];
        log(`--- ${streetLabel(state.street)} ---`);

        const first = findNextIndex(state.dealerIndex, p => !p.busted && !p.folded && !p.allIn);
        if (first === -1) {
            runOutRemainingStreets();
            return;
        }
        state.activeIndex = first;
        render();
    }

    function runOutRemainingStreets() {
        state.players.forEach(p => { p.bet = 0; });
        state.currentBet = 0;
        let idx = STREETS.indexOf(state.street);
        while (idx < STREETS.length - 1) {
            idx += 1;
            state.street = STREETS[idx];
            log(`--- ${streetLabel(state.street)} (no further betting possible) ---`);
        }
        goToShowdown();
    }

    function goToShowdown() {
        state.street = 'showdown';
        state.activeIndex = -1;
        state.sidePots = computeSidePots();
        state.awaitingShowdown = true;

        if (state.sidePots.length === 0) {
            // Shouldn't normally happen, but guard against an empty pot.
            finishHandCommon();
            return;
        }

        log(`--- Showdown --- Select the winner(s) for ${state.sidePots.length > 1 ? 'each pot' : 'the pot'} below.`);
        render();
    }

    function awardPot(pot, checkListEl) {
        const selectedIds = Array.from(checkListEl.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => parseInt(cb.value, 10));

        if (selectedIds.length === 0) {
            alert('Select at least one winner for this pot.');
            return;
        }

        const winners = selectedIds
            .map(id => state.players.find(p => p.id === id))
            .filter(Boolean);

        const share = Math.floor(pot.amount / winners.length);
        let remainder = pot.amount - share * winners.length;

        // Give any odd remainder chip(s) to players closest to the left of the dealer
        // (standard poker convention), one chip at a time.
        const orderedWinners = winners.slice().sort((a, b) => {
            const posA = (state.players.indexOf(a) - state.dealerIndex + state.players.length) % state.players.length;
            const posB = (state.players.indexOf(b) - state.dealerIndex + state.players.length) % state.players.length;
            return posA - posB;
        });

        orderedWinners.forEach(w => { w.stack += share; });
        for (let i = 0; i < remainder; i++) {
            orderedWinners[i % orderedWinners.length].stack += 1;
        }

        pot.awarded = true;
        const potLabel = state.sidePots.indexOf(pot) === 0 ? 'main pot' : 'a side pot';
        log(`${orderedWinners.map(w => w.name).join(', ')} win${orderedWinners.length === 1 ? 's' : ''} ${potLabel} of ${pot.amount} chips.`);

        if (state.sidePots.every(sp => sp.awarded)) {
            finishHandCommon();
        } else {
            render();
        }
    }

    function endHandByFold() {
        const winner = contenders()[0];
        if (winner) {
            winner.stack += state.pot;
            log(`${winner.name} wins the pot of ${state.pot} (everyone else folded).`);
        }
        finishHandCommon();
    }

    function finishHandCommon() {
        state.players.forEach(p => {
            p.bet = 0;
            if (p.stack <= 0 && !p.busted) {
                p.busted = true;
                log(`${p.name} is busted (out of chips).`);
            }
        });
        state.pot = 0;
        state.currentBet = 0;
        state.minRaise = 0;
        state.activeIndex = -1;
        state.handActive = false;
        state.awaitingShowdown = false;
        state.sidePots = [];

        const remainingPlayers = activePlayers();
        if (remainingPlayers.length < 2) {
            if (remainingPlayers.length === 1) {
                log(`${remainingPlayers[0].name} is the last player standing!`);
            }
            el.setupSection.open = true;
        }

        render();
    }

    // ---------- Actions ----------
    function doFold() {
        const p = state.players[state.activeIndex];
        if (!p) return;
        p.folded = true;
        log(`${p.name} folds.`);
        advanceTurn();
    }

    function doCheck() {
        const p = state.players[state.activeIndex];
        if (!p) return;
        if (p.bet !== state.currentBet) {
            alert('You cannot check, there is a bet to call.');
            return;
        }
        log(`${p.name} checks.`);
        markActed(p);
        advanceTurn();
    }

    function doCall() {
        const p = state.players[state.activeIndex];
        if (!p) return;
        const toCall = state.currentBet - p.bet;
        if (toCall <= 0) {
            alert('Nothing to call.');
            return;
        }
        const amount = Math.min(toCall, p.stack);
        p.stack -= amount;
        p.bet += amount;
        p.totalContributed += amount;
        state.pot += amount;
        if (p.stack === 0) p.allIn = true;
        log(`${p.name} calls ${amount}${p.allIn ? ' (all-in)' : ''}.`);
        markActed(p);
        advanceTurn();
    }

    function doBetRaise() {
        const p = state.players[state.activeIndex];
        if (!p) return;
        const raiseTo = parseInt(el.betAmount.value, 10);
        if (!raiseTo || raiseTo <= 0) {
            alert('Enter a valid bet/raise amount (total amount you want your bet to be).');
            return;
        }
        if (raiseTo <= state.currentBet) {
            alert(`Your bet must be greater than the current bet of ${state.currentBet}.`);
            return;
        }
        const needed = raiseTo - p.bet;
        if (needed > p.stack) {
            alert('You do not have enough chips for that bet. Use All-In instead.');
            return;
        }
        const minTotal = state.currentBet + (state.minRaise || state.bigBlind);
        const isAllIn = needed === p.stack;
        if (raiseTo < minTotal && !isAllIn) {
            alert(`Minimum bet/raise is to ${minTotal} (unless going all-in for less).`);
            return;
        }

        const raiseIncrement = raiseTo - state.currentBet;
        const isFirstWagerThisStreet = state.currentBet === 0;
        p.stack -= needed;
        p.bet += needed;
        p.totalContributed += needed;
        state.pot += needed;
        state.currentBet = p.bet;
        if (p.stack === 0) p.allIn = true;
        if (raiseIncrement >= state.minRaise || state.minRaise === 0) {
            state.minRaise = raiseIncrement;
        }
        log(`${p.name} ${isFirstWagerThisStreet ? 'bets' : 'raises to'} ${p.bet}${p.allIn ? ' (all-in)' : ''}.`);
        state.actedSinceRaise = new Set([p.id]);
        el.betAmount.value = '';
        advanceTurn();
    }

    function doAllIn() {
        const p = state.players[state.activeIndex];
        if (!p) return;
        const amount = p.stack;
        if (amount <= 0) {
            alert('No chips left to go all-in.');
            return;
        }
        p.bet += amount;
        p.stack = 0;
        p.allIn = true;
        p.totalContributed += amount;
        state.pot += amount;
        if (p.bet > state.currentBet) {
            const raiseIncrement = p.bet - state.currentBet;
            state.currentBet = p.bet;
            if (raiseIncrement >= state.minRaise || state.minRaise === 0) {
                state.minRaise = raiseIncrement;
            }
            state.actedSinceRaise = new Set([p.id]);
        } else {
            markActed(p);
        }
        log(`${p.name} goes all-in for ${amount}.`);
        advanceTurn();
    }

    // ---------- Quick amount helpers ----------
    function currentPlayerOrNull() {
        if (!state.handActive || state.activeIndex === -1) return null;
        return state.players[state.activeIndex];
    }

    function fillMinRaise() {
        const p = currentPlayerOrNull();
        if (!p) return;
        const minTotal = state.currentBet + (state.minRaise || state.bigBlind);
        el.betAmount.value = Math.min(minTotal, p.bet + p.stack);
    }

    function fillPotFraction(fraction) {
        const p = currentPlayerOrNull();
        if (!p) return;
        const potAfterCall = state.pot + Math.max(0, state.currentBet - p.bet);
        const target = p.bet + Math.max(0, state.currentBet - p.bet) + Math.round(potAfterCall * fraction);
        el.betAmount.value = Math.min(target, p.bet + p.stack);
    }

    // ---------- Event wiring ----------
    el.addPlayerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const name = el.playerName.value.trim();
        const stack = parseInt(el.playerStack.value, 10);
        if (!name || !stack || stack <= 0) return;
        addPlayer(name, stack);
        el.playerName.value = '';
        el.playerStack.value = '1000';
        el.playerName.focus();
    });

    el.startHandBtn.addEventListener('click', startHand);
    el.resetGameBtn.addEventListener('click', function () {
        if (confirm('Reset the whole game? This clears all players and chip counts.')) {
            resetGame();
        }
    });

    el.foldBtn.addEventListener('click', doFold);
    el.checkBtn.addEventListener('click', doCheck);
    el.callBtn.addEventListener('click', doCall);
    el.betRaiseBtn.addEventListener('click', doBetRaise);
    el.allInBtn.addEventListener('click', doAllIn);

    el.quickMinRaise.addEventListener('click', fillMinRaise);
    el.quickHalfPot.addEventListener('click', () => fillPotFraction(0.5));
    el.quickPot.addEventListener('click', () => fillPotFraction(1));

    render();
})();
