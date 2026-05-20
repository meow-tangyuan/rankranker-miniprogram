Page({
  data: {
    challengeId: '',
    title: '',
    similarity: 0,
    inviterList: [],
    inviteeList: [],
    commonList: [],
    verdict: '',
    // ✅ FIX #11: 新增对齐后的对比列表
    compareList: [],
    showWaiting: false
  },

  async onLoad(options) {
    const { challengeId } = options;
    if (!challengeId) {
      wx.showToast({ title: '无效挑战', icon: 'none' });
      return wx.navigateBack();
    }
    this.setData({ challengeId });
    await this.loadData();
  },

  async loadData() {
    wx.showLoading({ title: '加载中...' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getChallengeResult',
        data: { challengeId: this.data.challengeId }
      });

      // ✅ FIX #4: 处理未完成状态
      if (!result || !result.success) {
        if (result && result.status === 'waiting') {
          wx.hideLoading();
          this.setData({ showWaiting: true });
          return;
        }
        throw new Error(result?.errMsg || '加载失败');
      }

      const { title, similarity, inviterList, inviteeList, commonList } = result;

      // ✅ FIX #11: 在 JS 端对齐长度，生成 compareList
      const maxLen = Math.max(inviterList.length, inviteeList.length);
      const compareList = [];
      for (let i = 0; i < maxLen; i++) {
        compareList.push({
          rank: i + 1,
          inviter: inviterList[i] || null,
          invitee: inviteeList[i] || null
        });
      }

      this.setData({
        title,
        similarity,
        inviterList,
        inviteeList,
        commonList,
        compareList,
        verdict: this.getVerdict(similarity),
        showWaiting: false
      });
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      wx.showModal({ title: '加载失败', content: err.message, showCancel: false });
    }
  },

  getVerdict(s) {
    if (s >= 90) return '灵魂伴侣 💞';
    if (s >= 70) return '品味高度重合 🔥';
    if (s >= 50) return '求同存异 🤝';
    if (s >= 30) return '审美各异 🌈';
    return '平行宇宙 🪐';
  },

  onShareAppMessage() {
    const { title, similarity, challengeId } = this.data;
    return {
      title: `我们的"${title}"品味相似度 ${similarity}%，你也来测测？`,
      path: `/pages/compare/compare?challengeId=${challengeId}`
    };
  },

  goHome() {
    wx.reLaunch({ url: '/pages/home/home' });
  }
});
