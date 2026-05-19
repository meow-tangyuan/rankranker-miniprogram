Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    this.loadHistory();
  },

  async loadHistory() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const { data } = await db.collection('rankings')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const list = data.map(item => {
        const progress = item.totalRounds > 0
          ? `${item.currentRound}/${item.totalRounds}`
          : '0/0';
        return {
          ...item,
          progressText: item.status === 'completed' ? '已完成' : `第 ${progress} 轮`,
          dateText: this.formatDate(item.createdAt)
        };
      });

      this.setData({ list, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  onItemTap(e) {
    const { item } = e.currentTarget.dataset;
    if (item.status === 'completed') {
      wx.navigateTo({ url: `/pages/result/result?rankingId=${item._id}` });
    } else {
      wx.navigateTo({ url: `/pages/battle/battle?rankingId=${item._id}` });
    }
  },

  goHome() {
    wx.reLaunch({ url: '/pages/home/home' });
  }
});
