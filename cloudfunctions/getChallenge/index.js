// cloudfunctions/getChallenge/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { challengeId } = event;
  const db = cloud.database();

  try {
    const { data } = await db.collection('challenges').doc(challengeId).get();
    if (!data) return { success: false, errMsg: '挑战不存在' };

    return {
      success: true,
      items: data.items,
      title: data.title,
      mode: data.mode,
      type: data.type
    };
  } catch (err) {
    return { success: false, errMsg: err.message || '查询失败' };
  }
};
