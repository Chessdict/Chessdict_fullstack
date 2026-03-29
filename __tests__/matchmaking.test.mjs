import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMatchmaking, parseStakeAmount } from '../lib/matchmaking.mjs';

let onMatch;
let mm;

beforeEach(() => {
  onMatch = vi.fn();
  mm = createMatchmaking({ onMatch });
});

// ─── Free Queue FIFO Matching ───

describe('Free queue FIFO matching', () => {
  it('matches two free players in FIFO order (p1=white, p2=black, stakeInfo=null)', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    mm.joinQueue('s2', { userId: 'bob' });

    expect(onMatch).toHaveBeenCalledOnce();
    const [p1, p2, stakeInfo] = onMatch.mock.calls[0];
    expect(p1.socketId).toBe('s1');
    expect(p1.userId).toBe('alice');
    expect(p2.socketId).toBe('s2');
    expect(p2.userId).toBe('bob');
    expect(p1.timeControl).toBe(3);
    expect(p2.timeControl).toBe(3);
    expect(stakeInfo).toBeNull();
  });

  it('does not match free players with different time controls', () => {
    mm.joinQueue('s1', { userId: 'alice', timeControl: 1 });
    mm.joinQueue('s2', { userId: 'bob', timeControl: 3 });

    expect(onMatch).not.toHaveBeenCalled();
    expect(mm._getFreeQueueLength()).toBe(2);
  });

  it('single player — no match', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    expect(onMatch).not.toHaveBeenCalled();
    expect(mm._getFreeQueueLength()).toBe(1);
  });

  it('three players — first two match, third waits', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    mm.joinQueue('s2', { userId: 'bob' });
    mm.joinQueue('s3', { userId: 'charlie' });

    expect(onMatch).toHaveBeenCalledOnce();
    expect(mm._getFreeQueueLength()).toBe(1);
    expect(mm._getFreeQueue()[0].userId).toBe('charlie');
  });

  it('four players — two sequential FIFO pairs', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    mm.joinQueue('s2', { userId: 'bob' });
    mm.joinQueue('s3', { userId: 'charlie' });
    mm.joinQueue('s4', { userId: 'dave' });

    expect(onMatch).toHaveBeenCalledTimes(2);
    expect(onMatch.mock.calls[0][0].userId).toBe('alice');
    expect(onMatch.mock.calls[0][1].userId).toBe('bob');
    expect(onMatch.mock.calls[1][0].userId).toBe('charlie');
    expect(onMatch.mock.calls[1][1].userId).toBe('dave');
    expect(mm._getFreeQueueLength()).toBe(0);
  });
});

// ─── Staked Queue: Exact Token/Time Matching ───

describe('Staked queue matching', () => {
  it('exact same amount matches (10 == 10)', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'USDC', stakeAmount: '10' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g2', token: 'USDC', stakeAmount: '10' });

    expect(onMatch).toHaveBeenCalledOnce();
    const [, , stakeInfo] = onMatch.mock.calls[0];
    expect(stakeInfo).not.toBeNull();
    expect(stakeInfo.effectiveAmount).toBe(10);
    expect(stakeInfo.stakeAmount).toBe('10');
  });

  it('different positive amounts still match and use the lower amount', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'USDC', stakeAmount: '10' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g2', token: 'USDC', stakeAmount: '5' });

    expect(onMatch).toHaveBeenCalledOnce();
    const [, , stakeInfo] = onMatch.mock.calls[0];
    expect(stakeInfo.effectiveAmount).toBe(5);
    expect(stakeInfo.stakeAmount).toBe('5');
  });

  it('stakeInfo.onChainGameId comes from p1 (creator), effectiveAmount = min', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'creator-game-id', token: 'USDC', stakeAmount: '10' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'joiner-game-id', token: 'USDC', stakeAmount: '9.5' });

    expect(onMatch).toHaveBeenCalledOnce();
    const [p1, , stakeInfo] = onMatch.mock.calls[0];
    expect(p1.userId).toBe('alice');
    expect(stakeInfo.onChainGameId).toBe('creator-game-id');
    expect(stakeInfo.effectiveAmount).toBe(9.5);
    expect(stakeInfo.stakeAmount).toBe('9.5');
  });
});

// ─── Staked Queue: Token Case-Insensitivity ───

describe('Staked queue: token case-insensitivity', () => {
  it('ETH and eth go into the same bucket and match', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g2', token: 'eth', stakeAmount: '1' });

    expect(onMatch).toHaveBeenCalledOnce();
  });
});

// ─── Staked Queue Isolation ───

