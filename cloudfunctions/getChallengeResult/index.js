// cloudfunctions/getChallengeResult/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { challengeId } = event;
  const db = cloud.database();

  const { data: challenge } = await db.collection('challenges').doc(challengeId).get();
  if (!challenge) return { success: false, errMsg: '挑战不存在' };

  const { data: inviterRanking } = await db.collection('rankings').doc(challenge.inviterRankingId).get();
  const { data: inviteeRanking } = await db.collection('rankings').doc(challenge.inviteeRankingId).get();

  const enrich = (item) => ({
    id: item._id || item.id || item.title || item.name,
    title: item.title || item.name || '未知',
    cover: item.posterPath || item.thumb || '/images/default-poster.jpg'
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
};
