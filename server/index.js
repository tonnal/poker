import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  createDeck, shuffle, evaluateESGShowdown, calculatePotLimitMax, HAND_NAMES, compareHands,
} from './esgEngine.js';

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const SMALL_BLIND = 1;
const BIG_BLIND = 3;
const EMOJIS = ['😎', '🎩', '🌙', '🦁', '🌸', '🎯', '⚡'];

// ─── Room storage ───
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateRoomCode() : code;
}

function createRoom(hostSocketId, hostName) {
  const code = generateRoomCode();
  const room = {
    code,
    players: [{
      id: 0, socketId: hostSocketId, name: hostName, emoji: EMOJIS[0],
      chips: 500, folded: false, currentBet: 0, holeCards: [], isAllIn: false,
    }],
    state: 'lobby', // lobby, playing, showdown
    deck: [],
    topBoard: [],
    bottomBoard: [],
    topRevealed: 0,
    bottomRevealed: 0,
    pot: 0,
    currentBet: 0,
    phase: 'waiting',
    dealerIndex: 0,
    activePlayerIndex: -1,
    handNumber: 0,
    gameLog: [],
    owedCards: 0,
    playerActions: {},
    winnerIds: [],
    showdownResults: null,
    actionResolve: null, // callback for current player's action
    nextHandResolve: null,
  };
  rooms.set(code, room);
  return room;
}

// ─── Broadcast game state to all players in room ───
function broadcastState(room) {
  for (const player of room.players) {
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) continue;

    // Send personalized state: only this player sees their own cards
    const playersView = room.players.map(p => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      chips: p.chips,
      folded: p.folded,
      currentBet: p.currentBet,
      isAllIn: p.isAllIn,
      cardCount: p.holeCards.length,
      // Only send hole cards to the owner, or during showdown to non-folded
      holeCards: p.id === player.id
        ? p.holeCards
        : (room.phase === 'showdown' && !p.folded ? p.holeCards : []),
    }));

    socket.emit('game-state', {
      players: playersView,
      myId: player.id,
      topBoard: room.topBoard,
      bottomBoard: room.bottomBoard,
      topRevealed: room.topRevealed,
      bottomRevealed: room.bottomRevealed,
      pot: room.pot,
      currentBet: room.currentBet,
      phase: room.phase,
      dealerIndex: room.dealerIndex,
      activePlayerIndex: room.activePlayerIndex,
      handNumber: room.handNumber,
      gameLog: room.gameLog,
      owedCards: room.owedCards,
      playerActions: room.playerActions,
      winnerIds: room.winnerIds,
      showdownResults: room.showdownResults,
      deckCount: room.deck.length,
    });
  }
}

function broadcastLobby(room) {
  for (const player of room.players) {
    const socket = io.sockets.sockets.get(player.socketId);
    if (socket) {
      socket.emit('lobby-state', {
        code: room.code,
        players: room.players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
        isHost: player.id === 0,
      });
    }
  }
}

function addLog(room, msg) {
  room.gameLog.push(msg);
  if (room.gameLog.length > 40) room.gameLog = room.gameLog.slice(-40);
}

// ─── Game helpers ───
function findNextActive(players, fromIdx) {
  const total = players.length;
  let idx = (fromIdx + 1) % total;
  for (let s = 0; s < total; s++) {
    const p = players[idx];
    if (!p.folded && (p.chips > 0 || p.isAllIn)) return idx;
    idx = (idx + 1) % total;
  }
  return fromIdx;
}

function distributeCards(players, deck, cardsPerPlayer, room) {
  const active = players.filter(p => !p.folded && !p.isAllIn);
  let toGive = cardsPerPlayer;
  if (deck.length < active.length * cardsPerPlayer) {
    toGive = Math.floor(deck.length / active.length);
    if (toGive === 0) return { deck, owed: cardsPerPlayer };
  }
  const owed = cardsPerPlayer - toGive;
  for (const p of active) {
    for (let i = 0; i < toGive; i++) {
      if (deck.length === 0) break;
      p.holeCards.push(deck.pop());
    }
  }
  if (toGive > 0) addLog(room, `Dealt ${toGive} card${toGive > 1 ? 's' : ''} to each player`);
  if (owed > 0) addLog(room, `${owed} card${owed > 1 ? 's' : ''} owed per player (deck short)`);
  return { deck, owed };
}

