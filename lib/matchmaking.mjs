/**
 * Pure matchmaking queue logic — no IO/DB dependencies.
 * Instantiate via createMatchmaking({ onMatch }) and wire into your server.
 */

export function amountsWithinRange(a, b) {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (isNaN(numA) || isNaN(numB) || numA <= 0 || numB <= 0) return false;
  return Math.abs(numA - numB) / Math.max(numA, numB) <= 0.10;
}

export function createMatchmaking({ onMatch }) {
  // Non-staked players: [{ socketId, userId }]
  const freeQueue = [];

  // Staked players keyed by lowercase token: Map<string, [{ socketId, userId, onChainGameId, token, stakeAmount }]>
  const stakedQueue = new Map();

  function isInAnyQueue(socketId) {
    if (freeQueue.some(p => p.socketId === socketId)) return true;
    for (const [, arr] of stakedQueue) {
      if (arr.some(p => p.socketId === socketId)) return true;
    }
    return false;
  }

  function removeFromAllQueues(socketId) {
    const freeIdx = freeQueue.findIndex(p => p.socketId === socketId);
    if (freeIdx !== -1) freeQueue.splice(freeIdx, 1);

    for (const [key, arr] of stakedQueue) {
      const idx = arr.findIndex(p => p.socketId === socketId);
      if (idx !== -1) {
        arr.splice(idx, 1);
        if (arr.length === 0) stakedQueue.delete(key);
      }
    }
  }

  function checkForMatch() {
    // 1. Free queue — FIFO
    if (freeQueue.length >= 2) {
      const p1 = freeQueue.shift();
      const p2 = freeQueue.shift();
      try {
        onMatch(p1, p2, null);
      } catch (error) {
        console.error("Error in onMatch (free):", error);
      }
    }

    // 2. Staked queues — range-based matching within each token bucket
    for (const [token, players] of stakedQueue) {
      let matched = true;
      while (matched) {
        matched = false;
        for (let i = 0; i < players.length; i++) {
          for (let j = i + 1; j < players.length; j++) {
            if (amountsWithinRange(players[i].stakeAmount, players[j].stakeAmount)) {
              const p1 = players[i];
              const p2 = players[j];
              // Remove both (j first since j > i)
              players.splice(j, 1);
              players.splice(i, 1);

              const effectiveAmount = Math.min(parseFloat(p1.stakeAmount), parseFloat(p2.stakeAmount));
              const stakeInfo = {
                onChainGameId: p1.onChainGameId,
                token: p1.token,
                stakeAmount: p1.stakeAmount,
                effectiveAmount,
              };
              try {
                onMatch(p1, p2, stakeInfo);
              } catch (error) {
                console.error(`Error in onMatch (staked, ${token}):`, error);
              }
              matched = true;
              break; // restart inner loops since array changed
            }
          }
          if (matched) break;
        }
      }
      if (players.length === 0) stakedQueue.delete(token);
    }
  }

  function joinQueue(socketId, data) {
    if (!data || !data.userId) return false;
    if (isInAnyQueue(socketId)) return false;

    const isStaked = !!data.staked;
    if (isStaked) {
      const { onChainGameId, token, stakeAmount } = data;
      const key = (token || '').toLowerCase();
      if (!stakedQueue.has(key)) stakedQueue.set(key, []);
      stakedQueue.get(key).push({ socketId, userId: data.userId, onChainGameId, token, stakeAmount });
    } else {
      freeQueue.push({ socketId, userId: data.userId });
    }

    checkForMatch();
    return true;
  }

  return {
    isInAnyQueue,
    removeFromAllQueues,
    checkForMatch,
    joinQueue,
    // Inspection helpers for testing
    _getFreeQueue: () => freeQueue,
    _getStakedQueue: () => stakedQueue,
    _getFreeQueueLength: () => freeQueue.length,
    _getStakedQueueSize: () => stakedQueue.size,
  };
}
