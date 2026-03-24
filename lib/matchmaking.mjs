/**
 * Pure matchmaking queue logic — no IO/DB dependencies.
 * Instantiate via createMatchmaking({ onMatch }) and wire into your server.
 */

export function parseStakeAmount(amount) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) return null;
  return numericAmount;
}

const DEFAULT_QUEUE_TIME_CONTROL = 3;
const SUPPORTED_TIME_CONTROLS = new Set([1, 2, 3, 10]);

function normalizeTimeControl(timeControl) {
  const numericValue = Number.parseInt(String(timeControl ?? ""), 10);
  if (!Number.isFinite(numericValue)) return DEFAULT_QUEUE_TIME_CONTROL;
  return SUPPORTED_TIME_CONTROLS.has(numericValue)
    ? numericValue
    : DEFAULT_QUEUE_TIME_CONTROL;
}

export function createMatchmaking({ onMatch }) {
  // Non-staked players: [{ socketId, userId, timeControl }]
  const freeQueue = [];

  // Staked players keyed by lowercase token: Map<string, [{ socketId, userId, token, stakeAmount, onChainGameId, timeControl }]>
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
    // 1. Free queue — FIFO within each time control
    let matchedFreePlayers = true;
    while (matchedFreePlayers) {
      matchedFreePlayers = false;
      for (let i = 0; i < freeQueue.length; i++) {
        const p1 = freeQueue[i];
        const matchIndex = freeQueue.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex > i && candidate.timeControl === p1.timeControl,
        );

        if (matchIndex === -1) continue;

        const p2 = freeQueue[matchIndex];
        freeQueue.splice(matchIndex, 1);
        freeQueue.splice(i, 1);
        try {
          const result = onMatch(p1, p2, null);
          Promise.resolve(result).catch(error => {
            console.error("Error in onMatch (free):", error);
          });
        } catch (error) {
          console.error("Error in onMatch (free):", error);
        }
        matchedFreePlayers = true;
        break;
      }
    }

    // 2. Staked queues — FIFO within each token bucket and time control.
    // The lower of the two stake amounts becomes the effective game amount.
    for (const [token, players] of stakedQueue) {
      let matched = true;
      while (matched) {
        matched = false;
        for (let i = 0; i < players.length; i++) {
          for (let j = i + 1; j < players.length; j++) {
            const firstAmount = parseStakeAmount(players[i].stakeAmount);
            const secondAmount = parseStakeAmount(players[j].stakeAmount);
            if (
              players[i].timeControl === players[j].timeControl &&
              firstAmount !== null &&
              secondAmount !== null
            ) {
              const p1 = players[i];
              const p2 = players[j];
              // Remove both (j first since j > i)
              players.splice(j, 1);
              players.splice(i, 1);

              const effectiveAmount = Math.min(firstAmount, secondAmount);
              const stakeInfo = {
                token: p1.token,
                stakeAmount: String(effectiveAmount),
                onChainGameId: p1.onChainGameId,
                effectiveAmount,
                timeControl: p1.timeControl,
              };
              try {
                const result = onMatch(p1, p2, stakeInfo);
                Promise.resolve(result).catch(error => {
                  console.error(`Error in onMatch (staked, ${token}):`, error);
                });
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
    const timeControl = normalizeTimeControl(data.timeControl);
    if (isStaked) {
      const { token, stakeAmount, onChainGameId } = data;
      const normalizedStakeAmount = parseStakeAmount(stakeAmount);
      const key = (token || '').toLowerCase();
      if (!key || normalizedStakeAmount === null) return false;
      if (!stakedQueue.has(key)) stakedQueue.set(key, []);
      stakedQueue.get(key).push({
        socketId,
        userId: data.userId,
        token,
        stakeAmount: String(normalizedStakeAmount),
        onChainGameId,
        timeControl,
      });
    } else {
      freeQueue.push({ socketId, userId: data.userId, timeControl });
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