function handleFoldCards(players, foldedIdx, deck, currentOwed, isRiver, room) {
  const foldedCards = players[foldedIdx].holeCards;
  players[foldedIdx].holeCards = [];
  players[foldedIdx].folded = true;
  if (isRiver) return { deck, owed: currentOwed };
  const newDeck = shuffle([...deck, ...foldedCards]);
  if (currentOwed > 0) {
    const active = players.filter(p => !p.folded && !p.isAllIn);
    let remaining = currentOwed;
    for (let round = 0; round < remaining; round++) {
      let distributed = false;
      for (const p of active) {
        if (newDeck.length > 0) { p.holeCards.push(newDeck.pop()); distributed = true; }
      }
      if (distributed) { currentOwed--; addLog(room, `Distributed 1 owed card to each player`); }
      else break;
    }
  }
  return { deck: newDeck, owed: currentOwed };
}

// ─── Wait for a player's action via socket ───
function waitForAction(room, playerIdx) {
  return new Promise(resolve => {
    room.actionResolve = { playerIdx, resolve };
    room.activePlayerIndex = playerIdx;
    broadcastState(room);
  });
}

function waitForNextHand(room) {
  return new Promise(resolve => {
    room.nextHandResolve = resolve;
    broadcastState(room);
  });
}

// ─── Main game loop ───
async function runFullHand(room, handNum) {
  const ps = room.players;
  const fullDeck = createDeck();
  const activePlayers = ps.filter(p => p.chips > 0);
  const newDealerIdx = handNum % activePlayers.length;

  // Reset
  for (const p of ps) {
    p.folded = p.chips <= 0;
    p.currentBet = 0;
    p.holeCards = [];
    p.isAllIn = false;
  }
  room.showdownResults = null;
  room.winnerIds = [];
  room.playerActions = {};
  room.topRevealed = 0;
  room.bottomRevealed = 0;
  room.pot = 0;
  room.currentBet = 0;
  room.phase = 'dealing';
  room.dealerIndex = newDealerIdx;
  room.handNumber = handNum;
  room.owedCards = 0;
  room.gameLog = [];

  addLog(room, `── Hand #${handNum} ──`);

  // Set aside 10 cards for boards
  const topBoardCards = [];
  const bottomBoardCards = [];
  for (let i = 0; i < 5; i++) topBoardCards.push(fullDeck.pop());
  for (let i = 0; i < 5; i++) bottomBoardCards.push(fullDeck.pop());
  room.topBoard = topBoardCards;
  room.bottomBoard = bottomBoardCards;

  let deck = fullDeck;

  // Deal 6 cards
  const activeForDeal = ps.filter(p => !p.folded);
  for (let round = 0; round < 6; round++) {
    for (const p of activeForDeal) {
      if (deck.length > 0) p.holeCards.push(deck.pop());
    }
  }

  addLog(room, `Dealer: ${ps[newDealerIdx].name}`);
  addLog(room, `Dealt 6 cards to each player`);

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
  room.pot = potTotal;
  room.currentBet = curBet;
  room.deck = deck;

  addLog(room, `${ps[sbIdx].name} posts SB $${sbAmt}`);
  addLog(room, `${ps[bbIdx].name} posts BB $${bbAmt}`);
  broadcastState(room);

  // ─── Phases ───
  const phaseList = ['pre-flop', 'flop', 'turn', 'river'];

  for (const phaseName of phaseList) {
    room.phase = phaseName;

    if (phaseName === 'flop') {
      addLog(room, '── Flop ──');
      room.topRevealed = 3;
      room.bottomRevealed = 3;
      const result = distributeCards(ps, deck, 3, room);
      deck = result.deck; currentOwed += result.owed;
    } else if (phaseName === 'turn') {
      addLog(room, '── Turn ──');
      room.topRevealed = 4;
      room.bottomRevealed = 4;
      const result = distributeCards(ps, deck, 3, room);
      deck = result.deck; currentOwed += result.owed;
    } else if (phaseName === 'river') {
      addLog(room, '── River ──');
      room.topRevealed = 5;
      room.bottomRevealed = 5;
      const result = distributeCards(ps, deck, 3, room);
      deck = result.deck; currentOwed += result.owed;
    }

    room.deck = deck;
    room.owedCards = currentOwed;

    if (phaseName !== 'pre-flop') {
      for (const p of ps) p.currentBet = 0;
      curBet = 0;
      room.currentBet = 0;
      room.playerActions = {};
    }

    const canActBefore = ps.filter(p => !p.folded && !p.isAllIn && p.chips > 0);
    if (canActBefore.length <= 1) { broadcastState(room); continue; }

    const startIdx = phaseName === 'pre-flop' ? findNextActive(ps, bbIdx) : findNextActive(ps, newDealerIdx);

    // Betting round
    const betResult = await runBettingRound(room, ps, startIdx, curBet, potTotal, phaseName, deck, currentOwed);
    potTotal = betResult.pot;
    curBet = betResult.currentBet;
    deck = betResult.deck;
    currentOwed = betResult.owed;
    room.pot = potTotal;
    room.currentBet = curBet;
    room.deck = deck;
    room.owedCards = currentOwed;

    if (ps.filter(p => !p.folded).length <= 1) break;
  }

  // ─── Showdown ───
  const nonFolded = ps.filter(p => !p.folded);
  room.activePlayerIndex = -1;

  if (nonFolded.length === 1) {
    const winner = nonFolded[0];
    winner.chips += potTotal;
    room.winnerIds = [winner.id];
    room.pot = 0;
    room.phase = 'showdown';
    addLog(room, `🏆 ${winner.name} wins $${potTotal}!`);
  } else {
    room.phase = 'showdown';
    room.topRevealed = 5;
    room.bottomRevealed = 5;
    addLog(room, '── Showdown ──');

    const results = evaluateESGShowdown(nonFolded, topBoardCards, bottomBoardCards);
    const maxPoints = Math.max(...results.map(r => r.totalPoints));
    const winners = results.filter(r => r.totalPoints === maxPoints);
    const winIds = winners.map(w => w.playerId);
    const share = Math.floor(potTotal / winners.length);
    for (const wid of winIds) ps.find(p => p.id === wid).chips += share;
    room.pot = 0;
    room.winnerIds = winIds;
    room.showdownResults = results.map(r => ({
      ...r,
      topHandName: r.topHand ? HAND_NAMES[r.topHand.rank] : '-',
      bottomHandName: r.bottomHand ? HAND_NAMES[r.bottomHand.rank] : '-',
      handStrengthName: r.handStrength ? HAND_NAMES[r.handStrength.rank] : '-',
    }));

    for (const r of results) {
      const p = ps.find(pl => pl.id === r.playerId);
      addLog(room, `${p.name}: T:${r.topPoints.toFixed(1)} B:${r.bottomPoints.toFixed(1)} H:${r.handPoints.toFixed(1)} = ${r.totalPoints.toFixed(1)}pts`);
    }
    for (const w of winners) {
      addLog(room, `🏆 ${ps.find(p => p.id === w.playerId).name} wins $${share}! (${w.totalPoints.toFixed(1)} pts)`);
    }
  }

  broadcastState(room);

  // Wait for host to click next hand
  await waitForNextHand(room);

  const alive = ps.filter(p => p.chips > 0);
  if (alive.length >= 2) {
    runFullHand(room, handNum + 1);
  } else {
    addLog(room, '🎰 Game Over!');
    room.phase = 'waiting';
    room.state = 'lobby';
    broadcastState(room);
  }
}

