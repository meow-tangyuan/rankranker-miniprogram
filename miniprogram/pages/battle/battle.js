Page({
  data: {
    rankingId: '',
    items: [],
    currentRound: 0,
    totalRounds: 0,
    leftItem: {},
    rightItem: {},
    leftIndex: -1,
    rightIndex: -1,
    mode: 'elo',
    isSubmitting: false,
    title: '',
    type: '',
    challengeId: ''
  },

  async onLoad(options) {
    const { rankingId, challengeId } = options;

    if (challengeId) {
      await this.startChallenge(challengeId);
      return;
    }

    if (!rankingId) {
      wx.showToast({ title: '无效参数', icon: 'none' });
      return wx.navigateBack();
    }

    this.setData({ rankingId });
    await this.loadBattle(rankingId);
  },

  async loadBattle(rankingId) {
    wx.showLoading({ title: '加载中...' });
    try {
      const db = wx.cloud.database();
      const { data: ranking } = await db.collection('rankings').doc(rankingId).get();

      if (!ranking) throw new Error('记录不存在');
      if (ranking.status === 'completed') {
        wx.redirectTo({ url: `/pages/result/result?rankingId=${rankingId}` });
        return;
      }

      const { items, currentRound, totalRounds, mode, nextPair, title, type } = ranking;

      if (!nextPair || nextPair.length !== 2) {
        throw new Error('数据异常，无法加载对战');
      }

      this.setData({
        items,
        currentRound: currentRound || 0,
        totalRounds,
        mode,
        title,
        type,
        leftIndex: nextPair[0],
        rightIndex: nextPair[1],
        leftItem: items[nextPair[0]],
        rightItem: items[nextPair[1]]
      });

      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      wx.showModal({
        title: '加载失败',
        content: err.message,
        showCancel: false,
        success: () => wx.navigateBack()
      });
    }
  },

  async startChallenge(challengeId) {
    wx.showLoading({ title: '加载挑战...' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getChallenge',
        data: { challengeId }
      });
      if (!result || !result.success) throw new Error(result?.errMsg || '挑战加载失败');

      const { items, title, type } = result;
      const initializedItems = items.map((item, index) => ({
        ...item,
        index,
        score: 1500,
        wins: 0,
        losses: 0,
        matches: 0
      }));

      const { result: createRes } = await wx.cloud.callFunction({
        name: 'createRanking',
        data: {
          selectedItems: initializedItems,
          title,
          type
        }
      });

      if (!createRes || createRes.code !== 200) throw new Error('创建对战失败');

      const rankingId = createRes.data.rankingId;
      this.setData({ rankingId, challengeId });
      wx.hideLoading();
      await this.loadBattle(rankingId);
    } catch (err) {
      wx.hideLoading();
      wx.showModal({
        title: '错误',
        content: err.message,
        showCancel: false,
        success: () => wx.navigateBack()
      });
    }
  },

  onVote(e) {
    const { side } = e.currentTarget.dataset;
    if (this.data.isSubmitting) return;

    if (side === 'left') {
      this.submitVote(this.data.leftIndex, this.data.rightIndex, false);
    } else if (side === 'right') {
      this.submitVote(this.data.rightIndex, this.data.leftIndex, false);
    } else if (side === 'draw') {
      this.submitVote(this.data.leftIndex, this.data.rightIndex, true);
    }
  },

  async submitVote(winnerIdx, loserIdx, isDraw) {
    this.setData({ isSubmitting: true });

    try {
      const { rankingId } = this.data;
      const { result } = await wx.cloud.callFunction({
        name: 'updateRanking',
        data: {
          rankingId,
          action: 'vote',
          payload: { winnerIdx, loserIdx, isDraw }
        }
      });

      if (!result || result.code !== 200) {
        throw new Error(result?.message || '提交失败');
      }

      if (result.data.isCompleted || result.data.status === 'completed') {
        await this.finishBattle();
        return;
      }

      const { items, currentRound, nextPair } = result.data;
      this.setData({
        items,
        currentRound,
        leftIndex: nextPair[0],
        rightIndex: nextPair[1],
        leftItem: items[nextPair[0]],
        rightItem: items[nextPair[1]],
        isSubmitting: false
      });
    } catch (err) {
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      this.setData({ isSubmitting: false });
    }
  },

  async finishBattle() {
    const { rankingId, challengeId } = this.data;

    try {
      await wx.cloud.callFunction({
        name: 'updateRanking',
        data: { rankingId, action: 'finish', payload: {} }
      });
    } catch (e) {
      console.error('finish error', e);
    }

    if (challengeId) {
      wx.showLoading({ title: '计算相似度...' });
      try {
        const { result } = await wx.cloud.callFunction({
          name: 'completeChallenge',
          data: { challengeId, inviteeRankingId: rankingId }
        });
        wx.hideLoading();
        if (result && result.success) {
          wx.redirectTo({ url: `/pages/compare/compare?challengeId=${challengeId}` });
          return;
        }
      } catch (e) {
        wx.hideLoading();
      }
    }

    wx.redirectTo({ url: `/pages/result/result?rankingId=${rankingId}` });
  },

  onFinishEarly() {
    const { currentRound, totalRounds } = this.data;
    if (currentRound <= 0) {
      wx.showToast({ title: '至少完成一轮', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '提前结束',
      content: `当前进度 ${currentRound + 1}/${totalRounds}，确定结束对战？`,
      success: (res) => {
        if (res.confirm) this.finishBattle();
      }
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onImageError(e) {
    const { side } = e.currentTarget.dataset;
    const field = side === 'left' ? 'leftItem' : 'rightItem';
    const item = this.data[field];
    this.setData({
      [field]: { ...item, posterPath: '/images/default-poster.jpg', thumb: '/images/default-poster.jpg' }
    });
  }
});
