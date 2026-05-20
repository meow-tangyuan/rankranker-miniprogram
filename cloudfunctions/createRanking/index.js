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
  const { selectedItems, type, title = '', mode: inputMode } = event;
  const { OPENID } = cloud.getWXContext();

  if (!selectedItems || selectedItems.length < 2) {
    return { code: 400, message: '至少需要选择2部作品' };
  }

  const n = selectedItems.length;
  
  // ✅ FIX #12: 优先使用传入的 mode，没有传再按条目数算
  const mode = inputMode || (n <= 15 ? 'full' : 'elo');

  const items = selectedItems.map((item, index) => ({
    ...item,
    index,
    score: 1500,
    wins: 0,
    losses: 0,
    matches: 0
  }));

  let pairs = [];
  let totalRounds = 0;
  let nextPair = null;

  if (mode === 'full') {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairs.push([i, j]);
      }
    }
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    totalRounds = pairs.length;
    nextPair = pairs[0];
  } else {
    totalRounds = Math.min(80, n * 3);
    nextPair = calcEloPair(items);
  }

  try {
    const res = await db.collection('rankings').add({
      data: {
        type,
        mode,
        status: 'ongoing',
        title,
        items,
        pairs,
        nextPair,
        currentRound: 0,
        totalRounds,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        _openid: OPENID
      }
    });
    return { code: 200, data: { rankingId: res._id, mode, totalRounds } };
  } catch (err) {
    return { code: 500, message: err.message };
  }
};