async function runBettingRound(room, ps, startIdx, curBet, potTotal, phaseName, deck, currentOwed) {
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

    // Wait for this player's action
    const { action, amount } = await waitForAction(room, idx);

    if (action === 'fold') {
      const foldResult = handleFoldCards(ps, idx, deck, currentOwed, isRiver, room);
      deck = foldResult.deck; currentOwed = foldResult.owed;
      room.playerActions[idx] = { action: 'fold', amount: 0 };
      addLog(room, `${player.name} folds`);
    } else if (action === 'check') {
      room.playerActions[idx] = { action: 'check', amount: 0 };
      addLog(room, `${player.name} checks`);
    } else if (action === 'call') {
      const callAmt = Math.min(player.chips, curBet - player.currentBet);
      player.chips -= callAmt;
      player.currentBet += callAmt;
      potTotal += callAmt;
      if (player.chips === 0) player.isAllIn = true;
      room.playerActions[idx] = { action: player.isAllIn ? 'all-in' : 'call', amount: callAmt };
      addLog(room, `${player.name} calls $${callAmt}`);
    } else if (action === 'raise') {
      const totalBet = Math.min(player.chips + player.currentBet, amount);
      const raiseBy = totalBet - player.currentBet;
      const actualRaise = Math.min(player.chips, raiseBy);
      player.chips -= actualRaise;
      player.currentBet += actualRaise;
      potTotal += actualRaise;
      curBet = player.currentBet;
      if (player.chips === 0) player.isAllIn = true;
      lastRaiserIdx = idx;
      actedSet.clear();
      room.playerActions[idx] = { action: player.isAllIn ? 'all-in' : 'raise', amount: curBet };
      addLog(room, `${player.name} raises to $${curBet}`);
    }

    actedSet.add(player.id);
    room.pot = potTotal;
    room.currentBet = curBet;
    room.deck = deck;
    room.owedCards = currentOwed;
    broadcastState(room);

    if (ps.filter(p => !p.folded).length <= 1) break;
    idx = findNextActive(ps, idx);

    const canAct3 = ps.filter(p => !p.folded && !p.isAllIn && p.chips > 0);
    if (canAct3.every(p => p.currentBet === curBet) && canAct3.every(p => actedSet.has(p.id)) && canAct3.length > 0) break;
    if (canAct3.length === 0) break;
  }

  return { pot: potTotal, currentBet: curBet, deck, owed: currentOwed };
}

