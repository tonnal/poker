// ============================================================
// Texas Hold'em Poker Engine — full game logic from scratch
// ============================================================

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };

export const HAND_RANKS = {
  ROYAL_FLUSH: 10,
  STRAIGHT_FLUSH: 9,
  FOUR_OF_A_KIND: 8,
  FULL_HOUSE: 7,
  FLUSH: 6,
  STRAIGHT: 5,
  THREE_OF_A_KIND: 4,
  TWO_PAIR: 3,
  ONE_PAIR: 2,
  HIGH_CARD: 1,
};

export const HAND_NAMES = {
  10: 'Royal Flush',
  9: 'Straight Flush',
  8: 'Four of a Kind',
  7: 'Full House',
  6: 'Flush',
  5: 'Straight',
  4: 'Three of a Kind',
  3: 'Two Pair',
  2: 'One Pair',
  1: 'High Card',
};

export const PHASES = ['pre-flop', 'flop', 'turn', 'river', 'showdown'];

export function createCard(rank, suit) {
  return { rank, suit, value: RANK_VALUES[rank] };
}

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createCard(rank, suit));
    }
  }
  return shuffle(deck);
}

export function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardKey(card) {
  return `${card.rank}${card.suit}`;
}

export function isRed(card) {
  return card.suit === '♥' || card.suit === '♦';
}

// ============================================================
// Hand Evaluator
// ============================================================

function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluateFiveCards(cards) {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map(c => c.value);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;
  // Normal straight
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0];
  }
  // Ace-low straight (A-2-3-4-5)
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5; // 5-high straight
  }

  // Count ranks
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  if (isFlush && isStraight) {
    if (straightHigh === 14) return { rank: HAND_RANKS.ROYAL_FLUSH, kickers: [14] };
    return { rank: HAND_RANKS.STRAIGHT_FLUSH, kickers: [straightHigh] };
  }
  if (groups[0].count === 4) {
    return { rank: HAND_RANKS.FOUR_OF_A_KIND, kickers: [groups[0].value, groups[1].value] };
  }
  if (groups[0].count === 3 && groups[1].count === 2) {
    return { rank: HAND_RANKS.FULL_HOUSE, kickers: [groups[0].value, groups[1].value] };
  }
  if (isFlush) {
    return { rank: HAND_RANKS.FLUSH, kickers: values };
  }
  if (isStraight) {
    return { rank: HAND_RANKS.STRAIGHT, kickers: [straightHigh] };
  }
  if (groups[0].count === 3) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rank: HAND_RANKS.THREE_OF_A_KIND, kickers: [groups[0].value, ...kickers] };
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairs = [groups[0].value, groups[1].value].sort((a, b) => b - a);
    const kicker = groups[2].value;
    return { rank: HAND_RANKS.TWO_PAIR, kickers: [...pairs, kicker] };
  }
  if (groups[0].count === 2) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rank: HAND_RANKS.ONE_PAIR, kickers: [groups[0].value, ...kickers] };
  }
  return { rank: HAND_RANKS.HIGH_CARD, kickers: values };
}

export function evaluateHand(holeCards, communityCards) {
  // PLO rules: must use exactly 2 hole cards + exactly 3 community cards
  const holeCombos = getCombinations(holeCards, 2);
  const commCombos = getCombinations(communityCards, 3);
  let best = null;
  let bestCards = null;
  for (const hc of holeCombos) {
    for (const cc of commCombos) {
      const combo = [...hc, ...cc];
      const result = evaluateFiveCards(combo);
      if (!best || compareHands(result, best) > 0) {
        best = result;
        bestCards = combo;
      }
    }
  }
  return { ...best, bestCards };
}

export function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

// ============================================================
// Hand Strength Estimation (for AI)
// ============================================================

export function estimateHandStrength(holeCards, communityCards) {
  if (communityCards.length === 0) {
    return estimatePreFlopStrength(holeCards);
  }
  const hand = evaluateHand(holeCards, communityCards);
  // Normalize: high card ~0.1, royal flush ~1.0
  const baseStrength = hand.rank / 10;
  // Add kicker bonus
  const kickerBonus = (hand.kickers[0] || 0) / 140;
  return Math.min(1, baseStrength + kickerBonus);
}

