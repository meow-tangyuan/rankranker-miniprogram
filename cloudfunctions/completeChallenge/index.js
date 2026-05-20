// cloudfunctions/completeChallenge/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  try {
    const { challengeId, inviteeRankingId } = event;
    const { OPENID } = cloud.getWXContext();
    const db = cloud.database();

    // ✅ FIX #13: 参数校验
    if (!challengeId || !inviteeRankingId) {
      return { success: false, errMsg: '缺少 challengeId 或 inviteeRankingId' };
    }

    const { data: challenge } = await db.collection('challenges').doc(challengeId).get();
    if (!challenge) return { success: false, errMsg: '挑战不存在' };

    // ✅ FIX #13: 防止重复完成
    if (challenge.status === 'completed') {
      return {
        success: true,
        similarity: challenge.similarity || 0,
        common: challenge.common || 0
      };
    }

    const { data: inviterRanking } = await db.collection('rankings').doc(challenge.inviterRankingId).get();
    const { data: inviteeRanking } = await db.collection('rankings').doc(inviteeRankingId).get();

    if (!inviterRanking || !inviteeRanking) {
      return { success: false, errMsg: '排名数据不存在' };
    }

    const getTop10Ids = (ranking) => {
      const played = ranking.items.filter(i => i.matches > 0);
      let sorted;
      if (ranking.mode === 'elo') {
        sorted = played.sort((a, b) => b.score - a.score || b.wins - a.wins || a.matches - b.matches);
      } else {
        sorted = played.sort((a, b) => {
          const rateA = a.matches > 0 ? a.wins / a.matches : 0;
          const rateB = b.matches > 0 ? b.wins / b.matches : 0;
          return rateB - rateA || b.wins - a.wins || a.index - b.index;
        });
      }
      return sorted.slice(0, 10).map(i => i._id || i.id || i.title || i.name);
    };

    const inviterTop10 = getTop10Ids(inviterRanking);
    const inviteeTop10 = getTop10Ids(inviteeRanking);

    let common = 0;
    let weightedScore = 0;
    inviterTop10.forEach((idA, idxA) => {
      const idxB = inviteeTop10.indexOf(idA);
      if (idxB !== -1) {
        common++;
        const rankDiff = Math.abs(idxA - idxB);
        weightedScore += Math.max(0, 1 - rankDiff / 9);
      }
    });

    const simpleSim = (common / 10) * 100;
    const weightedSim = (weightedScore / 10) * 100;
    const similarity = Math.round(simpleSim * 0.6 + weightedSim * 0.4);

    await db.collection('challenges').doc(challengeId).update({
      data: {
        status: 'completed',
        inviteeOpenId: OPENID,
        inviteeRankingId,
        similarity,
        common,
        inviterTop10,
        inviteeTop10,
        completeTime: db.serverDate()
      }
    });

    return { success: true, similarity, common };
  } catch (err) {
    return { success: false, errMsg: err.message || '完成挑战失败' };
  }
};