// ═══════════════════════════════════════
// SOCKET.IO CONNECTION
// ═══════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);
  let currentRoom = null;

  socket.on('create-room', ({ name }) => {
    const room = createRoom(socket.id, name);
    currentRoom = room.code;
    socket.join(room.code);
    socket.emit('room-created', { code: room.code });
    broadcastLobby(room);
    console.log(`Room ${room.code} created by ${name}`);
  });

  socket.on('join-room', ({ code, name }) => {
    const room = rooms.get(code.toUpperCase());
    if (!room) return socket.emit('error-msg', { message: 'Room not found' });
    if (room.state !== 'lobby') return socket.emit('error-msg', { message: 'Game already in progress' });
    if (room.players.length >= 7) return socket.emit('error-msg', { message: 'Room is full' });

    const id = room.players.length;
    room.players.push({
      id, socketId: socket.id, name, emoji: EMOJIS[id % EMOJIS.length],
      chips: 500, folded: false, currentBet: 0, holeCards: [], isAllIn: false,
    });
    currentRoom = room.code;
    socket.join(room.code);
    socket.emit('room-joined', { code: room.code });
    broadcastLobby(room);
    console.log(`${name} joined room ${room.code}`);
  });

  socket.on('start-game', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.players.length < 2) return;
    // Only host can start
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.id !== 0) return;

    room.state = 'playing';
    runFullHand(room, 1);
  });

  socket.on('player-action', ({ action, amount }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || !room.actionResolve) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.id !== room.players[room.actionResolve.playerIdx].id) return;

    room.actionResolve.resolve({ action, amount });
    room.actionResolve = null;
  });

  socket.on('next-hand', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || !room.nextHandResolve) return;
    room.nextHandResolve();
    room.nextHandResolve = null;
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIdx === -1) return;

    const player = room.players[playerIdx];
    console.log(`${player.name} left room ${currentRoom}`);

    if (room.state === 'lobby') {
      room.players.splice(playerIdx, 1);
      room.players.forEach((p, i) => p.id = i);
      if (room.players.length === 0) {
        rooms.delete(currentRoom);
      } else {
        broadcastLobby(room);
      }
    } else {
      // During game: fold the player
      player.folded = true;
      player.holeCards = [];
      // If it was their turn, auto-fold
      if (room.actionResolve && room.actionResolve.playerIdx === playerIdx) {
        room.actionResolve.resolve({ action: 'fold', amount: 0 });
        room.actionResolve = null;
      }
      broadcastState(room);
    }
  });
});

// Health check
app.get('/', (req, res) => res.json({ status: 'ESG Poker Server running' }));

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`ESG Poker server running on port ${PORT}`);
});
