import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  createDeck, cardKey, isRed, shuffle,
  evaluateESGShowdown, calculatePotLimitMax,
  createPlayers, HAND_NAMES,
} from './esgEngine';

const SMALL_BLIND = 1;
const BIG_BLIND = 3;

const SEAT_POSITIONS_MAP = {
  2: [{ x: 50, y: 88 }, { x: 50, y: 6 }],
  3: [{ x: 50, y: 88 }, { x: 15, y: 30 }, { x: 85, y: 30 }],
  4: [{ x: 50, y: 88 }, { x: 8, y: 50 }, { x: 50, y: 6 }, { x: 92, y: 50 }],
  5: [{ x: 50, y: 88 }, { x: 8, y: 60 }, { x: 20, y: 15 }, { x: 80, y: 15 }, { x: 92, y: 60 }],
  6: [{ x: 50, y: 88 }, { x: 8, y: 62 }, { x: 8, y: 28 }, { x: 50, y: 6 }, { x: 92, y: 28 }, { x: 92, y: 62 }],
  7: [{ x: 50, y: 88 }, { x: 8, y: 65 }, { x: 8, y: 35 }, { x: 30, y: 6 }, { x: 70, y: 6 }, { x: 92, y: 35 }, { x: 92, y: 65 }],
};

/* ─── Playing Card ─── */
function PlayingCard({ card, faceDown = false, small = false, style = {} }) {
  const w = small ? 48 : 70;
  const h = small ? 67 : 100;
  const rankSize = small ? 15 : 20;
  const suitSize = small ? 16 : 22;
  const pad = small ? 5 : 8;

  if (faceDown) {
    return (
      <div style={{
        width: w, height: h, borderRadius: 8, flexShrink: 0,
        background: 'linear-gradient(135deg,#1a2744 25%,#0f1d3a 25%,#0f1d3a 50%,#1a2744 50%,#1a2744 75%,#0f1d3a 75%)',
        backgroundSize: '10px 10px',
        border: '1px solid #2a3f6f',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        ...style,
      }} />
    );
  }

  const red = isRed(card);
  const color = red ? '#dc2626' : '#1a1a1a';
  return (
    <div style={{
      width: w, height: h, borderRadius: 8, flexShrink: 0,
      background: '#fff', border: '1px solid #e0e0e0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      padding: `${pad}px ${pad}px`,
      ...style,
    }}>
      <span style={{
        display: 'block', fontSize: rankSize, fontWeight: 700, color, lineHeight: 1,
        fontFamily: "'IBM Plex Mono',monospace",
      }}>
        {card.rank}
      </span>
      <span style={{ display: 'block', fontSize: suitSize, fontWeight: 700, color, lineHeight: 1, marginTop: 2 }}>
        {card.suit}
      </span>
    </div>
  );
}

/* ─── Chip count ─── */
function ChipCount({ amount }) {
  return (
    <motion.span
      key={amount}
      initial={{ scale: 1.3, color: '#fbbf24' }}
      animate={{ scale: 1, color: '#c9a84c' }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}
    >
      ${amount.toLocaleString()}
    </motion.span>
  );
}

/* ─── Action badge ─── */
function ActionBadge({ action, amount }) {
  if (!action) return null;
  const isAllIn = action === 'all-in';
  const text = isAllIn ? 'ALL IN' : action === 'raise' ? `RAISE $${amount}` : action.toUpperCase();
  const colors = {
    fold: { bg: '#7f1d1d', color: '#fca5a5' },
    check: { bg: '#14532d', color: '#86efac' },
    call: { bg: '#1e3a5f', color: '#93c5fd' },
    raise: { bg: '#713f12', color: '#fde68a' },
    'all-in': { bg: '#581c87', color: '#d8b4fe' },
  };
  const c = colors[action] || { bg: '#333', color: '#999' };
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0, y: 10 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.5, opacity: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      style={{
        position: 'absolute', top: -32, left: '50%', transform: 'translateX(-50%)',
        padding: '3px 10px', borderRadius: 20, fontSize: 11,
        fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
        whiteSpace: 'nowrap', zIndex: 30, background: c.bg, color: c.color,
      }}
    >
      {text}
    </motion.div>
  );
}

