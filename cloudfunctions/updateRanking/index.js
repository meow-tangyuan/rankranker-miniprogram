const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function calcEloPair(items) {
  const minMatches = Math.min(...items.map(i => i.matches));
  const candidatesA = items.filter(i => i.matches === minMatches);
  const A = candidatesA[Math.floor(Math.random() * candidatesA.length)];
  const others = items.filter(i => i.index !== A.index);
  if (others.length === 0) return [A.index, A.index];
  others.sort((a, b) => Math.abs(a.score - A.score) - Math.abs(b.score - A.score));
  const closestDiff = Math.abs(others[0].score - A.score);
  const closest = others.filter(o => Math.abs(o.score - A.score) === closestDiff);
  const B = closest[Math.floor(Math.random() * closest.length)];
  return [A.index, B.index];
}

exports.main = async (event, context) => {
  const { rankingId, action, payload = {} } = event;
  const { OPENID } = cloud.getWXContext();

  if (!rankingId) return { code: 400, message: '缺少 rankingId' };

  try {
    const { data: ranking } = await db.collection('rankings').doc(rankingId).get();
    if (!ranking || ranking._openid !== OPENID) {
      return { code: 403, message: '无权限操作' };
    }
    if (ranking.status === 'completed') {
      return { code: 400, message: '该对战已完成' };
    }

    let { items, currentRound, totalRounds, mode, pairs, status } = ranking;
    let isCompleted = false;

    if (action === 'vote') {
      const { winnerIdx, loserIdx, isDraw = false } = payload;

      if (isDraw) {
        items[winnerIdx].wins += 0.5;
        items[winnerIdx].losses += 0.5;
        items[winnerIdx].matches += 1;
        items[loserIdx].wins += 0.5;
        items[loserIdx].losses += 0.5;
        items[loserIdx].matches += 1;

        if (mode === 'elo') {
          const K = 32;
          const Ra = items[winnerIdx].score;
          const Rb = items[loserIdx].score;
          const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
          const Eb = 1 / (1 + Math.pow(10, (Ra - Rb) / 400));
          items[winnerIdx].score = Math.round((Ra + K * (0.5 - Ea)) * 10) / 10;
          items[loserIdx].score = Math.round((Rb + K * (0.5 - Eb)) * 10) / 10;
        }
      } else {
        items[winnerIdx].wins += 1;
        items[winnerIdx].matches += 1;
        items[loserIdx].losses += 1;
        items[loserIdx].matches += 1;

        if (mode === 'elo') {
          const K = 32;
          const Ra = items[winnerIdx].score;
          const Rb = items[loserIdx].score;
          const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
          const Eb = 1 / (1 + Math.pow(10, (Ra - Rb) / 400));
          items[winnerIdx].score = Math.round((Ra + K * (1 - Ea)) * 10) / 10;
          items[loserIdx].score = Math.round((Rb + K * (0 - Eb)) * 10) / 10;
        }
      }
      currentRound += 1;
    } else if (action === 'finish') {
      isCompleted = true;
    }

    if (currentRound >= totalRounds || isCompleted) {
      status = 'completed';
      isCompleted = true;
    }

    const updateData = {
      items,
      currentRound,
      status,
      updatedAt: db.serverDate()
    };

    if (isCompleted) {
      updateData.nextPair = null;
    } else if (mode === 'elo') {
      updateData.nextPair = calcEloPair(items);
    } else if (mode === 'full') {
      // ========== 关键修复：full 模式下从 pairs 数组取下一对 ==========
      updateData.nextPair = pairs[currentRound] || null;
    }

    await db.collection('rankings').doc(rankingId).update({ data: updateData });

    return {
      code: 200,
      data: {
        items,
        currentRound,
        totalRounds,
        status,
        mode,
        pairs,
        nextPair: updateData.nextPair || null,
        isCompleted
      }
    };
  } catch (err) {
    return { code: 500, message: err.message };
  }
};
