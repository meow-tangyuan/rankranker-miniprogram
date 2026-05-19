// cloudfunctions/createChallenge/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { inviterRankingId, title, type, mode, items, inviterTop10 } = event;
  const { OPENID } = cloud.getWXContext();
  const db = cloud.database();

  const challenge = {
    inviterOpenId: OPENID,
    inviterRankingId,
    title,
    type,
    mode,
    items,
    inviterTop10,
    status: 'waiting',
    createTime: db.serverDate()
  };

  const { _id } = await db.collection('challenges').add({ data: challenge });
  return { success: true, challengeId: _id };
};
