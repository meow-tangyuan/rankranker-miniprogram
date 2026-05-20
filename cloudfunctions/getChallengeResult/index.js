// cloudfunctions/getChallengeResult/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { challengeId } = event;
  const db = cloud.database();

  try {
    const { data: challenge } = await db.collection('challenges').doc(challengeId).get();
    if (!challenge) return { success: false, errMsg: '挑战不存在' };

    // ✅ FIX #4: 未完成时友好返回，避免读 inviteeRankingId 报错
    if (challenge.status !== 'completed') {
      return {
        success: false,
        errMsg: '挑战尚未完成，请等待好友完成后再来查看结果',
        status: challenge.status
      };
    }

    // ✅ FIX #4: 防御 inviteeRankingId 不存在
    if (!challenge.inviteeRankingId) {
      return { success: false, errMsg: '挑战数据不完整，缺少挑战者排名' };
    }

    const { data: inviterRanking } = await db.collection('rankings').doc(challenge.inviterRankingId).get();
    const { data: inviteeRanking } = await db.collection('rankings').doc(challenge.inviteeRankingId).get();

    if (!inviterRanking || !inviteeRanking) {
      return { success: false, errMsg: '排名数据不存在' };
    }

    // ✅ FIX #3: enrich 保留排序所需字段
    const enrich = (item) => ({
      id: item._id || item.id || item.title || item.name,
      title: item.title || item.name || '未知',
      cover: item.posterPath || item.thumb || '/images/default-poster.jpg',
      score: item.score || 0,
      wins: item.wins || 0,
      matches: item.matches || 0,
      index: item.index
    });

    const getTop10 = (ranking) => {
      const played = ranking.items.filter(i => i.matches > 0).map(enrich);
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
      return sorted.slice(0, 10);
    };

    const inviterList = getTop10(inviterRanking);
    const inviteeList = getTop10(inviteeRanking);

    const inviterIds = inviterList.map(i => i.id);
    const inviteeIds = inviteeList.map(i => i.id);

    inviterList.forEach(item => { item.isCommon = inviteeIds.includes(item.id); });
    inviteeList.forEach(item => { item.isCommon = inviterIds.includes(item.id); });

    const commonList = inviterList.filter(i => i.isCommon);

    return {
      success: true,
      title: challenge.title,
      similarity: challenge.similarity || 0,
      inviterList,
      inviteeList,
      commonList
    };
  } catch (err) {
    return { success: false, errMsg: err.message || '获取挑战结果失败' };
  }
};
