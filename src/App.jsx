import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';

// In production, connect to same origin. In dev, connect to local server.
const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

const SEAT_POSITIONS_MAP = {
  2: [{ x: 50, y: 88 }, { x: 50, y: 6 }],
  3: [{ x: 50, y: 88 }, { x: 15, y: 30 }, { x: 85, y: 30 }],
  4: [{ x: 50, y: 88 }, { x: 8, y: 50 }, { x: 50, y: 6 }, { x: 92, y: 50 }],
  5: [{ x: 50, y: 88 }, { x: 8, y: 60 }, { x: 20, y: 15 }, { x: 80, y: 15 }, { x: 92, y: 60 }],
  6: [{ x: 50, y: 88 }, { x: 8, y: 62 }, { x: 8, y: 28 }, { x: 50, y: 6 }, { x: 92, y: 28 }, { x: 92, y: 62 }],
  7: [{ x: 50, y: 88 }, { x: 8, y: 65 }, { x: 8, y: 35 }, { x: 30, y: 6 }, { x: 70, y: 6 }, { x: 92, y: 35 }, { x: 92, y: 65 }],
};

function isRed(card) {
  return card.suit === '♥' || card.suit === '♦';
}

function cardKey(card) {
  return `${card.rank}${card.suit}`;
}

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
        ...(card.rank === '10' ? { letterSpacing: '-3px' } : {}),
      }}>
        {card.rank}
      </span>
      <span style={{ display: 'block', fontSize: suitSize, fontWeight: 700, color, lineHeight: 1, marginTop: 2 }}>
        {card.suit}
      </span>
    </div>
  );
}

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
   MAIN APP — ESG Multiplayer Client
   ═══════════════════════════════════════════════════════ */