/* ─── Confetti ─── */
function Confetti({ active }) {
  const particles = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i, x: Math.random() * 100, delay: Math.random() * 0.5,
      duration: 1.5 + Math.random() * 1.5,
      color: ['#c9a84c', '#fbbf24', '#ef4444', '#3b82f6', '#10b981', '#a855f7'][i % 6],
      size: 4 + Math.random() * 6,
    })), [active]);
  if (!active) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50, overflow: 'hidden' }}>
      {particles.map(p => (
        <motion.div key={p.id}
          initial={{ x: `${p.x}vw`, y: '-5vh', rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: 360 + Math.random() * 720, opacity: [1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          style={{ position: 'absolute', width: p.size, height: p.size, background: p.color, borderRadius: 2 }}
        />
      ))}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   MAIN APP — ESG (6-3-3-3) Multiplayer Hot-Seat
   ═══════════════════════════════════════════════════════ */
export default function App() {
  // Setup state
  const [gameStarted, setGameStarted] = useState(false);
  const [playerNames, setPlayerNames] = useState(['', '']);

  // Game state
  const [players, setPlayers] = useState([]);
  const [undistributedDeck, setUndistributedDeck] = useState([]);
  const [topBoard, setTopBoard] = useState([]);
  const [bottomBoard, setBottomBoard] = useState([]);
  const [topRevealed, setTopRevealed] = useState(0);
  const [bottomRevealed, setBottomRevealed] = useState(0);
  const [pot, setPot] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [phase, setPhase] = useState('waiting');
  const [dealerIndex, setDealerIndex] = useState(0);
  const [activePlayerIndex, setActivePlayerIndex] = useState(-1);
  const [handNumber, setHandNumber] = useState(0);
  const [gameLog, setGameLog] = useState([]);
  const [showdownResults, setShowdownResults] = useState(null);
  const [winnerIds, setWinnerIds] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(BIG_BLIND * 2);
  const [playerActions, setPlayerActions] = useState({});
  const [waitingForHuman, setWaitingForHuman] = useState(false);
  const [owedCards, setOwedCards] = useState(0);

  // Pass device overlay
  const [showPassScreen, setShowPassScreen] = useState(false);
  const [passScreenPlayer, setPassScreenPlayer] = useState('');
  const [cardsVisible, setCardsVisible] = useState(false);

  const processingRef = useRef(false);
  const logRef = useRef(null);
  const humanResolveRef = useRef(null);

  const addLog = useCallback((msg) => {
    setGameLog(prev => [...prev.slice(-39), msg]);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [gameLog]);

  const numPlayers = players.length;
  const seatPositions = SEAT_POSITIONS_MAP[numPlayers] || SEAT_POSITIONS_MAP[6];
  const activePlayer = activePlayerIndex >= 0 ? players[activePlayerIndex] : null;
  const toCall = activePlayer ? currentBet - (activePlayer?.currentBet || 0) : 0;
  const canCheck = toCall <= 0;
  const potLimitMax = activePlayer ? calculatePotLimitMax(pot, currentBet, activePlayer?.currentBet || 0) : 0;
  const minRaise = Math.max(BIG_BLIND, currentBet * 2);
  const maxRaise = activePlayer ? Math.min(activePlayer.chips + activePlayer.currentBet, potLimitMax) : BIG_BLIND * 2;

  const delayMs = (ms) => new Promise(r => setTimeout(r, ms));

  function findNextActive(pList, fromIdx) {
    const total = pList.length;
    let idx = (fromIdx + 1) % total;
    for (let s = 0; s < total; s++) {
      const p = pList[idx];
      if (!p.folded && (p.chips > 0 || p.isAllIn)) return idx;
      idx = (idx + 1) % total;
    }
    return fromIdx;
  }

  function distributeCards(ps, deck, cardsPerPlayer, logFn) {
    const active = ps.filter(p => !p.folded && !p.isAllIn);
    const totalNeeded = active.length * cardsPerPlayer;
    let toGive = cardsPerPlayer;

    if (deck.length < totalNeeded) {
      toGive = Math.floor(deck.length / active.length);
      if (toGive === 0) return { deck, owed: cardsPerPlayer };
    }

    const owed = cardsPerPlayer - toGive;

    for (const p of active) {
      for (let i = 0; i < toGive; i++) {
        if (deck.length === 0) break;
        p.holeCards = [...p.holeCards, deck.pop()];
      }
    }

    if (logFn) {
      if (toGive > 0) logFn(`Dealt ${toGive} card${toGive > 1 ? 's' : ''} to each player`);
      if (owed > 0) logFn(`${owed} card${owed > 1 ? 's' : ''} owed per player (deck short)`);
    }

    return { deck, owed };
  }

  function handleFoldCards(ps, foldedPlayerIdx, deck, currentOwed, isRiver, logFn) {
    const foldedCards = ps[foldedPlayerIdx].holeCards;
    ps[foldedPlayerIdx].holeCards = [];
    ps[foldedPlayerIdx].folded = true;

    if (isRiver) {
      return { deck, owed: currentOwed };
    }

    const newDeck = shuffle([...deck, ...foldedCards]);

    if (currentOwed > 0) {
      const active = ps.filter(p => !p.folded && !p.isAllIn);
      let remaining = currentOwed;
      for (let round = 0; round < remaining; round++) {
        let distributed = false;
        for (const p of active) {
          if (newDeck.length > 0) {
            p.holeCards = [...p.holeCards, newDeck.pop()];
            distributed = true;
          }
        }
        if (distributed) {
          currentOwed--;
          if (logFn) logFn(`Distributed 1 owed card to each player`);
        } else {
          break;
        }
      }
    }

    return { deck: newDeck, owed: currentOwed };
  }

  // ═══════════════════════════════════════
  // PASS DEVICE SCREEN
  // ═══════════════════════════════════════

  function showPassDeviceScreen(playerName) {
    return new Promise(resolve => {
      setCardsVisible(false);
      setPassScreenPlayer(playerName);
      setShowPassScreen(true);
      const handler = () => {
        setShowPassScreen(false);
        resolve();
      };
      // Store handler so the button can call it
      passResolveRef.current = handler;
    });
  }

  const passResolveRef = useRef(null);

  function handlePassReady() {
    if (passResolveRef.current) {
      passResolveRef.current();
      passResolveRef.current = null;
    }
  }

  // ═══════════════════════════════════════
  // MAIN GAME LOOP
  // ═══════════════════════════════════════

  async function runFullHand(startPlayers, handNum) {
    processingRef.current = true;

    const fullDeck = createDeck();
    const activePlayers = startPlayers.filter(p => p.chips > 0);
    const newDealerIdx = handNum % activePlayers.length;

    setShowdownResults(null);
    setWinnerIds([]);
    setShowConfetti(false);
    setPlayerActions({});
    setTopBoard([]);
    setBottomBoard([]);
    setTopRevealed(0);
    setBottomRevealed(0);
    setPot(0);
    setCurrentBet(0);
    setPhase('dealing');
    setDealerIndex(newDealerIdx);
    setHandNumber(handNum);
    setOwedCards(0);
    setCardsVisible(false);

    const ps = startPlayers.map(p => ({
      ...p, folded: p.chips <= 0, currentBet: 0, holeCards: [], isAllIn: false,
    }));
    setPlayers([...ps]);
    addLog(`── Hand #${handNum} ──`);

    // Set aside 10 cards for boards
    const topBoardCards = [];
    const bottomBoardCards = [];
    for (let i = 0; i < 5; i++) topBoardCards.push(fullDeck.pop());
    for (let i = 0; i < 5; i++) bottomBoardCards.push(fullDeck.pop());

    setTopBoard([...topBoardCards]);
    setBottomBoard([...bottomBoardCards]);

    let deck = fullDeck;

    // Deal 6 cards to each active player
    await delayMs(300);
    const activeForDeal = ps.filter(p => !p.folded);
    for (let round = 0; round < 6; round++) {
      for (const p of activeForDeal) {
        if (deck.length > 0) {
          ps[p.id].holeCards = [...ps[p.id].holeCards, deck.pop()];
        }
      }
    }
    setPlayers([...ps]);

    addLog(`Dealer: ${ps[newDealerIdx].name}`);
    addLog(`Dealt 6 cards to each player`);

    // Post blinds
    const sbIdx = findNextActive(ps, newDealerIdx);
    const bbIdx = findNextActive(ps, sbIdx);
    const sbAmt = Math.min(ps[sbIdx].chips, SMALL_BLIND);
    const bbAmt = Math.min(ps[bbIdx].chips, BIG_BLIND);

    ps[sbIdx].chips -= sbAmt; ps[sbIdx].currentBet = sbAmt;
    if (ps[sbIdx].chips === 0) ps[sbIdx].isAllIn = true;
    ps[bbIdx].chips -= bbAmt; ps[bbIdx].currentBet = bbAmt;
    if (ps[bbIdx].chips === 0) ps[bbIdx].isAllIn = true;

    let potTotal = sbAmt + bbAmt;
    let curBet = bbAmt;
    let currentOwed = 0;
    setPot(potTotal);
    setCurrentBet(curBet);
    setPlayers([...ps]);
    addLog(`${ps[sbIdx].name} posts SB $${sbAmt}`);
    addLog(`${ps[bbIdx].name} posts BB $${bbAmt}`);
    setUndistributedDeck([...deck]);

    // ─── Run through all phases ───
    const phaseList = ['pre-flop', 'flop', 'turn', 'river'];

    for (let pi = 0; pi < phaseList.length; pi++) {
      const phaseName = phaseList[pi];
      setPhase(phaseName);

      if (phaseName === 'flop') {
        addLog('── Flop ──');
        setTopRevealed(3);
        setBottomRevealed(3);
        await delayMs(500);

        const result = distributeCards(ps, deck, 3, addLog);
        deck = result.deck;
        currentOwed += result.owed;
        setPlayers([...ps]);
        setUndistributedDeck([...deck]);
        setOwedCards(currentOwed);
        await delayMs(300);
      } else if (phaseName === 'turn') {
        addLog('── Turn ──');
        setTopRevealed(4);
        setBottomRevealed(4);
        await delayMs(500);

        const result = distributeCards(ps, deck, 3, addLog);
        deck = result.deck;
        currentOwed += result.owed;
        setPlayers([...ps]);
        setUndistributedDeck([...deck]);
        setOwedCards(currentOwed);
        await delayMs(300);
      } else if (phaseName === 'river') {
        addLog('── River ──');
        setTopRevealed(5);
        setBottomRevealed(5);
        await delayMs(500);

        const result = distributeCards(ps, deck, 3, addLog);
        deck = result.deck;
        currentOwed += result.owed;
        setPlayers([...ps]);
        setUndistributedDeck([...deck]);
        setOwedCards(currentOwed);
        await delayMs(300);
      }

      // Reset bets for new round (except pre-flop)
      if (phaseName !== 'pre-flop') {
        for (const p of ps) p.currentBet = 0;
        curBet = 0;
        setCurrentBet(0);
        setPlayerActions({});
        setPlayers([...ps]);
      }

      const canActBefore = ps.filter(p => !p.folded && !p.isAllIn && p.chips > 0);
      if (canActBefore.length <= 1) continue;

      const startIdx = phaseName === 'pre-flop'
        ? findNextActive(ps, bbIdx)
        : findNextActive(ps, newDealerIdx);

      const result = await runBettingRound(ps, startIdx, curBet, potTotal, phaseName, deck, currentOwed);
      potTotal = result.pot;
      curBet = result.currentBet;
      deck = result.deck;
      currentOwed = result.owed;
      setPot(potTotal);
      setCurrentBet(curBet);
      setUndistributedDeck([...deck]);
      setOwedCards(currentOwed);

      if (ps.filter(p => !p.folded).length <= 1) break;
    }

    // ─── Showdown / winner ───
    const nonFolded = ps.filter(p => !p.folded);

    if (nonFolded.length === 1) {
      const winner = nonFolded[0];
      winner.chips += potTotal;
      setWinnerIds([winner.id]);
      setPlayers([...ps]);
      setPot(0);
      setPhase('showdown');
      setCardsVisible(false);
      addLog(`🏆 ${winner.name} wins $${potTotal}!`);
      if (potTotal >= 20) setShowConfetti(true);
      setShowdownResults(null);
    } else {
      setPhase('showdown');
      setTopRevealed(5);
      setBottomRevealed(5);
      setCardsVisible(false);
      addLog('── Showdown ──');

      const results = evaluateESGShowdown(nonFolded, topBoard.length ? topBoard : [], bottomBoard.length ? bottomBoard : []);

      const maxPoints = Math.max(...results.map(r => r.totalPoints));
      const winners = results.filter(r => r.totalPoints === maxPoints);
      const winIds = winners.map(w => w.playerId);
      const share = Math.floor(potTotal / winners.length);

      for (const wid of winIds) ps[wid].chips += share;
      setPlayers([...ps]);
      setPot(0);
      setWinnerIds(winIds);
      setShowdownResults(results);

      for (const r of results) {
        const p = ps[r.playerId];
        const topName = r.topHand ? HAND_NAMES[r.topHand.rank] : '-';
        const botName = r.bottomHand ? HAND_NAMES[r.bottomHand.rank] : '-';
        const handName = r.handStrength ? HAND_NAMES[r.handStrength.rank] : '-';
        addLog(`${p.name}: T:${r.topPoints.toFixed(1)}(${topName}) B:${r.bottomPoints.toFixed(1)}(${botName}) H:${r.handPoints.toFixed(1)}(${handName}) = ${r.totalPoints.toFixed(1)}pts`);
      }
      for (const w of winners) {
        addLog(`🏆 ${ps[w.playerId].name} wins $${share}! (${w.totalPoints.toFixed(1)} pts)`);
      }
      if (potTotal >= 20) setShowConfetti(true);
    }

    await delayMs(5000);
    setShowConfetti(false);
    processingRef.current = false;

    const alive = ps.filter(p => p.chips > 0);
    if (alive.length >= 2) {
      await delayMs(500);
      runFullHand(ps, handNum + 1);
    } else {
      addLog('🎰 Game Over! Click New Game to restart.');
      setPhase('waiting');
    }
  }

  /* ─── Betting Round ─── */
  async function runBettingRound(ps, startIdx, curBet, potTotal, phaseName, deck, currentOwed) {
    const actedSet = new Set();
    let lastRaiserIdx = -1;
    let idx = startIdx;
    const isRiver = phaseName === 'river';

    for (let safety = 0; safety < 50; safety++) {
      const player = ps[idx];

      if (player.folded || player.isAllIn || player.chips <= 0) {
        idx = findNextActive(ps, idx);
        const canAct2 = ps.filter(p => !p.folded && !p.isAllIn && p.chips > 0);
        if (canAct2.length === 0) break;
        if (actedSet.has(idx) && (lastRaiserIdx === -1 || idx === lastRaiserIdx)) break;
        continue;
      }

      const canActPlayers = ps.filter(p => !p.folded && !p.isAllIn && p.chips > 0);
      const allMatched = canActPlayers.every(p => p.currentBet === curBet);
      const allActed = canActPlayers.every(p => actedSet.has(p.id));
      if (allMatched && allActed && canActPlayers.length > 0) break;
      if (ps.filter(p => !p.folded).length <= 1) break;

      setActivePlayerIndex(idx);

      // Show pass device screen, then show cards
      await showPassDeviceScreen(player.name);
      setCardsVisible(true);

      // Wait for player action
      const humanResult = await waitForHumanAction();
      const action = humanResult.action;
      const amount = humanResult.amount;

      // Hide cards immediately after action
      setCardsVisible(false);

      // Execute action
      if (action === 'fold') {
        const foldResult = handleFoldCards(ps, idx, deck, currentOwed, isRiver, addLog);
        deck = foldResult.deck;
        currentOwed = foldResult.owed;
        setPlayerActions(prev => ({ ...prev, [idx]: { action: 'fold', amount: 0 } }));
        addLog(`${player.name} folds`);
      } else if (action === 'check') {
        setPlayerActions(prev => ({ ...prev, [idx]: { action: 'check', amount: 0 } }));
        addLog(`${player.name} checks`);
      } else if (action === 'call') {
        const callAmt = Math.min(player.chips, curBet - player.currentBet);
        ps[idx].chips -= callAmt;
        ps[idx].currentBet += callAmt;
        potTotal += callAmt;
        if (ps[idx].chips === 0) ps[idx].isAllIn = true;
        setPlayerActions(prev => ({ ...prev, [idx]: { action: ps[idx].isAllIn ? 'all-in' : 'call', amount: callAmt } }));
        addLog(`${player.name} calls $${callAmt}`);
      } else if (action === 'raise') {
        const totalBet = Math.min(player.chips + player.currentBet, amount);
        const raiseBy = totalBet - player.currentBet;
        const actualRaise = Math.min(player.chips, raiseBy);
        ps[idx].chips -= actualRaise;
        ps[idx].currentBet += actualRaise;
        potTotal += actualRaise;
        curBet = ps[idx].currentBet;
        if (ps[idx].chips === 0) ps[idx].isAllIn = true;
        lastRaiserIdx = idx;
        actedSet.clear();
        setPlayerActions(prev => ({ ...prev, [idx]: { action: ps[idx].isAllIn ? 'all-in' : 'raise', amount: curBet } }));
        addLog(`${player.name} raises to $${curBet}`);
      }

      actedSet.add(ps[idx].id);
      setPlayers([...ps]);
      setPot(potTotal);
      setCurrentBet(curBet);
      setUndistributedDeck([...deck]);
      setOwedCards(currentOwed);
      await delayMs(250);

      if (ps.filter(p => !p.folded).length <= 1) break;

      idx = findNextActive(ps, idx);

      const canAct3 = ps.filter(p => !p.folded && !p.isAllIn && p.chips > 0);
      const allMatched3 = canAct3.every(p => p.currentBet === curBet);
      const allActed3 = canAct3.every(p => actedSet.has(p.id));
      if (allMatched3 && allActed3 && canAct3.length > 0) break;
      if (canAct3.length === 0) break;
    }

    return { pot: potTotal, currentBet: curBet, deck, owed: currentOwed };
  }

  /* ─── Human input bridge ─── */
  function waitForHumanAction() {
    return new Promise(resolve => {
      humanResolveRef.current = resolve;
      setWaitingForHuman(true);
    });
  }

  function handleHumanAction(action, amount = 0) {
    if (!humanResolveRef.current) return;
    setWaitingForHuman(false);
    humanResolveRef.current({ action, amount });
    humanResolveRef.current = null;
  }

  function startNewHand() {
    if (processingRef.current) return;
    const hn = handNumber + 1;
    runFullHand(players.map(p => ({ ...p })), hn);
  }

  function resetToLobby() {
    processingRef.current = false;
    humanResolveRef.current = null;
    passResolveRef.current = null;
    setWaitingForHuman(false);
    setShowPassScreen(false);
    setCardsVisible(false);
    setGameStarted(false);
    setPlayers([]);
    setPlayerNames(['', '']);
    setUndistributedDeck([]);
    setTopBoard([]);
    setBottomBoard([]);
    setTopRevealed(0);
    setBottomRevealed(0);
    setPot(0);
    setCurrentBet(0);
    setPhase('waiting');
    setDealerIndex(0);
    setActivePlayerIndex(-1);
    setHandNumber(0);
    setGameLog([]);
    setShowdownResults(null);
    setWinnerIds([]);
    setShowConfetti(false);
    setPlayerActions({});
    setRaiseAmount(BIG_BLIND * 2);
    setOwedCards(0);
  }

  function startGame() {
    const names = playerNames.filter(n => n.trim() !== '');
    if (names.length < 2) return;
    const ps = createPlayers(names);
    setPlayers(ps);
    setGameStarted(true);
    setPhase('waiting');
    setHandNumber(0);
  }

  /* ─── Keyboard shortcuts ─── */
  useEffect(() => {
    const handleKey = (e) => {
      if (showPassScreen) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handlePassReady();
        }
        return;
      }
      if (!waitingForHuman) return;
      const ap = activePlayerIndex >= 0 ? players[activePlayerIndex] : null;
      if (!ap) return;
      const tc = currentBet - (ap.currentBet || 0);
      if (e.key === 'f' || e.key === 'F') handleHumanAction('fold');
      else if (e.key === 'c' || e.key === 'C') {
        if (tc > 0) handleHumanAction('call');
        else handleHumanAction('check');
      } else if (e.key === ' ') {
        e.preventDefault();
        handleHumanAction('raise', raiseAmount);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentBet, players, raiseAmount, waitingForHuman, showPassScreen, activePlayerIndex]);

  // ═══════════════════════════════════════
  // LOBBY SCREEN
  // ═══════════════════════════════════════

  if (!gameStarted) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#0d0d0d',
        fontFamily: "'IBM Plex Mono',monospace",
      }}>
        <h1 style={{ fontFamily: "'Playfair Display',serif", color: '#c9a84c', fontSize: 48, letterSpacing: 4, margin: '0 0 8px' }}>
          ESG POKER
        </h1>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 32 }}>6-3-3-3 Variant · Hot-Seat Multiplayer</p>

        <div style={{ maxWidth: 400, width: '90%' }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>Players (2-7)</div>
          {playerNames.map((name, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: '#c9a84c', fontSize: 18 }}>
                {['😎', '🎩', '🌙', '🦁', '🌸', '🎯', '⚡'][i]}
              </span>
              <input
                type="text"
                placeholder={`Player ${i + 1}`}
                value={name}
                onChange={e => {
                  const n = [...playerNames];
                  n[i] = e.target.value;
                  setPlayerNames(n);
                }}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 14,
                  background: '#1a1a1a', border: '1px solid #333', color: '#eee',
                  fontFamily: "'IBM Plex Mono',monospace", outline: 'none',
                }}
              />
              {i >= 2 && (
                <button onClick={() => setPlayerNames(playerNames.filter((_, j) => j !== i))}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: '1px solid #333',
                    background: '#1a1a1a', color: '#666', cursor: 'pointer', fontSize: 16,
                  }}>×</button>
              )}
            </div>
          ))}

          {playerNames.length < 7 && (
            <button onClick={() => setPlayerNames([...playerNames, ''])}
              style={{
                width: '100%', padding: '10px', borderRadius: 8, fontSize: 13,
                background: '#1a1a1a', border: '1px dashed #333', color: '#666',
                cursor: 'pointer', marginBottom: 24,
                fontFamily: "'IBM Plex Mono',monospace",
              }}>+ Add Player</button>
          )}

          <button onClick={startGame}
            disabled={playerNames.filter(n => n.trim()).length < 2}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, fontSize: 18, fontWeight: 700,
              cursor: 'pointer',
              background: playerNames.filter(n => n.trim()).length >= 2
                ? 'linear-gradient(135deg,#c9a84c,#9a7b2e)' : '#333',
              color: playerNames.filter(n => n.trim()).length >= 2 ? '#0d0d0d' : '#666',
              border: 'none',
              fontFamily: "'Playfair Display',serif", letterSpacing: 2,
            }}
          >START GAME</button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // GAME RENDER
  // ═══════════════════════════════════════
  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative',
      userSelect: 'none', background: '#0d0d0d', fontFamily: "'IBM Plex Mono',monospace",
    }}>
      <Confetti active={showConfetti} />

      {/* ── Pass Device Overlay ── */}
      <AnimatePresence>
        {showPassScreen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(12px)',
            }}
          >
            <span style={{ fontSize: 48, marginBottom: 16 }}>
              {players[activePlayerIndex]?.emoji}
            </span>
            <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#c9a84c', fontSize: 28, margin: '0 0 8px' }}>
              {passScreenPlayer}'s Turn
            </h2>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 32 }}>
              Pass the device to {passScreenPlayer}
            </p>
            <button onClick={handlePassReady}
              style={{
                padding: '14px 40px', borderRadius: 14, fontSize: 18, fontWeight: 700,
                cursor: 'pointer',
                background: 'linear-gradient(135deg,#c9a84c,#9a7b2e)', color: '#0d0d0d',
                border: 'none', fontFamily: "'Playfair Display',serif", letterSpacing: 2,
              }}
            >I'M READY</button>
            <p style={{ color: '#555', fontSize: 10, marginTop: 12 }}>or press Space / Enter</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div style={{
        position: 'absolute', top: 12, left: 0, right: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', zIndex: 20,
      }}>
        <h1 style={{ fontFamily: "'Playfair Display',serif", color: '#c9a84c', fontSize: 20, letterSpacing: 3, margin: 0 }}>
          ESG POKER
        </h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <HeaderBtn onClick={resetToLobby}>Lobby</HeaderBtn>
          {phase === 'waiting' && (
            <button onClick={startNewHand} style={{
              padding: '4px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: '#c9a84c', color: '#0d0d0d', border: 'none', cursor: 'pointer',
              fontFamily: "'IBM Plex Mono',monospace",
            }}>DEAL</button>
          )}
        </div>
      </div>

      {/* ── Phase indicator ── */}
      <div style={{
        position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, display: 'flex', gap: 8,
      }}>
        {['pre-flop', 'flop', 'turn', 'river', 'showdown'].map(p => (
          <span key={p} style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, padding: '2px 8px',
            borderRadius: 20, color: phase === p ? '#fbbf24' : '#555',
            background: phase === p ? 'rgba(201,168,76,0.12)' : 'transparent',
            border: phase === p ? '1px solid rgba(201,168,76,0.25)' : '1px solid transparent',
          }}>{p}</span>
        ))}
      </div>

      {/* ── Table ── */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ position: 'relative', width: '80vw', height: '60vh', maxWidth: 1100, maxHeight: 550 }}>
          {/* Oval felt */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden',
            background: '#1a4d2e',
            border: '6px solid #2d1b0e',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 0 0 10px #2d1b0e, 0 0 0 14px #1a0f06, 0 0 80px rgba(0,0,0,0.8)',
          }}>
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.25,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
            }} />
            <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', border: '2px solid rgba(201,168,76,0.2)' }} />
          </div>

          {/* ── Pot ── */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <AnimatePresence>
              {pot > 0 && (
                <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#888', marginBottom: 4 }}>Pot</span>
                  <ChipCount amount={pot} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Top Board ── */}
          <div style={{
            position: 'absolute', left: '50%', top: '28%', transform: 'translate(-50%,-50%)',
            zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: '#aaa' }}>Top Board</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {topBoard.map((card, i) => (
                <motion.div key={`top-${i}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={i < topRevealed ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.4 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                >
                  <PlayingCard card={card} faceDown={i >= topRevealed} small />
                </motion.div>
              ))}
            </div>
          </div>

          {/* ── Bottom Board ── */}
          <div style={{
            position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)',
            zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: '#aaa' }}>Bottom Board</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {bottomBoard.map((card, i) => (
                <motion.div key={`bot-${i}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={i < bottomRevealed ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.4 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                >
                  <PlayingCard card={card} faceDown={i >= bottomRevealed} small />
                </motion.div>
              ))}
            </div>
          </div>

          {/* ── Player seats ── */}
          {players.map((player, idx) => {
            const pos = seatPositions[idx];
            if (!pos) return null;
            const isActive = activePlayerIndex === idx;
            const isWinner = winnerIds.includes(idx);
            const isFolded = player.folded;
            const action = playerActions[idx];
            const sdResult = showdownResults?.find(r => r.playerId === idx);

            return (
              <div key={idx} style={{
                position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`,
                transform: 'translate(-50%,-50%)', zIndex: 10,
              }}>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <AnimatePresence>
                    {action && <ActionBadge action={action.action} amount={action.amount} />}
                  </AnimatePresence>

                  <motion.div
                    animate={{ opacity: isFolded ? 0.3 : 1, scale: isWinner ? 1.08 : 1 }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '8px 14px', borderRadius: 14, position: 'relative',
                      background: 'rgba(13,13,13,0.88)', backdropFilter: 'blur(4px)',
                      border: isActive && !isFolded ? '2px solid #c9a84c' : '2px solid transparent',
                      boxShadow: isWinner ? '0 0 20px rgba(251,191,36,0.4)' :
                        isActive ? '0 0 15px rgba(201,168,76,0.25)' : 'none',
                    }}
                  >
                    {isActive && !isFolded && (
                      <motion.div
                        animate={{ boxShadow: ['0 0 8px #c9a84c44', '0 0 20px #c9a84c66', '0 0 8px #c9a84c44'] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        style={{ position: 'absolute', inset: 0, borderRadius: 14, border: '2px solid #c9a84c66', pointerEvents: 'none' }}
                      />
                    )}

                    {dealerIndex === idx && (
                      <div style={{
                        position: 'absolute', top: -8, right: -8, width: 20, height: 20,
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, background: '#c9a84c', color: '#0d0d0d',
                      }}>D</div>
                    )}

                    <span style={{ fontSize: 24, marginBottom: 2 }}>{player.emoji}</span>
                    <span style={{ fontSize: 10, color: '#bbb', marginBottom: 2 }}>{player.name}</span>
                    <ChipCount amount={player.chips} />

                    {!player.folded && player.holeCards.length > 0 && (
                      <div style={{
                        fontSize: 9, color: '#888', marginTop: 4,
                        padding: '2px 6px', borderRadius: 6, background: 'rgba(50,50,50,0.4)',
                      }}>
                        {player.holeCards.length} cards
                      </div>
                    )}

                    {sdResult && !player.folded && (
                      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                        style={{
                          fontSize: 9, marginTop: 4, padding: '3px 8px', borderRadius: 6,
                          background: isWinner ? 'rgba(201,168,76,0.2)' : 'rgba(50,50,50,0.4)',
                          color: isWinner ? '#fbbf24' : '#888', textAlign: 'center', lineHeight: 1.4,
                        }}>
                        <div>{sdResult.totalPoints.toFixed(1)} pts</div>
                        <div style={{ fontSize: 8, opacity: 0.7 }}>
                          T:{sdResult.topPoints.toFixed(1)} B:{sdResult.bottomPoints.toFixed(1)} H:{sdResult.handPoints.toFixed(1)}
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Active player's hole cards (only visible after pass screen) ── */}
      {cardsVisible && activePlayerIndex >= 0 && players[activePlayerIndex] && (
        <div style={{
          position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, display: 'flex',
        }}>
          {players[activePlayerIndex].holeCards.map((card, i) => (
            <motion.div key={cardKey(card)}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: i * 0.03 }}
              style={{ marginLeft: i === 0 ? 0 : -42, zIndex: i }}
            >
              <PlayingCard card={card} style={{ width: 70, height: 100 }} />
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Card count label ── */}
      {cardsVisible && activePlayerIndex >= 0 && players[activePlayerIndex]?.holeCards.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, fontSize: 10, color: '#888',
        }}>
          {players[activePlayerIndex].holeCards.length} cards · {players[activePlayerIndex].name}'s hand
        </div>
      )}

      {/* ── Action Bar ── */}
      <AnimatePresence>
        {waitingForHuman && cardsVisible && activePlayerIndex >= 0 && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              zIndex: 30, display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 24px', borderRadius: 20,
              background: 'rgba(13,13,13,0.95)', border: '1px solid rgba(201,168,76,0.2)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <ActionBtn onClick={() => handleHumanAction('fold')} bg="#7f1d1d" color="#fca5a5" label="FOLD" shortcut="F" />
            {canCheck ? (
              <ActionBtn onClick={() => handleHumanAction('check')} bg="#14532d" color="#86efac" label="CHECK" shortcut="C" />
            ) : (
              <ActionBtn onClick={() => handleHumanAction('call')} bg="#1e3a5f" color="#93c5fd" label={`CALL $${toCall}`} shortcut="C" />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="range" min={minRaise} max={maxRaise} value={Math.min(raiseAmount, maxRaise)}
                onChange={e => setRaiseAmount(Number(e.target.value))}
                style={{ width: 100 }} />
              <ActionBtn onClick={() => handleHumanAction('raise', raiseAmount)} bg="#713f12" color="#fde68a"
                label={`RAISE $${raiseAmount}`} shortcut="Space" />
            </div>
            {activePlayer && (
              <ActionBtn onClick={() => handleHumanAction('raise', activePlayer.chips + activePlayer.currentBet)}
                bg="#581c87" color="#d8b4fe" label="ALL IN" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Game Log ── */}
      <div style={{ position: 'absolute', top: 68, right: 16, zIndex: 20, width: 260 }}>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: '#555', marginBottom: 4, paddingLeft: 4 }}>
          Game Log
        </div>
        <div ref={logRef} className="scrollbar-thin"
          style={{ maxHeight: '40vh', overflowY: 'auto', paddingRight: 4 }}>
          {gameLog.map((msg, i) => (
            <div key={i} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              color: msg.includes('🏆') ? '#fbbf24' : msg.startsWith('──') ? 'rgba(201,168,76,0.5)' : '#888',
              background: msg.includes('🏆') ? 'rgba(201,168,76,0.06)' : 'transparent',
            }}>{msg}</div>
          ))}
        </div>
      </div>

      {/* ── Blind info ── */}
      <div style={{ position: 'absolute', bottom: 8, left: 16, zIndex: 20, fontSize: 10, color: '#555' }}>
        Blinds: ${SMALL_BLIND}/${BIG_BLIND} · Hand #{handNumber} · Deck: {undistributedDeck.length} cards
        {owedCards > 0 && ` · Owed: ${owedCards}/player`}
      </div>

      {/* ── Welcome overlay (after lobby, before first deal) ── */}
      {phase === 'waiting' && handNumber === 0 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 40,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#c9a84c', fontSize: 32, letterSpacing: 4, margin: '0 0 8px' }}>
              Ready to Play
            </h2>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
              {players.length} players · ESG 6-3-3-3
            </p>
            <p style={{ color: '#555', fontSize: 11, marginBottom: 32 }}>
              {players.map(p => p.name).join(' · ')}
            </p>
            <button onClick={startNewHand}
              style={{
                padding: '14px 40px', borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg,#c9a84c,#9a7b2e)', color: '#0d0d0d',
                border: 'none', boxShadow: '0 4px 20px rgba(201,168,76,0.3)',
                fontFamily: "'Playfair Display',serif", letterSpacing: 2,
              }}
            >DEAL</button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ── Helper components ── */
function HeaderBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
      border: '1px solid rgba(201,168,76,0.25)', background: 'transparent',
      color: '#c9a84c', fontFamily: "'IBM Plex Mono',monospace",
    }}>{children}</button>
  );
}

function ActionBtn({ onClick, bg, color, label, shortcut }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
        cursor: 'pointer', border: 'none', background: bg, color, whiteSpace: 'nowrap',
        fontFamily: "'IBM Plex Mono',monospace",
      }}
    >
      {label}
      {shortcut && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>[{shortcut}]</span>}
    </button>
  );
}
