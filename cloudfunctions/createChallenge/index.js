// cloudfunctions/createChallenge/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  try {
    const { inviterRankingId, title, type, mode, items, inviterTop10 } = event;
    const { OPENID } = cloud.getWXContext();
    const db = cloud.database();

    // ✅ FIX #13: 参数校验
    if (!inviterRankingId) {
      return { success: false, errMsg: '缺少 inviterRankingId' };
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { success: false, errMsg: 'items 不能为空' };
    }

    const challenge = {
      inviterOpenId: OPENID,
      inviterRankingId,
      title: title || '未命名榜单',
      type: type || 'movie',
      mode: mode || 'elo',
      items,
      inviterTop10: inviterTop10 || [],
      status: 'waiting',
      createTime: db.serverDate()
    };

    const { _id } = await db.collection('challenges').add({ data: challenge });
    return { success: true, challengeId: _id };
  } catch (err) {
    return { success: false, errMsg: err.message || '创建挑战失败' };
  }
};