export default function App() {
  const [screen, setScreen] = useState('home'); // home, lobby, game
  const [socket, setSocket] = useState(null);
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Lobby
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);

  // Game state from server
  const [gs, setGs] = useState(null); // full game state
  const [myId, setMyId] = useState(-1);
  const [raiseAmount, setRaiseAmount] = useState(6);

  const logRef = useRef(null);
  const isMobile = useIsMobile();

  // Connect socket
  useEffect(() => {
    const s = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    setSocket(s);

    s.on('room-created', ({ code }) => {
      setRoomCode(code);
      setScreen('lobby');
    });

    s.on('room-joined', ({ code }) => {
      setRoomCode(code);
      setScreen('lobby');
    });

    s.on('lobby-state', ({ players, isHost: host }) => {
      setLobbyPlayers(players);
      setIsHost(host);
    });

    s.on('game-state', (state) => {
      setGs(state);
      setMyId(state.myId);
      if (screen !== 'game') setScreen('game');
    });

    s.on('error-msg', ({ message }) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(''), 3000);
    });

    return () => s.disconnect();
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [gs?.gameLog]);

  function createRoom() {
    if (!name.trim()) return;
    socket.emit('create-room', { name: name.trim() });
  }

  function joinRoom() {
    if (!name.trim() || !joinCode.trim()) return;
    socket.emit('join-room', { code: joinCode.trim().toUpperCase(), name: name.trim() });
  }

  function startGame() {
    socket.emit('start-game');
  }

  function sendAction(action, amount = 0) {
    socket.emit('player-action', { action, amount });
  }

  function nextHand() {
    socket.emit('next-hand');
  }

  // ═══════════════════════════════════════
  // HOME SCREEN
  // ═══════════════════════════════════════
  if (screen === 'home') {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#0d0d0d',
        fontFamily: "'IBM Plex Mono',monospace",
      }}>
        <h1 style={{ fontFamily: "'Playfair Display',serif", color: '#c9a84c', fontSize: 48, letterSpacing: 4, margin: '0 0 8px' }}>
          ESG POKER
        </h1>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 32 }}>6-3-3-3 Variant · Online Multiplayer</p>

        {errorMsg && (
          <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 16, padding: '8px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.1)' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ maxWidth: 360, width: '90%' }}>
          <input type="text" placeholder="Your name" value={name}
            onChange={e => setName(e.target.value)}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 8, fontSize: 16,
              background: '#1a1a1a', border: '1px solid #333', color: '#eee',
              fontFamily: "'IBM Plex Mono',monospace", outline: 'none', marginBottom: 20,
              boxSizing: 'border-box',
            }}
          />

          <button onClick={createRoom}
            disabled={!name.trim()}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              cursor: name.trim() ? 'pointer' : 'default',
              background: name.trim() ? 'linear-gradient(135deg,#c9a84c,#9a7b2e)' : '#333',
              color: name.trim() ? '#0d0d0d' : '#666',
              border: 'none', fontFamily: "'Playfair Display',serif", letterSpacing: 2, marginBottom: 16,
            }}
          >CREATE ROOM</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
            <input type="text" placeholder="Room code" value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 8, fontSize: 16,
                background: '#1a1a1a', border: '1px solid #333', color: '#eee',
                fontFamily: "'IBM Plex Mono',monospace", outline: 'none',
                textTransform: 'uppercase', letterSpacing: 4, textAlign: 'center',
              }}
            />
            <button onClick={joinRoom}
              disabled={!name.trim() || !joinCode.trim()}
              style={{
                padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                cursor: name.trim() && joinCode.trim() ? 'pointer' : 'default',
                background: name.trim() && joinCode.trim() ? '#c9a84c' : '#333',
                color: name.trim() && joinCode.trim() ? '#0d0d0d' : '#666',
                border: 'none', fontFamily: "'IBM Plex Mono',monospace",
              }}
            >JOIN</button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // LOBBY SCREEN
  // ═══════════════════════════════════════
  if (screen === 'lobby') {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#0d0d0d',
        fontFamily: "'IBM Plex Mono',monospace",
      }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#c9a84c', fontSize: 28, margin: '0 0 8px' }}>
          Room: {roomCode}
        </h2>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
          Share this code with friends to join
        </p>

        <div style={{
          background: '#1a1a1a', borderRadius: 16, padding: '20px 32px', marginBottom: 24,
          border: '1px solid #333', minWidth: 280,
        }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 2 }}>
            Players ({lobbyPlayers.length}/7)
          </div>
          {lobbyPlayers.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <span style={{ fontSize: 20 }}>{p.emoji}</span>
              <span style={{ color: '#eee', fontSize: 14 }}>{p.name}</span>
              {i === 0 && <span style={{ fontSize: 9, color: '#c9a84c', marginLeft: 'auto' }}>HOST</span>}
            </div>
          ))}
        </div>

        {isHost && lobbyPlayers.length >= 2 && (
          <button onClick={startGame}
            style={{
              padding: '14px 40px', borderRadius: 14, fontSize: 18, fontWeight: 700,
              cursor: 'pointer',
              background: 'linear-gradient(135deg,#c9a84c,#9a7b2e)', color: '#0d0d0d',
              border: 'none', fontFamily: "'Playfair Display',serif", letterSpacing: 2,
            }}
          >START GAME</button>
        )}

        {isHost && lobbyPlayers.length < 2 && (
          <p style={{ color: '#555', fontSize: 12 }}>Waiting for more players...</p>
        )}

        {!isHost && (
          <p style={{ color: '#555', fontSize: 12 }}>Waiting for host to start...</p>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════
  // GAME SCREEN
  // ═══════════════════════════════════════
  if (!gs) return <div style={{ background: '#0d0d0d', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Connecting...</div>;

  const numPlayers = gs.players.length;
  const seatPositions = SEAT_POSITIONS_MAP[numPlayers] || SEAT_POSITIONS_MAP[6];

  // Reorder players so "me" is at seat 0 (bottom)
  const meIdx = gs.players.findIndex(p => p.id === myId);
  const reordered = [...gs.players.slice(meIdx), ...gs.players.slice(0, meIdx)];
  const myPlayer = reordered[0];
  const isMyTurn = gs.activePlayerIndex >= 0 && gs.players[gs.activePlayerIndex]?.id === myId;

  const toCall = isMyTurn ? gs.currentBet - (myPlayer?.currentBet || 0) : 0;
  const canCheck = toCall <= 0;

  // Pot limit calc
  const potAfterCall = gs.pot + toCall;
  const potLimitMax = gs.currentBet + potAfterCall;
  const minRaise = Math.max(3, gs.currentBet * 2);
  const maxRaise = Math.min((myPlayer?.chips || 0) + (myPlayer?.currentBet || 0), potLimitMax);

  const showConfetti = gs.winnerIds.includes(myId) && gs.phase === 'showdown';

  // ═══════════════════════════════════════
  // MOBILE GAME LAYOUT
  // ═══════════════════════════════════════
  if (isMobile) {
    const others = reordered.filter(p => p.id !== myId);
    return (
      <div style={{
        width: '100vw', height: '100vh', overflow: 'auto',
        background: '#1a1a2e', fontFamily: "'IBM Plex Mono',monospace",
        display: 'flex', flexDirection: 'column', userSelect: 'none',
        position: 'relative',
      }}>
        {/* Table background */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden',
          background: 'linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 30%, #0d0d1a 100%)',
        }}>
          <div style={{
            position: 'absolute', left: '50%', top: '45%', transform: 'translate(-50%,-50%)',
            width: '92vw', height: '70vh', borderRadius: '50%',
            background: 'radial-gradient(ellipse, #1a5c5c 0%, #164848 40%, #0f3535 70%, #0a2a2a 100%)',
            border: '6px solid #2a2a2a',
            boxShadow: 'inset 0 0 80px rgba(0,0,0,0.4), 0 0 40px rgba(0,0,0,0.6)',
          }}>
            <div style={{
              position: 'absolute', inset: 10, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.06)',
            }} />
          </div>
        </div>
        {/* Content layer */}
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        <Confetti active={showConfetti} />

        {/* Header */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
        }}>
          <span style={{ fontFamily: "'Playfair Display',serif", color: '#c9a84c', fontSize: 16, letterSpacing: 2 }}>ESG</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {['pre-flop', 'flop', 'turn', 'river', 'showdown'].map(p => (
              <span key={p} style={{
                fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, padding: '2px 5px',
                borderRadius: 10, color: gs.phase === p ? '#fbbf24' : '#444',
                background: gs.phase === p ? 'rgba(201,168,76,0.12)' : 'transparent',
              }}>{p === 'pre-flop' ? 'PRE' : p === 'showdown' ? 'SD' : p.toUpperCase()}</span>
            ))}
          </div>
          <span style={{ color: '#555', fontSize: 10 }}>{roomCode}</span>
        </div>

        {/* Other players positioned around the table */}
        {(() => {
          const mobileSeats = {
            1: [{ x: 50, y: 8 }],
            2: [{ x: 15, y: 12 }, { x: 85, y: 12 }],
            3: [{ x: 10, y: 30 }, { x: 50, y: 8 }, { x: 90, y: 30 }],
            4: [{ x: 8, y: 30 }, { x: 35, y: 8 }, { x: 65, y: 8 }, { x: 92, y: 30 }],
            5: [{ x: 8, y: 35 }, { x: 25, y: 10 }, { x: 50, y: 5 }, { x: 75, y: 10 }, { x: 92, y: 35 }],
            6: [{ x: 8, y: 38 }, { x: 15, y: 14 }, { x: 50, y: 5 }, { x: 85, y: 14 }, { x: 92, y: 38 }, { x: 50, y: 5 }],
          };
          const seats = mobileSeats[others.length] || mobileSeats[Math.min(others.length, 6)];
          return others.map((player, i) => {
            const pos = seats[i];
            if (!pos) return null;
            const isActive = gs.activePlayerIndex >= 0 && gs.players[gs.activePlayerIndex]?.id === player.id;
            const isWinner = gs.winnerIds.includes(player.id);
            const isFolded = player.folded;
            const action = gs.playerActions[gs.players.findIndex(p => p.id === player.id)];
            return (
              <div key={player.id} style={{
                position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`,
                transform: 'translate(-50%,-50%)', zIndex: 10,
              }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '4px 8px', borderRadius: 10,
                  background: isActive ? 'rgba(201,168,76,0.15)' : 'rgba(13,13,13,0.8)',
                  border: isActive ? '1px solid #c9a84c' : '1px solid transparent',
                  opacity: isFolded ? 0.35 : 1, minWidth: 50,
                }}>
                  <span style={{ fontSize: 16 }}>{player.emoji}</span>
                  <span style={{ fontSize: 8, color: '#bbb' }}>{player.name}</span>
                  <span style={{ fontSize: 9, color: '#c9a84c', fontWeight: 700 }}>${player.chips}</span>
                  {action && (
                    <span style={{
                      fontSize: 7, padding: '1px 4px', borderRadius: 6, marginTop: 1,
                      background: action.action === 'fold' ? '#7f1d1d' : action.action === 'raise' ? '#713f12' : '#14532d',
                      color: action.action === 'fold' ? '#fca5a5' : action.action === 'raise' ? '#fde68a' : '#86efac',
                    }}>{action.action === 'raise' ? `R$${action.amount}` : action.action.toUpperCase()}</span>
                  )}
                  {isWinner && <span style={{ fontSize: 8, color: '#fbbf24' }}>WIN</span>}
                </div>
              </div>
            );
          });
        })()}

        {/* Pot — centered on table */}
        {gs.pot > 0 && (
          <div style={{
            position: 'absolute', left: '50%', top: '33%', transform: 'translate(-50%,-50%)', zIndex: 10,
            textAlign: 'center',
          }}>
            <span style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.5)' }}>Pot </span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: '#c9a84c', fontSize: 16 }}>${gs.pot}</span>
          </div>
        )}

        {/* Boards — centered on table */}
        <div style={{
          position: 'absolute', left: '50%', top: '45%', transform: 'translate(-50%,-50%)', zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.4)' }}>Top</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {gs.topBoard.map((card, i) => (
                <PlayingCard key={`t${i}`} card={card} faceDown={i >= gs.topRevealed} small
                  style={{ width: 38, height: 53 }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.4)' }}>Bottom</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {gs.bottomBoard.map((card, i) => (
                <PlayingCard key={`b${i}`} card={card} faceDown={i >= gs.bottomRevealed} small
                  style={{ width: 38, height: 53 }} />
              ))}
            </div>
          </div>
        </div>

        {/* Showdown overlay */}
        {gs.phase === 'showdown' && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            padding: '12px 16px', maxHeight: '55vh', overflowY: 'auto',
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
          }}>
            <div style={{ fontSize: 12, color: '#c9a84c', fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>SHOWDOWN</div>
            {reordered.filter(p => !p.folded && p.holeCards?.length > 0).map(player => {
              const sdResult = gs.showdownResults?.find(r => r.playerId === player.id);
              const isWinner = gs.winnerIds.includes(player.id);
              return (
                <div key={player.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{player.emoji}</span>
                    <span style={{ fontSize: 11, color: isWinner ? '#fbbf24' : '#bbb', fontWeight: isWinner ? 700 : 400 }}>
                      {player.name}{player.id === myId ? ' (you)' : ''}
                    </span>
                    {sdResult && (
                      <span style={{ fontSize: 10, color: isWinner ? '#fbbf24' : '#888', marginLeft: 'auto' }}>
                        {sdResult.totalPoints.toFixed(1)} pts
                      </span>
                    )}
                    {isWinner && <span style={{ fontSize: 10, color: '#fbbf24' }}> WIN</span>}
                  </div>
                  <div style={{ display: 'flex' }}>
                    {player.holeCards.map((c, ci) => (
                      <div key={cardKey(c)} style={{ marginLeft: ci === 0 ? 0 : -24, zIndex: ci }}>
                        <PlayingCard card={c} small style={{ width: 34, height: 48 }} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <button onClick={nextHand}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', marginTop: 4,
                background: 'linear-gradient(135deg,#c9a84c,#9a7b2e)', color: '#0d0d0d',
                border: 'none', fontFamily: "'Playfair Display',serif", letterSpacing: 2,
              }}
            >NEXT HAND</button>
          </div>
        )}

        {/* My cards — bottom area */}
        {myPlayer && myPlayer.holeCards?.length > 0 && gs.phase !== 'showdown' && (
          <div style={{
            position: 'absolute', bottom: isMyTurn ? 110 : 40, left: 0, right: 0, zIndex: 15,
            padding: '0 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14 }}>{myPlayer.emoji}</span>
              <span style={{ fontSize: 11, color: '#c9a84c', fontWeight: 700 }}>{myPlayer.name}</span>
              <span style={{ fontSize: 11, color: '#c9a84c', marginLeft: 'auto' }}>${myPlayer.chips}</span>
            </div>
            <div style={{ display: 'flex', overflowX: 'auto', paddingBottom: 4 }}>
              {myPlayer.holeCards.map((card, i) => (
                <div key={cardKey(card)} style={{ marginLeft: i === 0 ? 0 : -26, flexShrink: 0, zIndex: i }}>
                  <PlayingCard card={card} small style={{ width: 42, height: 59 }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action bar — fixed bottom */}
        {isMyTurn && gs.phase !== 'showdown' && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
            padding: '8px 12px', background: 'rgba(13,13,13,0.95)',
            borderTop: '1px solid #222',
          }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <MobileActionBtn onClick={() => sendAction('fold')} bg="#7f1d1d" color="#fca5a5" label="FOLD" />
              {canCheck ? (
                <MobileActionBtn onClick={() => sendAction('check')} bg="#14532d" color="#86efac" label="CHECK" />
              ) : (
                <MobileActionBtn onClick={() => sendAction('call')} bg="#1e3a5f" color="#93c5fd" label={`CALL $${toCall}`} />
              )}
              <MobileActionBtn onClick={() => sendAction('raise', (myPlayer?.chips || 0) + (myPlayer?.currentBet || 0))}
                bg="#581c87" color="#d8b4fe" label="ALL IN" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="range" min={minRaise} max={maxRaise} value={Math.min(raiseAmount, maxRaise)}
                onChange={e => setRaiseAmount(Number(e.target.value))}
                style={{ flex: 1 }} />
              <MobileActionBtn onClick={() => sendAction('raise', raiseAmount)} bg="#713f12" color="#fde68a"
                label={`RAISE $${raiseAmount}`} />
            </div>
          </div>
        )}

        {/* Waiting indicator */}
        {!isMyTurn && gs.phase !== 'showdown' && gs.phase !== 'waiting' && gs.phase !== 'dealing' && (
          <div style={{
            position: 'absolute', bottom: 10, left: 0, right: 0, zIndex: 15,
            textAlign: 'center', color: '#888', fontSize: 11,
          }}>
            Waiting for {gs.activePlayerIndex >= 0 ? gs.players[gs.activePlayerIndex]?.name : '...'}
          </div>
        )}

        {/* Info */}
        <div style={{
          position: 'absolute', bottom: 2, left: 0, right: 0, zIndex: 5,
          fontSize: 8, color: 'rgba(255,255,255,0.2)', textAlign: 'center',
        }}>
          $1/$3 · #{gs.handNumber} · Deck:{gs.deckCount}
          {gs.owedCards > 0 && ` · Owed:${gs.owedCards}`}
        </div>
        </div>{/* close content layer */}
      </div>
    );
  }

  // ═══════════════════════════════════════
  // DESKTOP GAME LAYOUT
  // ═══════════════════════════════════════

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
          ESG POKER
        </h1>
        <span style={{ color: '#555', fontSize: 11 }}>Room: {roomCode}</span>
      </div>

      {/* ── Phase indicator ── */}
      <div style={{
        position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, display: 'flex', gap: 8,
      }}>
        {['pre-flop', 'flop', 'turn', 'river', 'showdown'].map(p => (
          <span key={p} style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, padding: '2px 8px',
            borderRadius: 20, color: gs.phase === p ? '#fbbf24' : '#555',
            background: gs.phase === p ? 'rgba(201,168,76,0.12)' : 'transparent',
            border: gs.phase === p ? '1px solid rgba(201,168,76,0.25)' : '1px solid transparent',
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
            background: '#1a4d2e', border: '6px solid #2d1b0e',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 0 0 10px #2d1b0e, 0 0 0 14px #1a0f06, 0 0 80px rgba(0,0,0,0.8)',
          }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 0.25,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
            }} />
            <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', border: '2px solid rgba(201,168,76,0.2)' }} />
          </div>

          {/* Pot */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <AnimatePresence>
              {gs.pot > 0 && (
                <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#888', marginBottom: 4 }}>Pot</span>
                  <ChipCount amount={gs.pot} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Top Board */}
          <div style={{ position: 'absolute', left: '50%', top: '28%', transform: 'translate(-50%,-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: '#aaa' }}>Top Board</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {gs.topBoard.map((card, i) => (
                <motion.div key={`top-${i}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={i < gs.topRevealed ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.4 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                >
                  <PlayingCard card={card} faceDown={i >= gs.topRevealed} small />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Bottom Board */}
          <div style={{ position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: '#aaa' }}>Bottom Board</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {gs.bottomBoard.map((card, i) => (
                <motion.div key={`bot-${i}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={i < gs.bottomRevealed ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.4 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                >
                  <PlayingCard card={card} faceDown={i >= gs.bottomRevealed} small />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Player seats */}
          {reordered.map((player, seatIdx) => {
            const pos = seatPositions[seatIdx];
            if (!pos) return null;
            const isActive = gs.activePlayerIndex >= 0 && gs.players[gs.activePlayerIndex]?.id === player.id;
            const isWinner = gs.winnerIds.includes(player.id);
            const isFolded = player.folded;
            const isMe = player.id === myId;
            const action = gs.playerActions[gs.players.findIndex(p => p.id === player.id)];
            const sdResult = gs.showdownResults?.find(r => r.playerId === player.id);

            return (
              <div key={player.id} style={{
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
                      background: isMe ? 'rgba(201,168,76,0.08)' : 'rgba(13,13,13,0.88)',
                      backdropFilter: 'blur(4px)',
                      border: isActive && !isFolded ? '2px solid #c9a84c' : isMe ? '2px solid rgba(201,168,76,0.3)' : '2px solid transparent',
                      boxShadow: isWinner ? '0 0 20px rgba(251,191,36,0.4)' : isActive ? '0 0 15px rgba(201,168,76,0.25)' : 'none',
                    }}
                  >
                    {isActive && !isFolded && (
                      <motion.div
                        animate={{ boxShadow: ['0 0 8px #c9a84c44', '0 0 20px #c9a84c66', '0 0 8px #c9a84c44'] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        style={{ position: 'absolute', inset: 0, borderRadius: 14, border: '2px solid #c9a84c66', pointerEvents: 'none' }}
                      />
                    )}

                    {gs.dealerIndex === gs.players.findIndex(p => p.id === player.id) && (
                      <div style={{
                        position: 'absolute', top: -8, right: -8, width: 20, height: 20,
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, background: '#c9a84c', color: '#0d0d0d',
                      }}>D</div>
                    )}

                    <span style={{ fontSize: 24, marginBottom: 2 }}>{player.emoji}</span>
                    <span style={{ fontSize: 10, color: isMe ? '#c9a84c' : '#bbb', marginBottom: 2, fontWeight: isMe ? 700 : 400 }}>
                      {player.name}{isMe ? ' (you)' : ''}
                    </span>
                    <ChipCount amount={player.chips} />

                    {/* Showdown: reveal cards */}
                    {!player.folded && player.holeCards && player.holeCards.length > 0 && gs.phase === 'showdown' && (
                      <div style={{ display: 'flex', marginTop: 4, position: 'relative', zIndex: 20 }}>
                        {player.holeCards.map((c, ci) => (
                          <motion.div key={cardKey(c)}
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: ci * 0.04 }}
                            style={{ marginLeft: ci === 0 ? 0 : -30, zIndex: ci }}
                          >
                            <PlayingCard card={c} small />
                          </motion.div>
                        ))}
                      </div>
                    )}

                    {/* During play: card count */}
                    {!player.folded && player.cardCount > 0 && gs.phase !== 'showdown' && !isMe && (
                      <div style={{ fontSize: 9, color: '#888', marginTop: 4, padding: '2px 6px', borderRadius: 6, background: 'rgba(50,50,50,0.4)' }}>
                        {player.cardCount} cards
                      </div>
                    )}

                    {sdResult && !player.folded && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
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

      {/* ── My hole cards ── */}
      {myPlayer && myPlayer.holeCards && myPlayer.holeCards.length > 0 && gs.phase !== 'showdown' && (
        <div style={{
          position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, display: 'flex',
        }}>
          {myPlayer.holeCards.map((card, i) => (
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

      {myPlayer && myPlayer.holeCards && myPlayer.holeCards.length > 0 && gs.phase !== 'showdown' && (
        <div style={{ position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 20, fontSize: 10, color: '#888' }}>
          {myPlayer.holeCards.length} cards
        </div>
      )}

      {/* ── Action Bar (only when it's my turn) ── */}
      <AnimatePresence>
        {isMyTurn && gs.phase !== 'showdown' && (
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
            <ActionBtn onClick={() => sendAction('fold')} bg="#7f1d1d" color="#fca5a5" label="FOLD" shortcut="F" />
            {canCheck ? (
              <ActionBtn onClick={() => sendAction('check')} bg="#14532d" color="#86efac" label="CHECK" shortcut="C" />
            ) : (
              <ActionBtn onClick={() => sendAction('call')} bg="#1e3a5f" color="#93c5fd" label={`CALL $${toCall}`} shortcut="C" />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="range" min={minRaise} max={maxRaise} value={Math.min(raiseAmount, maxRaise)}
                onChange={e => setRaiseAmount(Number(e.target.value))}
                style={{ width: 100 }} />
              <ActionBtn onClick={() => sendAction('raise', raiseAmount)} bg="#713f12" color="#fde68a"
                label={`RAISE $${raiseAmount}`} shortcut="Space" />
            </div>
            <ActionBtn onClick={() => sendAction('raise', (myPlayer?.chips || 0) + (myPlayer?.currentBet || 0))}
              bg="#581c87" color="#d8b4fe" label="ALL IN" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Next Hand button ── */}
      {gs.phase === 'showdown' && (
        <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 30 }}>
          <button onClick={nextHand}
            style={{
              padding: '12px 36px', borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer',
              background: 'linear-gradient(135deg,#c9a84c,#9a7b2e)', color: '#0d0d0d',
              border: 'none', fontFamily: "'Playfair Display',serif", letterSpacing: 2,
            }}
          >NEXT HAND</button>
        </div>
      )}

      {/* ── Game Log ── */}
      <div style={{ position: 'absolute', top: 68, right: 16, zIndex: 20, width: 260 }}>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: '#555', marginBottom: 4, paddingLeft: 4 }}>Game Log</div>
        <div ref={logRef} className="scrollbar-thin" style={{ maxHeight: '40vh', overflowY: 'auto', paddingRight: 4 }}>
          {(gs.gameLog || []).map((msg, i) => (
            <div key={i} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              color: msg.includes('🏆') ? '#fbbf24' : msg.startsWith('──') ? 'rgba(201,168,76,0.5)' : '#888',
              background: msg.includes('🏆') ? 'rgba(201,168,76,0.06)' : 'transparent',
            }}>{msg}</div>
          ))}
        </div>
      </div>

      {/* ── Info bar ── */}
      <div style={{ position: 'absolute', bottom: 8, left: 16, zIndex: 20, fontSize: 10, color: '#555' }}>
        Blinds: $1/$3 · Hand #{gs.handNumber} · Deck: {gs.deckCount} cards
        {gs.owedCards > 0 && ` · Owed: ${gs.owedCards}/player`}
      </div>
    </div>
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

function MobileActionBtn({ onClick, bg, color, label }) {
  return (
    <button onClick={onClick}
      style={{
        flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', border: 'none', background: bg, color, whiteSpace: 'nowrap',
        fontFamily: "'IBM Plex Mono',monospace", textAlign: 'center',
      }}
    >
      {label}
    </button>
  );
}
