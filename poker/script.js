// Poker Chips - a virtual chip tracker / substitute for physical poker chips.
// Handles: adding players, starting hands, blinds, and player actions
// (fold, check, call, bet/raise, all-in), plus pot tracking and a hand log.

(function () {
    'use strict';

    const state = {
        players: [], // { id, name, stack, bet, folded, allIn, busted }
        pot: 0,
        dealerIndex: -1,
        activeIndex: -1, // index of player whose turn it is
        currentBet: 0, // highest bet on the table this street
        handActive: false,
        lastRaiserIndex: -1,
        actedSinceRaise: new Set(),
        smallBlind: 5,
        bigBlind: 10,
        nextId: 1,
    };

    // ---------- DOM references ----------
    const el = {
        potAmount: document.getElementById('potAmount'),
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
        logList: document.getElementById('logList'),
    };

    // ---------- Helpers ----------
    function log(message) {
        const li = document.createElement('li');
        li.textContent = message;
        el.logList.insertBefore(li, el.logList.firstChild);
    }

    function activePlayers() {
        return state.players.filter(p => !p.busted);
    }

    function contenders() {
        // players still in the hand (not folded, not busted)
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

    function render() {
        el.potAmount.textContent = state.pot;

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
            if (idx === state.dealerIndex) {
                const dealerBadge = document.createElement('span');
                dealerBadge.className = 'badge dealer';
                dealerBadge.textContent = 'D';
                status.appendChild(dealerBadge);
            }
            if (state.handActive && idx === state.activeIndex) {
                const turnBadge = document.createElement('span');
                turnBadge.className = 'badge turn';
                turnBadge.textContent = 'Turn';
                status.appendChild(turnBadge);
            }
            if (!state.handActive) {
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

        // Turn indicator + action button enablement
        const canAct = state.handActive && state.activeIndex !== -1;
        const current = canAct ? state.players[state.activeIndex] : null;

        if (!state.players.length) {
            el.turnIndicator.textContent = 'Add players to begin.';
        } else if (!state.handActive) {
            el.turnIndicator.textContent = 'No active hand. Click "Start / Next Hand" to begin.';
        } else if (current) {
            const toCall = state.currentBet - current.bet;
            el.turnIndicator.textContent = toCall > 0
                ? `${current.name}'s turn - needs ${toCall} to call (current bet: ${state.currentBet})`
                : `${current.name}'s turn - no bet to call (check or bet)`;
        }

        el.foldBtn.disabled = !canAct;
        el.allInBtn.disabled = !canAct;
        el.betRaiseBtn.disabled = !canAct;
        if (canAct) {
            const toCall = state.currentBet - current.bet;
            el.checkBtn.disabled = toCall > 0;
            el.callBtn.disabled = toCall <= 0 || current.stack <= 0;
        } else {
            el.checkBtn.disabled = true;
            el.callBtn.disabled = true;
        }

        el.startHandBtn.textContent = state.handActive ? 'Force Next Hand' : 'Start / Next Hand';
    }

    // ---------- Player management ----------
    function addPlayer(name, stack) {
        state.players.push({
            id: state.nextId++,
            name,
            stack,
            bet: 0,
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
        state.activeIndex = -1;
        state.currentBet = 0;
        state.handActive = false;
        state.lastRaiserIndex = -1;
        state.actedSinceRaise = new Set();
        el.logList.innerHTML = '';
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
        });
        state.pot = 0;
        state.currentBet = 0;
        state.actedSinceRaise = new Set();

        // move dealer button to next non-busted player
        state.dealerIndex = findNextIndex(state.dealerIndex, p => !p.busted);
        if (state.dealerIndex === -1) {
            alert('Not enough players to start a hand.');
            return;
        }

        const active = contenders();
        if (active.length === 2) {
            // heads-up: dealer posts small blind, other posts big blind
            postBlind(state.dealerIndex, state.smallBlind);
            const bbIdx = findNextIndex(state.dealerIndex, p => !p.busted && !p.folded);
            postBlind(bbIdx, state.bigBlind);
            state.activeIndex = state.dealerIndex;
        } else {
            const sbIdx = findNextIndex(state.dealerIndex, p => !p.busted && !p.folded);
            postBlind(sbIdx, state.smallBlind);
            const bbIdx = findNextIndex(sbIdx, p => !p.busted && !p.folded);
            postBlind(bbIdx, state.bigBlind);
            state.activeIndex = findNextIndex(bbIdx, p => !p.busted && !p.folded);
        }

        state.currentBet = Math.max(state.smallBlind, state.bigBlind);
        state.handActive = true;
        log(`--- New hand started. Dealer: ${state.players[state.dealerIndex].name} ---`);
        render();
    }

    function postBlind(idx, amount) {
        if (idx === -1) return;
        const p = state.players[idx];
        const post = Math.min(amount, p.stack);
        p.stack -= post;
        p.bet += post;
        state.pot += post;
        if (p.stack === 0) p.allIn = true;
        log(`${p.name} posts blind of ${post}.`);
    }

    function advanceTurn() {
        const remaining = contenders();
        if (remaining.length <= 1) {
            endHandByFold();
            return;
        }

        // check if betting round is complete: everyone still in (not all-in) has matched currentBet
        const stillToAct = contenders().filter(p => !p.allIn);
        const allMatched = stillToAct.every(p => p.bet === state.currentBet && state.actedSinceRaise.has(p.id));

        if (allMatched || stillToAct.length === 0) {
            // round complete - since we don't model streets/community cards, just settle chips display
            log('Betting round complete for this street.');
            state.actedSinceRaise = new Set();
            // For simplicity this app tracks a single betting round per "Start/Next Hand" cycle.
            // Users click "Start / Next Hand" to collect bets into the pot and move on.
            collectBetsIntoPot();
            return;
        }

        let next = findNextIndex(state.activeIndex, p => !p.busted && !p.folded && !p.allIn);
        if (next === -1) {
            collectBetsIntoPot();
            return;
        }
        state.activeIndex = next;
        render();
    }

    function collectBetsIntoPot() {
        // bets already added to pot at time of wager; just clear per-street bet markers for display
        state.players.forEach(p => {
            p.bet = 0;
        });
        state.currentBet = 0;
        state.activeIndex = -1;
        state.handActive = false;
        log(`Betting finished. Pot is ${state.pot}. Click "Start / Next Hand" to deal a new hand, or award the pot manually to the winner by adjusting stacks.`);
        render();
    }

    function endHandByFold() {
        const winner = contenders()[0];
        if (winner) {
            winner.stack += state.pot;
            log(`${winner.name} wins the pot of ${state.pot} (everyone else folded).`);
        }
        state.pot = 0;
        state.players.forEach(p => {
            p.bet = 0;
            if (p.stack <= 0 && !p.busted) {
                p.busted = true;
                log(`${p.name} is busted (out of chips).`);
            }
        });
        state.currentBet = 0;
        state.activeIndex = -1;
        state.handActive = false;
        render();
    }

    function markActed(p) {
        state.actedSinceRaise.add(p.id);
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
        state.pot += amount;
        if (p.stack === 0) p.allIn = true;
        log(`${p.name} calls ${amount}.`);
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
        p.stack -= needed;
        p.bet += needed;
        state.pot += needed;
        state.currentBet = p.bet;
        if (p.stack === 0) p.allIn = true;
        log(`${p.name} bets/raises to ${p.bet}.`);
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
        state.pot += amount;
        if (p.bet > state.currentBet) {
            state.currentBet = p.bet;
            state.actedSinceRaise = new Set([p.id]);
        } else {
            markActed(p);
        }
        log(`${p.name} goes all-in for ${amount}.`);
        advanceTurn();
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

    render();
})();
