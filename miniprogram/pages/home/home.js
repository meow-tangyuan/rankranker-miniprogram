// miniprogram/pages/home/home.js
Page({
  data: {},

  onLoad() {},

  // 跳转到电影搜索页
  goToMovies() {
    wx.navigateTo({
      url: '/pages/movie/movie'  // 原来是 '/pages/index/movie'，改成这个
    });
  },

  // 点击音乐卡片，弹出选择
  goToMusic() {
    wx.showActionSheet({
      itemList: ['专辑 Ranking', '歌曲 Ranking'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({
            url: '/pages/music/music?type=album'
          });
        } else if (res.tapIndex === 1) {
          wx.navigateTo({
            url: '/pages/music/music?type=track'
          });
        }
      }
    });
  },

  //跳转历史记录
  goToHistory() {
    wx.navigateTo({ url: '/pages/history/history' });
  }
  
});