describe('Staked queue isolation', () => {
  it('different tokens → no match, 2 separate buckets', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '10' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g2', token: 'USDC', stakeAmount: '10' });

    expect(onMatch).not.toHaveBeenCalled();
    expect(mm._getStakedQueueSize()).toBe(2);
  });

  it('same token and time still match even when amounts are far apart', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'USDC', stakeAmount: '10' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g2', token: 'USDC', stakeAmount: '5' });

    expect(onMatch).toHaveBeenCalledOnce();
    const [, , stakeInfo] = onMatch.mock.calls[0];
    expect(stakeInfo.effectiveAmount).toBe(5);
  });

  it('same token and amount but different time control do not match', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'USDC', stakeAmount: '10', timeControl: 1 });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g2', token: 'USDC', stakeAmount: '10', timeControl: 3 });

    expect(onMatch).not.toHaveBeenCalled();
    expect(mm._getStakedQueue().get('usdc').length).toBe(2);
  });

  it('match within one token bucket, other buckets untouched', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g2', token: 'USDC', stakeAmount: '10' });
    mm.joinQueue('s3', { userId: 'charlie', staked: true, onChainGameId: 'g3', token: 'ETH', stakeAmount: '1' });

    expect(onMatch).toHaveBeenCalledOnce();
    const [p1, p2] = onMatch.mock.calls[0];
    expect(p1.userId).toBe('alice');
    expect(p2.userId).toBe('charlie');
    // USDC bucket untouched
    expect(mm._getStakedQueue().get('usdc').length).toBe(1);
    // ETH bucket should be cleaned up
    expect(mm._getStakedQueue().has('eth')).toBe(false);
  });
});

// ─── Duplicate Prevention via isInAnyQueue ───

describe('Duplicate prevention via isInAnyQueue', () => {
  it('detects socketId in free queue', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    expect(mm.isInAnyQueue('s1')).toBe(true);
  });

  it('detects socketId in staked queue', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });
    expect(mm.isInAnyQueue('s1')).toBe(true);
  });

  it('returns false for unknown socketId', () => {
    expect(mm.isInAnyQueue('s99')).toBe(false);
  });

  it('prevents same socketId joining free queue twice', () => {
    const first = mm.joinQueue('s1', { userId: 'alice' });
    const second = mm.joinQueue('s1', { userId: 'alice' });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(mm._getFreeQueueLength()).toBe(1);
  });

  it('prevents free→staked cross-queue duplicate', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    const second = mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });

    expect(second).toBe(false);
    expect(mm._getFreeQueueLength()).toBe(1);
    expect(mm._getStakedQueueSize()).toBe(0);
  });

  it('prevents staked→free cross-queue duplicate', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });
    const second = mm.joinQueue('s1', { userId: 'alice' });

    expect(second).toBe(false);
    expect(mm._getStakedQueueSize()).toBe(1);
    expect(mm._getFreeQueueLength()).toBe(0);
  });

  it('returns false for socketId that was already matched+removed', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    mm.joinQueue('s2', { userId: 'bob' });

    // After match, both should be removed from queues
    expect(mm.isInAnyQueue('s1')).toBe(false);
    expect(mm.isInAnyQueue('s2')).toBe(false);
  });

  it('does not let the same user match with themselves from two devices', () => {
    mm.joinQueue('s1', { userId: 'alice', timeControl: 3 });
    mm.joinQueue('s2', { userId: 'ALICE', timeControl: 3 });

    expect(onMatch).not.toHaveBeenCalled();
    expect(mm._getFreeQueueLength()).toBe(1);
    expect(mm._getFreeQueue()[0].socketId).toBe('s2');
  });

  it('replaces an older staked queue entry for the same user on another device', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'USDC', stakeAmount: '10', timeControl: 3 });
    mm.joinQueue('s2', { userId: 'Alice', staked: true, onChainGameId: 'g2', token: 'USDC', stakeAmount: '10', timeControl: 3 });
    mm.joinQueue('s3', { userId: 'bob', staked: true, onChainGameId: 'g3', token: 'USDC', stakeAmount: '10', timeControl: 3 });

    expect(onMatch).toHaveBeenCalledOnce();
    const [p1, p2] = onMatch.mock.calls[0];
    expect([p1.socketId, p2.socketId]).toContain('s2');
    expect([p1.userId, p2.userId]).not.toEqual(['alice', 'ALICE']);
  });
});

// ─── removeFromAllQueues Cleanup ───

describe('removeFromAllQueues cleanup', () => {
  it('removes from free queue', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    expect(mm._getFreeQueueLength()).toBe(1);
    mm.removeFromAllQueues('s1');
    expect(mm._getFreeQueueLength()).toBe(0);
  });

  it('removes from staked queue bucket + empty bucket deleted', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });
    expect(mm._getStakedQueueSize()).toBe(1);
    mm.removeFromAllQueues('s1');
    expect(mm._getStakedQueueSize()).toBe(0);
  });

  it('leaves other players in same bucket untouched', () => {
    // Use different time controls so they won't match
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1', timeControl: 3 });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g2', token: 'ETH', stakeAmount: '100', timeControl: 1 });

    mm.removeFromAllQueues('s1');
    const bucket = mm._getStakedQueue().get('eth');
    expect(bucket.length).toBe(1);
    expect(bucket[0].userId).toBe('bob');
  });

  it('no-op for unknown socketId', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    mm.removeFromAllQueues('s99');
    expect(mm._getFreeQueueLength()).toBe(1);
  });

  it('thorough iteration across all buckets', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g2', token: 'USDC', stakeAmount: '10' });
    mm.joinQueue('s3', { userId: 'charlie' });

    mm.removeFromAllQueues('s1');
    mm.removeFromAllQueues('s2');
    mm.removeFromAllQueues('s3');

    expect(mm._getFreeQueueLength()).toBe(0);
    expect(mm._getStakedQueueSize()).toBe(0);
  });
});

