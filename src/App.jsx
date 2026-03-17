import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  createDeck, cardKey, isRed, evaluateHand, compareHands,
  HAND_NAMES, makeAIDecision, createInitialPlayers,
} from './pokerEngine';

const SMALL_BLIND = 5;
const BIG_BLIND = 10;

const SEAT_POSITIONS = [
  { x: 50, y: 85 },
  { x: 8, y: 62 },
  { x: 8, y: 28 },
  { x: 50, y: 8 },
  { x: 92, y: 28 },
  { x: 92, y: 62 },
];

const AI_SPEED = { fast: 300, normal: 700, slow: 1200 };

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

/* ─── Animated chip count ─── */
function ChipCount({ amount, className = '' }) {
  return (
    <motion.span
      key={amount}
      initial={{ scale: 1.3, color: '#fbbf24' }}
      animate={{ scale: 1, color: '#c9a84c' }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={className}
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

/* ─── Thinking dots ─── */
function ThinkingIndicator() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'absolute', top: -32, left: '50%', transform: 'translateX(-50%)',
        padding: '3px 10px', borderRadius: 20, background: 'rgba(30,30,30,0.9)',
        color: '#fbbf24', fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", zIndex: 30,
      }}>
      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>
        thinking...
      </motion.span>
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
   MAIN APP
   ═══════════════════════════════════════════════════════ */
export default function App() {
  const [players, setPlayers] = useState(createInitialPlayers);
  const [deck, setDeck] = useState([]);
  const [communityCards, setCommunityCards] = useState([]);
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
  const [aiSpeed, setAiSpeed] = useState('normal');
  const [showSettings, setShowSettings] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(BIG_BLIND * 2);
  const [thinkingPlayer, setThinkingPlayer] = useState(-1);
  const [playerActions, setPlayerActions] = useState({});
  const [revealedCommunity, setRevealedCommunity] = useState(0);
  const [waitingForHuman, setWaitingForHuman] = useState(false);

  const processingRef = useRef(false);
  const logRef = useRef(null);
  // Use refs for mutable game state during async operations
  const gameRef = useRef({});

  const addLog = useCallback((msg) => {
    setGameLog(prev => [...prev.slice(-19), msg]);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [gameLog]);

  const humanPlayer = players[0];
  const toCall = currentBet - (humanPlayer?.currentBet || 0);
  const canCheck = toCall <= 0;
  const minRaise = Math.max(BIG_BLIND, currentBet * 2);
  const potLimitMax = pot + currentBet + (currentBet - (humanPlayer?.currentBet || 0)); // pot-limit max
  const maxRaise = Math.min(humanPlayer.chips + humanPlayer.currentBet, potLimitMax);
  const isHumanTurn = activePlayerIndex === 0 && !processingRef.current &&
    !['waiting', 'dealing', 'showdown'].includes(phase) && !humanPlayer.folded;

  // ─── Helpers ───
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  function findNextActive(pList, fromIdx) {
    let idx = (fromIdx + 1) % 6;
    for (let s = 0; s < 6; s++) {
      const p = pList[idx];
      if (!p.folded && (p.chips > 0 || p.isAllIn)) return idx;
      idx = (idx + 1) % 6;
    }
    return fromIdx; // fallback
  }

  // ─── Core async game loop ───
  // All game phases run as a single async chain to avoid stale closure issues.
  // We pass mutable state objects through function args.

  async function runFullHand(startPlayers, handNum) {
    processingRef.current = true;

    const newDeck = createDeck();
    const newDealerIdx = handNum % 6;

    // Reset state
    setShowdownResults(null);
    setWinnerIds([]);
    setShowConfetti(false);
    setPlayerActions({});
    setRevealedCommunity(0);
    setCommunityCards([]);
    setPot(0);
    setCurrentBet(0);
    setPhase('dealing');
    setDealerIndex(newDealerIdx);
    setHandNumber(handNum);

    const ps = startPlayers.map(p => ({
      ...p, folded: p.chips <= 0 && !p.isHuman, currentBet: 0, holeCards: [], isAllIn: false,
    }));

    setPlayers([...ps]);
    addLog(`── Hand #${handNum} ──`);

    // Deal 5 cards (PLO5)
    await delay(300);
    const activeForDeal = ps.filter(p => !p.folded);
    for (let round = 0; round < 5; round++) {
      for (const p of activeForDeal) {
        ps[p.id].holeCards = [...ps[p.id].holeCards, newDeck.pop()];
        setPlayers([...ps]);
        await delay(80);
      }
    }

    addLog(`Dealer: ${ps[newDealerIdx].name}`);

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
    setPot(potTotal);
    setCurrentBet(curBet);
    setPlayers([...ps]);
    addLog(`${ps[sbIdx].name} posts SB $${sbAmt}`);
    addLog(`${ps[bbIdx].name} posts BB $${bbAmt}`);

    // ─── Run through all phases ───
    let community = [];
    const phaseList = ['pre-flop', 'flop', 'turn', 'river'];

    for (let pi = 0; pi < phaseList.length; pi++) {
      const phaseName = phaseList[pi];
      setPhase(phaseName);

      // Deal community cards
      if (phaseName === 'flop') {
        newDeck.pop(); // burn
        community = [newDeck.pop(), newDeck.pop(), newDeck.pop()];
        setCommunityCards([...community]);
        addLog('── Flop ──');
        setRevealedCommunity(0);
        await delay(250);
        for (let ci = 1; ci <= 3; ci++) { setRevealedCommunity(ci); await delay(180); }
        await delay(300);
      } else if (phaseName === 'turn') {
        newDeck.pop();
        community.push(newDeck.pop());
        setCommunityCards([...community]);
        addLog('── Turn ──');
        await delay(250);
        setRevealedCommunity(4);
        await delay(400);
      } else if (phaseName === 'river') {
        newDeck.pop();
        community.push(newDeck.pop());
        setCommunityCards([...community]);
        addLog('── River ──');
        await delay(250);
        setRevealedCommunity(5);
        await delay(400);
      }

      // Reset bets for new betting round (except pre-flop)
      if (phaseName !== 'pre-flop') {
        for (const p of ps) p.currentBet = 0;
        curBet = 0;
        setCurrentBet(0);
        setPlayerActions({});
        setPlayers([...ps]);
      }

      // Check if betting can happen
      const canActBefore = ps.filter(p => !p.folded && !p.isAllIn && p.chips > 0);
      if (canActBefore.length <= 1) continue;

      // Betting round
      const startIdx = phaseName === 'pre-flop'
        ? findNextActive(ps, bbIdx)
        : findNextActive(ps, newDealerIdx);

      const result = await runBettingRound(ps, startIdx, curBet, potTotal, phaseName, community);
      potTotal = result.pot;
      curBet = result.currentBet;
      setPot(potTotal);
      setCurrentBet(curBet);

      // Check if only one player remains
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
      addLog(`🏆 ${winner.name} wins $${potTotal}!`);
      if (potTotal >= 100) setShowConfetti(true);
      setShowdownResults([{ playerId: winner.id, handName: 'Last Standing' }]);
    } else {
      // Evaluate hands
      setPhase('showdown');
      addLog('── Showdown ──');
      const results = nonFolded.map(p => {
        const hand = evaluateHand(p.holeCards, community);
        return { playerId: p.id, hand, handName: HAND_NAMES[hand.rank] };
      });
      results.sort((a, b) => compareHands(b.hand, a.hand));
      const best = results[0].hand;
      const winners = results.filter(r => compareHands(r.hand, best) === 0);
      const winIds = winners.map(w => w.playerId);
      const share = Math.floor(potTotal / winners.length);

      for (const wid of winIds) ps[wid].chips += share;
      setPlayers([...ps]);
      setPot(0);
      setWinnerIds(winIds);
      setShowdownResults(results);

      for (const w of winners) {
        const r = results.find(r2 => r2.playerId === w.playerId);
        addLog(`🏆 ${ps[w.playerId].name} wins $${share} — ${r.handName}!`);
      }
      if (potTotal >= 100) setShowConfetti(true);
    }

    await delay(3500);
    setShowConfetti(false);
    processingRef.current = false;

    // Auto-start next hand if players remain
    const alive = ps.filter(p => p.chips > 0);
    if (alive.length >= 2) {
      await delay(500);
      runFullHand(ps, handNum + 1);
    } else {
      addLog('🎰 Game Over! Click New Game to restart.');
      setPhase('waiting');
    }
  }

  /* ─── Betting Round ─── */
  async function runBettingRound(ps, startIdx, curBet, potTotal, phaseName, community) {
    const actedSet = new Set();
    let lastRaiserIdx = -1;
    let idx = startIdx;

    for (let safety = 0; safety < 36; safety++) {
      const player = ps[idx];

      // Skip ineligible
      if (player.folded || player.isAllIn || player.chips <= 0) {
        idx = findNextActive(ps, idx);
        const canAct2 = ps.filter(p => !p.folded && !p.isAllIn && p.chips > 0);
        if (canAct2.length === 0) break;
        if (actedSet.has(idx) && (lastRaiserIdx === -1 || idx === lastRaiserIdx)) break;
        continue;
      }

      // Check round complete
      const canActPlayers = ps.filter(p => !p.folded && !p.isAllIn && p.chips > 0);
      const allMatched = canActPlayers.every(p => p.currentBet === curBet);
      const allActed = canActPlayers.every(p => actedSet.has(p.id));
      if (allMatched && allActed && canActPlayers.length > 0) break;
      if (ps.filter(p => !p.folded).length <= 1) break;

      setActivePlayerIndex(idx);

      let action, amount;

      if (player.isHuman) {
        // Wait for human input via promise
        const humanResult = await waitForHumanAction(ps, curBet, potTotal);
        action = humanResult.action;
        amount = humanResult.amount;
      } else {
        // AI
        setThinkingPlayer(idx);
        await delay(AI_SPEED[aiSpeed] + Math.random() * 500);
        setThinkingPlayer(-1);

        const decision = makeAIDecision(player, {
          holeCards: player.holeCards, communityCards: community,
          currentBet: curBet, pot: potTotal, phase: phaseName, bigBlind: BIG_BLIND,
        }, player.personality);
        action = decision.action;
        amount = decision.amount;
      }

      // Execute action
      if (action === 'fold') {
        ps[idx].folded = true;
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
      await delay(250);

      if (ps.filter(p => !p.folded).length <= 1) break;

      idx = findNextActive(ps, idx);

      // Re-check completion
      const canAct3 = ps.filter(p => !p.folded && !p.isAllIn && p.chips > 0);
      const allMatched3 = canAct3.every(p => p.currentBet === curBet);
      const allActed3 = canAct3.every(p => actedSet.has(p.id));
      if (allMatched3 && allActed3 && canAct3.length > 0) break;
      if (canAct3.length === 0) break;
    }

    return { pot: potTotal, currentBet: curBet };
  }

  /* ─── Human input bridge ─── */
  const humanResolveRef = useRef(null);

  function waitForHumanAction(ps, curBet, potTotal) {
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

  /* ─── Start hand ─── */
  function startNewHand() {
    if (processingRef.current) return;
    const hn = handNumber + 1;
    runFullHand(players.map(p => ({ ...p })), hn);
  }

  /* ─── Reset ─── */
  function resetGame() {
    processingRef.current = false;
    humanResolveRef.current = null;
    setWaitingForHuman(false);
    setPlayers(createInitialPlayers());
    setDeck([]);
    setCommunityCards([]);
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
    setRevealedCommunity(0);
    setThinkingPlayer(-1);
    setRaiseAmount(BIG_BLIND * 2);
  }

  /* ─── Keyboard shortcuts ─── */
  useEffect(() => {
    const handleKey = (e) => {
      if (!waitingForHuman) return;
      if (showSettings) return;
      const tc = currentBet - (players[0]?.currentBet || 0);
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
  }, [currentBet, players, raiseAmount, showSettings]);

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative',
      userSelect: 'none', background: '#0d0d0d', fontFamily: "'IBM Plex Mono',monospace",
    }}>
      <Confetti active={showConfetti} />

      {/* ── Header ── */}
      <div style={{
        position: 'absolute', top: 12, left: 0, right: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', zIndex: 20,
      }}>
        <h1 style={{ fontFamily: "'Playfair Display',serif", color: '#c9a84c', fontSize: 20, letterSpacing: 3, margin: 0 }}>
          PLO5
        </h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <HeaderBtn onClick={() => setShowSettings(true)}>Settings</HeaderBtn>
          <HeaderBtn onClick={resetGame}>New Game</HeaderBtn>
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
        <div style={{ position: 'relative', width: '75vw', height: '55vh', maxWidth: 1000, maxHeight: 500 }}>
          {/* Oval felt */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden',
            background: '#1a4d2e',
            border: '6px solid #2d1b0e',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 0 0 10px #2d1b0e, 0 0 0 14px #1a0f06, 0 0 80px rgba(0,0,0,0.8)',
          }}>
            {/* Noise texture */}
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.25,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
            }} />
            {/* Gold inner trim */}
            <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', border: '2px solid rgba(201,168,76,0.2)' }} />
          </div>

          {/* Pot */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <AnimatePresence>
              {pot > 0 && (
                <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#888', marginBottom: 4 }}>Pot</span>
                  <ChipCount amount={pot} style={{ fontSize: 18 }} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Community cards */}
          <div style={{
            position: 'absolute', left: '50%', top: '36%', transform: 'translate(-50%,-50%)',
            zIndex: 10, display: 'flex', gap: 8,
          }}>
            <AnimatePresence>
              {communityCards.map((card, i) => (
                <motion.div key={cardKey(card)}
                  initial={{ scale: 0, rotateY: 180, opacity: 0 }}
                  animate={i < revealedCommunity
                    ? { scale: 1, rotateY: 0, opacity: 1 }
                    : { scale: 0.8, rotateY: 180, opacity: 0.5 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20, delay: i < 3 ? i * 0.1 : 0 }}
                >
                  <PlayingCard card={card} faceDown={i >= revealedCommunity} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Player seats */}
          {players.map((player, idx) => {
            const pos = SEAT_POSITIONS[idx];
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
                    {thinkingPlayer === idx && <ThinkingIndicator />}
                    {thinkingPlayer !== idx && action && <ActionBadge action={action.action} amount={action.amount} />}
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
                    {/* Active glow ring */}
                    {isActive && !isFolded && (
                      <motion.div
                        animate={{ boxShadow: ['0 0 8px #c9a84c44', '0 0 20px #c9a84c66', '0 0 8px #c9a84c44'] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        style={{ position: 'absolute', inset: 0, borderRadius: 14, border: '2px solid #c9a84c66', pointerEvents: 'none' }}
                      />
                    )}

                    {/* Dealer badge */}
                    {dealerIndex === idx && (
                      <div style={{
                        position: 'absolute', top: -8, right: -8, width: 20, height: 20,
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, background: '#c9a84c', color: '#0d0d0d',
                      }}>D</div>
                    )}

                    <span style={{ fontSize: 24, marginBottom: 2 }}>{player.emoji}</span>
                    <span style={{ fontSize: 10, color: '#bbb', marginBottom: 2 }}>{player.name}</span>
                    <ChipCount amount={player.chips} className="" />

                    {/* AI hole cards */}
                    {!player.isHuman && player.holeCards.length > 0 && !player.folded && (
                      <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 4 }}>
                        {phase === 'showdown' ? (
                          player.holeCards.map((c, ci) => (
                              <motion.div key={cardKey(c)} initial={{ rotateY: 180 }} animate={{ rotateY: 0 }}
                                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                                style={{ marginLeft: ci === 0 ? 0 : -28, zIndex: ci }}>
                                <PlayingCard card={c} small />
                              </motion.div>
                          ))
                        ) : (
                          player.holeCards.map((_, ci) => (
                              <div key={ci} style={{ marginLeft: ci === 0 ? 0 : -28, zIndex: ci }}>
                                <PlayingCard faceDown small />
                              </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Showdown hand name */}
                    {sdResult && !player.folded && (
                      <motion.span initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                        style={{
                          fontSize: 9, marginTop: 4, padding: '2px 6px', borderRadius: 6,
                          background: isWinner ? 'rgba(201,168,76,0.2)' : 'rgba(50,50,50,0.4)',
                          color: isWinner ? '#fbbf24' : '#888',
                        }}>
                        {sdResult.handName}
                      </motion.span>
                    )}
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Human hole cards ── */}
      <div style={{
        position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, display: 'flex', alignItems: 'flex-end',
      }}>
        <AnimatePresence>
          {humanPlayer.holeCards.map((card, i) => (
              <motion.div key={cardKey(card)}
                initial={{ x: 0, y: -200, rotateY: 180, opacity: 0 }}
                animate={{ x: 0, y: 0, rotateY: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20, delay: i * 0.1 }}
                whileHover={{ y: -12, scale: 1.08, zIndex: 10 }}
                style={{ cursor: 'default', marginLeft: i === 0 ? 0 : -42, zIndex: i }}
              >
                <PlayingCard card={card} style={{ width: 80, height: 114 }} />
              </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Action Bar ── */}
      <AnimatePresence>
        {waitingForHuman && (
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
              <input type="range" min={minRaise} max={maxRaise} value={raiseAmount}
                onChange={e => setRaiseAmount(Number(e.target.value))}
                style={{ width: 100 }} />
              <ActionBtn onClick={() => handleHumanAction('raise', raiseAmount)} bg="#713f12" color="#fde68a"
                label={`RAISE $${raiseAmount}`} shortcut="Space" />
            </div>
            <ActionBtn onClick={() => handleHumanAction('raise', humanPlayer.chips + humanPlayer.currentBet)}
              bg="#581c87" color="#d8b4fe" label="ALL IN" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Game Log ── */}
      <div style={{ position: 'absolute', top: 68, right: 16, zIndex: 20, width: 200 }}>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: '#555', marginBottom: 4, paddingLeft: 4 }}>
          Game Log
        </div>
        <div ref={logRef} className="scrollbar-thin"
          style={{ maxHeight: '35vh', overflowY: 'auto', paddingRight: 4 }}>
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
        Blinds: ${SMALL_BLIND}/${BIG_BLIND} · Hand #{handNumber}
      </div>

      {/* ── Settings Modal ── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowSettings(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              onClick={e => e.stopPropagation()}
              style={{ padding: 24, borderRadius: 20, maxWidth: 360, width: '90%',
                background: '#1a1a1a', border: '1px solid rgba(201,168,76,0.2)' }}>
              <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#c9a84c', fontSize: 18, margin: '0 0 16px' }}>
                Settings
              </h2>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>AI Speed</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['fast', 'normal', 'slow'].map(s => (
                    <button key={s} onClick={() => setAiSpeed(s)}
                      style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        textTransform: 'capitalize', cursor: 'pointer',
                        background: aiSpeed === s ? 'rgba(201,168,76,0.15)' : '#222',
                        color: '#c9a84c',
                        border: aiSpeed === s ? '1px solid #c9a84c' : '1px solid #333',
                        fontFamily: "'IBM Plex Mono',monospace",
                      }}>{s}</button>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#666', marginBottom: 16 }}>
                Keyboard: F — Fold · C — Check/Call · Space — Raise
              </div>
              <button onClick={() => setShowSettings(false)}
                style={{
                  width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: '#c9a84c', color: '#0d0d0d', border: 'none', cursor: 'pointer',
                  fontFamily: "'IBM Plex Mono',monospace",
                }}>Close</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Welcome overlay ── */}
      {phase === 'waiting' && handNumber === 0 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 40,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center' }}>
            <h1 style={{ fontFamily: "'Playfair Display',serif", color: '#c9a84c', fontSize: 48, letterSpacing: 4, margin: '0 0 8px' }}>
              PLO5
            </h1>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 32 }}>Pot Limit Omaha 5</p>
            <button onClick={startNewHand}
              style={{
                padding: '14px 40px', borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg,#c9a84c,#9a7b2e)', color: '#0d0d0d',
                border: 'none', boxShadow: '0 4px 20px rgba(201,168,76,0.3)',
                fontFamily: "'Playfair Display',serif", letterSpacing: 2,
                transition: 'transform 0.15s',
              }}
              onMouseOver={e => e.target.style.transform = 'scale(1.05)'}
              onMouseOut={e => e.target.style.transform = 'scale(1)'}
            >DEAL ME IN</button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ── Small helper components ── */
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
        fontFamily: "'IBM Plex Mono',monospace", transition: 'transform 0.1s',
      }}
      onMouseOver={e => e.target.style.transform = 'scale(1.05)'}
      onMouseOut={e => e.target.style.transform = 'scale(1)'}
    >
      {label}
      {shortcut && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>[{shortcut}]</span>}
    </button>
  );
}
