// ============================================================
// ESG (6-3-3-3) Poker Engine
// ============================================================

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };

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
// Combinations
// ============================================================

export function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

// ============================================================
// Hand Evaluator (5-card)
// ============================================================

function evaluateFiveCards(cards) {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map(c => c.value);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = false;
  let straightHigh = 0;
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0];
  }
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5;
  }

  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  if (isFlush && isStraight) {
    if (straightHigh === 14) return { rank: 10, kickers: [14] };
    return { rank: 9, kickers: [straightHigh] };
  }
  if (groups[0].count === 4) {
    return { rank: 8, kickers: [groups[0].value, groups[1].value] };
  }
  if (groups[0].count === 3 && groups[1].count === 2) {
    return { rank: 7, kickers: [groups[0].value, groups[1].value] };
  }
  if (isFlush) {
    return { rank: 6, kickers: values };
  }
  if (isStraight) {
    return { rank: 5, kickers: [straightHigh] };
  }
  if (groups[0].count === 3) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rank: 4, kickers: [groups[0].value, ...kickers] };
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairs = [groups[0].value, groups[1].value].sort((a, b) => b - a);
    return { rank: 3, kickers: [...pairs, groups[2].value] };
  }
  if (groups[0].count === 2) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rank: 2, kickers: [groups[0].value, ...kickers] };
  }
  return { rank: 1, kickers: values };
}

export function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

// ============================================================
// ESG Hand Evaluation — 3 categories
// ============================================================

// Top Board: exactly 2 hole cards + 3 from top board (Omaha rules)
// Bottom Board: exactly 2 hole cards + 3 from bottom board (Omaha rules)
// Hand Strength: best 5 from hole cards only (no board)

export function evaluateOmahaBoard(holeCards, boardCards) {
  const holeCombos = getCombinations(holeCards, 2);
  const boardCombos = getCombinations(boardCards, 3);
  let best = null;
  for (const hc of holeCombos) {
    for (const bc of boardCombos) {
      const result = evaluateFiveCards([...hc, ...bc]);
      if (!best || compareHands(result, best) > 0) {
        best = result;
      }
    }
  }
  return best;
}

export function evaluateHandStrength(holeCards) {
  // Best 5 cards from hole cards only
  if (holeCards.length < 5) return { rank: 0, kickers: [] };
  const combos = getCombinations(holeCards, 5);
  let best = null;
  for (const combo of combos) {
    const result = evaluateFiveCards(combo);
    if (!best || compareHands(result, best) > 0) {
      best = result;
    }
  }
  return best;
}

export function evaluateESGShowdown(players, topBoard, bottomBoard) {
  // Returns array of { playerId, topHand, bottomHand, handStrength, topPoints, bottomPoints, handPoints, totalPoints }
  const results = players.map(p => {
    const topHand = evaluateOmahaBoard(p.holeCards, topBoard);
    const bottomHand = evaluateOmahaBoard(p.holeCards, bottomBoard);
    const handStrength = evaluateHandStrength(p.holeCards);
    return {
      playerId: p.id,
      topHand,
      bottomHand,
      handStrength,
      topPoints: 0,
      bottomPoints: 0,
      handPoints: 0,
      totalPoints: 0,
    };
  });

  // Score each category
  scoreCategory(results, 'topHand', 'topPoints');
  scoreCategory(results, 'bottomHand', 'bottomPoints');
  scoreCategory(results, 'handStrength', 'handPoints');

  // Total
  for (const r of results) {
    r.totalPoints = r.topPoints + r.bottomPoints + r.handPoints;
  }

  return results;
}

function scoreCategory(results, handKey, pointsKey) {
  // Find the best hand in this category
  let best = null;
  for (const r of results) {
    if (!best || compareHands(r[handKey], best) > 0) {
      best = r[handKey];
    }
  }
  // Find all tied for best
  const winners = results.filter(r => compareHands(r[handKey], best) === 0);
  const pointsEach = 1 / winners.length;
  for (const w of winners) {
    w[pointsKey] = pointsEach;
  }
}

// ============================================================
// Pot Limit Calculation
// ============================================================

export function calculatePotLimitMax(pot, currentBet, playerCurrentBet) {
  const toCall = currentBet - playerCurrentBet;
  // PLO pot limit: pot + all bets on table + the call amount
  // Max raise = pot after calling = pot + toCall + toCall = pot + 2*toCall
  // Total bet = toCall + (pot + 2*toCall) = pot + 3*toCall
  // But the "max bet" from player's perspective is: call + pot-after-call
  const potAfterCall = pot + toCall;
  const maxRaise = potAfterCall + toCall; // this is the raise amount on top of call
  const maxTotalBet = toCall + potAfterCall; // total the player puts in = call + raise up to pot
  return currentBet + potAfterCall; // the total bet level
}