describe('parseStakeAmount', () => {
  it('normalizes valid positive stake amounts', () => {
    expect(parseStakeAmount('10')).toBe(10);
    expect(parseStakeAmount('9.5')).toBe(9.5);
  });

  it('returns null for invalid or non-positive stake amounts', () => {
    expect(parseStakeAmount('abc')).toBeNull();
    expect(parseStakeAmount('NaN')).toBeNull();
    expect(parseStakeAmount('-1')).toBeNull();
    expect(parseStakeAmount('0')).toBeNull();
  });
});

// ─── Free vs Staked Isolation ───

describe('Free vs staked isolation', () => {
  it('free player + staked player → no match', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });

    expect(onMatch).not.toHaveBeenCalled();
    expect(mm._getFreeQueueLength()).toBe(1);
    expect(mm._getStakedQueueSize()).toBe(1);
  });

  it('free pair matches while staked player waits', () => {
    mm.joinQueue('s1', { userId: 'alice' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });
    mm.joinQueue('s3', { userId: 'charlie' });

    expect(onMatch).toHaveBeenCalledOnce();
    const [p1, p2] = onMatch.mock.calls[0];
    expect(p1.userId).toBe('alice');
    expect(p2.userId).toBe('charlie');
    expect(mm._getStakedQueueSize()).toBe(1);
  });

  it('staked pair matches while free player waits', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });
    mm.joinQueue('s2', { userId: 'bob' });
    mm.joinQueue('s3', { userId: 'charlie', staked: true, onChainGameId: 'g2', token: 'ETH', stakeAmount: '1' });

    expect(onMatch).toHaveBeenCalledOnce();
    const [p1, p2] = onMatch.mock.calls[0];
    expect(p1.userId).toBe('alice');
    expect(p2.userId).toBe('charlie');
    expect(mm._getFreeQueueLength()).toBe(1);
  });

  it('simultaneous free+staked matches process independently', () => {
    // Add two free and two staked
    mm.joinQueue('s1', { userId: 'alice' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '1' });
    mm.joinQueue('s3', { userId: 'charlie' });
    mm.joinQueue('s4', { userId: 'dave', staked: true, onChainGameId: 'g2', token: 'ETH', stakeAmount: '1' });

    expect(onMatch).toHaveBeenCalledTimes(2);
    // Free match
    expect(onMatch.mock.calls[0][0].userId).toBe('alice');
    expect(onMatch.mock.calls[0][1].userId).toBe('charlie');
    expect(onMatch.mock.calls[0][2]).toBeNull(); // stakeInfo
    // Staked match
    expect(onMatch.mock.calls[1][0].userId).toBe('bob');
    expect(onMatch.mock.calls[1][1].userId).toBe('dave');
    expect(onMatch.mock.calls[1][2]).not.toBeNull();
  });
});

// ─── Edge Cases ───

describe('Edge cases', () => {
  it('missing userId → joinQueue returns false', () => {
    const result = mm.joinQueue('s1', { staked: false });
    expect(result).toBe(false);
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('null data → joinQueue returns false', () => {
    const result = mm.joinQueue('s1', null);
    expect(result).toBe(false);
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('onMatch throws error → caught gracefully, queue emptied', () => {
    const throwingMatch = vi.fn(() => { throw new Error('DB failure'); });
    const mm2 = createMatchmaking({ onMatch: throwingMatch });

    // Should not throw
    expect(() => {
      mm2.joinQueue('s1', { userId: 'alice' });
      mm2.joinQueue('s2', { userId: 'bob' });
    }).not.toThrow();

    expect(throwingMatch).toHaveBeenCalledOnce();
    // Players were removed from queue (shifted before onMatch call)
    expect(mm2._getFreeQueueLength()).toBe(0);
  });

  it('empty staked buckets cleaned up after matching', () => {
    mm.joinQueue('s1', { userId: 'alice', staked: true, onChainGameId: 'g1', token: 'ETH', stakeAmount: '5' });
    mm.joinQueue('s2', { userId: 'bob', staked: true, onChainGameId: 'g2', token: 'ETH', stakeAmount: '5' });

    expect(onMatch).toHaveBeenCalledOnce();
    // The 'eth' bucket should be deleted since it's empty
    expect(mm._getStakedQueue().has('eth')).toBe(false);
    expect(mm._getStakedQueueSize()).toBe(0);
  });
});

// ─── parseStakeAmount unit tests ───

describe('parseStakeAmount', () => {
  it('normalizes valid positive stake amounts', () => {
    expect(parseStakeAmount('10')).toBe(10);
    expect(parseStakeAmount('9.5')).toBe(9.5);
  });

  it('returns null for zero', () => {
    expect(parseStakeAmount('0')).toBeNull();
  });

  it('returns null for negative', () => {
    expect(parseStakeAmount('-5')).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(parseStakeAmount('abc')).toBeNull();
  });
});