function estimatePreFlopStrength(holeCards) {
  // PLO5: evaluate all 2-card combos from the 5 hole cards
  const combos = getCombinations(holeCards, 2);
  let bestStrength = 0;
  for (const [c1, c2] of combos) {
    const highVal = Math.max(c1.value, c2.value);
    const lowVal = Math.min(c1.value, c2.value);
    const suited = c1.suit === c2.suit;
    const isPair = c1.value === c2.value;

    let strength = 0;
    if (isPair) {
      strength = 0.5 + (highVal / 14) * 0.45;
    } else {
      strength = (highVal + lowVal) / 28 * 0.6;
      if (suited) strength += 0.06;
      if (highVal - lowVal <= 2) strength += 0.04;
    }
    if (strength > bestStrength) bestStrength = strength;
  }
  // PLO hands are stronger on average, so scale down slightly
  return Math.min(1, Math.max(0.05, bestStrength * 0.9));
}

// ============================================================
// AI Decision Engine
// ============================================================

export const AI_PERSONALITIES = [
  { name: 'Viktor', emoji: '🎩', style: 'tight-aggressive', bluffRate: 0.08, aggression: 0.7 },
  { name: 'Luna', emoji: '🌙', style: 'loose-aggressive', bluffRate: 0.22, aggression: 0.8 },
  { name: 'Rex', emoji: '🦁', style: 'maniac', bluffRate: 0.25, aggression: 0.9 },
  { name: 'Mei', emoji: '🌸', style: 'tight-passive', bluffRate: 0.05, aggression: 0.3 },
  { name: 'Duke', emoji: '🎯', style: 'balanced', bluffRate: 0.15, aggression: 0.55 },
];

export function makeAIDecision(player, gameState, personality) {
  const { holeCards, communityCards, currentBet, pot, phase } = gameState;
  const playerBet = player.currentBet || 0;
  const toCall = currentBet - playerBet;
  const chips = player.chips;

  if (chips <= 0) return { action: 'check', amount: 0 };

  // Pot-limit max raise: pot + call amount + current pot
  const potLimitMax = pot + currentBet + toCall;

  const handStrength = estimateHandStrength(holeCards, communityCards);

  // Pot odds calculation
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;

  // Bluff roll
  const isBluffing = Math.random() < personality.bluffRate;
  const effectiveStrength = isBluffing ? Math.min(1, handStrength + 0.3) : handStrength;

  // Decision thresholds adjusted by personality aggression
  const foldThreshold = 0.25 - personality.aggression * 0.1;
  const raiseThreshold = 0.6 - personality.aggression * 0.15;

  // Must call or fold
  if (toCall > 0) {
    if (effectiveStrength < foldThreshold && toCall > chips * 0.3) {
      return { action: 'fold', amount: 0 };
    }
    if (effectiveStrength < foldThreshold && potOdds > effectiveStrength) {
      return { action: 'fold', amount: 0 };
    }
    if (effectiveStrength >= raiseThreshold && chips > toCall * 2) {
      const raiseAmount = Math.min(
        chips,
        potLimitMax, // pot-limit cap
        Math.max(currentBet * 2, Math.floor(pot * effectiveStrength * personality.aggression))
      );
      return { action: 'raise', amount: Math.min(chips, raiseAmount) };
    }
    return { action: 'call', amount: Math.min(chips, toCall) };
  }

  // Can check or bet
  if (effectiveStrength >= raiseThreshold) {
    const betAmount = Math.min(
      chips,
      potLimitMax, // pot-limit cap
      Math.max(gameState.bigBlind, Math.floor(pot * effectiveStrength * personality.aggression * 0.5))
    );
    return { action: 'raise', amount: betAmount };
  }

  return { action: 'check', amount: 0 };
}

// ============================================================
// Game State Management
// ============================================================

export function createInitialPlayers() {
  return [
    { id: 0, name: 'You', emoji: '😎', chips: 1000, isHuman: true, folded: false, currentBet: 0, holeCards: [], isAllIn: false },
    ...AI_PERSONALITIES.map((p, i) => ({
      id: i + 1, name: p.name, emoji: p.emoji, chips: 1000, isHuman: false,
      folded: false, currentBet: 0, holeCards: [], personality: p, isAllIn: false,
    })),
  ];
}

export function createGameState() {
  return {
    players: createInitialPlayers(),
    deck: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    phase: 'pre-flop',
    dealerIndex: 0,
    activePlayerIndex: 0,
    smallBlind: 5,
    bigBlind: 10,
    handNumber: 0,
    lastAction: null,
    winner: null,
    gameLog: [],
    isShowdown: false,
  };
}