// ============================================================
// AI Decision Engine (simplified for ESG)
// ============================================================

const AI_PERSONALITIES = [
  { name: 'Viktor', emoji: '🎩', style: 'tight-aggressive', bluffRate: 0.08, aggression: 0.7 },
  { name: 'Luna', emoji: '🌙', style: 'loose-aggressive', bluffRate: 0.22, aggression: 0.8 },
  { name: 'Rex', emoji: '🦁', style: 'maniac', bluffRate: 0.25, aggression: 0.9 },
  { name: 'Mei', emoji: '🌸', style: 'tight-passive', bluffRate: 0.05, aggression: 0.3 },
  { name: 'Duke', emoji: '🎯', style: 'balanced', bluffRate: 0.15, aggression: 0.55 },
  { name: 'Zara', emoji: '⚡', style: 'aggressive', bluffRate: 0.18, aggression: 0.75 },
];

export { AI_PERSONALITIES };

export function estimateESGStrength(holeCards, topBoard, bottomBoard, phase) {
  let strength = 0;
  let count = 0;

  if (topBoard.length >= 3) {
    const topHand = evaluateOmahaBoard(holeCards, topBoard);
    strength += topHand.rank / 10;
    count++;
  }
  if (bottomBoard.length >= 3) {
    const bottomHand = evaluateOmahaBoard(holeCards, bottomBoard);
    strength += bottomHand.rank / 10;
    count++;
  }
  if (holeCards.length >= 5) {
    const handStr = evaluateHandStrength(holeCards);
    strength += handStr.rank / 10;
    count++;
  }

  if (count === 0) {
    // Pre-flop: estimate from hole cards
    const values = holeCards.map(c => c.value).sort((a, b) => b - a);
    const hasPair = new Set(values).size < values.length;
    const suitCounts = {};
    holeCards.forEach(c => suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1);
    const maxSuited = Math.max(...Object.values(suitCounts));

    strength = (values[0] + values[1]) / 28 * 0.5;
    if (hasPair) strength += 0.15;
    if (maxSuited >= 3) strength += 0.08;
    if (maxSuited >= 4) strength += 0.1;
    return Math.min(1, Math.max(0.05, strength));
  }

  return Math.min(1, strength / count);
}

export function makeAIDecision(player, gameState, personality) {
  const { holeCards, topBoard, bottomBoard, currentBet, pot, phase, bigBlind } = gameState;
  const playerBet = player.currentBet || 0;
  const toCall = currentBet - playerBet;
  const chips = player.chips;

  if (chips <= 0) return { action: 'check', amount: 0 };

  const potLimitMax = calculatePotLimitMax(pot, currentBet, playerBet);
  const handStrength = estimateESGStrength(holeCards, topBoard, bottomBoard, phase);

  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const isBluffing = Math.random() < personality.bluffRate;
  const effectiveStrength = isBluffing ? Math.min(1, handStrength + 0.3) : handStrength;

  const foldThreshold = 0.25 - personality.aggression * 0.1;
  const raiseThreshold = 0.6 - personality.aggression * 0.15;

  if (toCall > 0) {
    if (effectiveStrength < foldThreshold && toCall > chips * 0.3) {
      return { action: 'fold', amount: 0 };
    }
    if (effectiveStrength < foldThreshold && potOdds > effectiveStrength) {
      return { action: 'fold', amount: 0 };
    }
    if (effectiveStrength >= raiseThreshold && chips > toCall * 2) {
      const raiseAmount = Math.min(
        chips + playerBet,
        potLimitMax,
        Math.max(currentBet * 2, Math.floor(pot * effectiveStrength * personality.aggression))
      );
      return { action: 'raise', amount: Math.max(raiseAmount, currentBet * 2) };
    }
    return { action: 'call', amount: Math.min(chips, toCall) };
  }

  if (effectiveStrength >= raiseThreshold) {
    const betAmount = Math.min(
      chips + playerBet,
      potLimitMax,
      Math.max(bigBlind, Math.floor(pot * effectiveStrength * personality.aggression * 0.5))
    );
    return { action: 'raise', amount: Math.max(betAmount, bigBlind) };
  }

  return { action: 'check', amount: 0 };
}

// ============================================================
// Player Creation
// ============================================================

export function createInitialPlayers(numPlayers = 6) {
  const players = [
    { id: 0, name: 'You', emoji: '😎', chips: 500, isHuman: true, folded: false, currentBet: 0, holeCards: [], isAllIn: false },
  ];
  for (let i = 0; i < numPlayers - 1; i++) {
    const p = AI_PERSONALITIES[i];
    players.push({
      id: i + 1, name: p.name, emoji: p.emoji, chips: 500, isHuman: false,
      folded: false, currentBet: 0, holeCards: [], personality: p, isAllIn: false,
    });
  }
  return players;
}
