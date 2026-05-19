// miniprogram/pages/movie/movie.js

Page({
  data: {
    movies: [],
    keyword: '',
    selectedIds: [],
    selectedMovies: [],
    stackDisplay: [],
    stackAreaWidth: 80,
    showEditPanel: false
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  async searchMovies() {
    const { keyword, selectedIds } = this.data;

    if (!keyword.trim()) {
      wx.showToast({ title: '请输入电影名或影人名', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '搜索中...' });

    try {
      const res = await this._callSearchWithRetry(keyword, 2);
      console.log('云函数返回:', res);

      if (res.code === 200) {
        wx.hideLoading();
        const movies = (res.data.movies || []).map(m => {
          const sIdx = selectedIds.indexOf(m.id);
          return {
            ...m,
            selected: sIdx > -1,
            selectedIndex: sIdx > -1 ? sIdx + 1 : 0
          };
        });
        this.setData({ movies });
        wx.showToast({ title: `找到${res.data.movies.length}部` });
      } else {
        wx.hideLoading();
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('调用失败:', err);
      wx.showToast({ title: '搜索失败，请重试', icon: 'none' });
    }
  },

  _callSearchWithRetry(keyword, maxRetries) {
    return new Promise((resolve, reject) => {
      const attempt = (retriesLeft) => {
        wx.cloud.callFunction({
          name: 'searchMovies',
          data: { query: keyword.trim() }
        }).then(res => {
          resolve(res.result);
        }).catch(err => {
          console.error(`调用失败，剩余重试次数: ${retriesLeft}`, err);
          if (retriesLeft > 0) {
            wx.showLoading({ title: '网络较慢，重试中...' });
            setTimeout(() => attempt(retriesLeft - 1), 800);
          } else {
            reject(err);
          }
        });
      };
      attempt(maxRetries);
    });
  },

  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    const movies = this.data.movies;
    movies[index].posterPath = '/images/default-poster.jpg';
    this.setData({ movies });
  },

  // ========== 选中态核心逻辑 ==========
  onToggleMovie(e) {
    const { id } = e.currentTarget.dataset;
    let { selectedIds, selectedMovies, movies } = this.data;

    const idx = selectedIds.indexOf(id);
    let newSelectedIds = [...selectedIds];
    let newSelectedMovies = [...selectedMovies];

    if (idx > -1) {
      newSelectedIds.splice(idx, 1);
      newSelectedMovies.splice(idx, 1);
    } else {
      const movie = movies.find(m => m.id === id);
      if (movie) {
        newSelectedIds.push(id);
        newSelectedMovies.push(movie);
      }
    }

    const updatedMovies = movies.map(m => {
      const sIdx = newSelectedIds.indexOf(m.id);
      return {
        ...m,
        selected: sIdx > -1,
        selectedIndex: sIdx > -1 ? sIdx + 1 : 0
      };
    });

    this._updateSelectionState(updatedMovies, newSelectedIds, newSelectedMovies);
  },

  _updateSelectionState(movies, selectedIds, selectedMovies) {
    const visibleCount = Math.min(selectedMovies.length, 3);
    const visibleItems = selectedMovies.slice(-3);
const stackDisplay = visibleItems.map((item, idx) => ({
  ...item,
  stackLeft: idx * 28,
  stackZIndex: idx + 1
}));

    const stackAreaWidth = visibleCount * 28 + 52;

    this.setData({
      movies,
      selectedIds,
      selectedMovies,
      stackDisplay,
      stackAreaWidth
    });
  },

  // ========== 底部栏 & 编辑面板 ==========
  openEditPanel() {
    this.setData({ showEditPanel: true });
  },

  closeEditPanel() {
    this.setData({ showEditPanel: false });
  },

  removeSelected(e) {
    const { id } = e.currentTarget.dataset;
    this._syncRemove(id);
  },

  clearSelected() {
    const { movies } = this.data;
    const cleared = movies.map(m => ({ ...m, selected: false, selectedIndex: 0 }));
    this.setData({
      movies: cleared,
      selectedIds: [],
      selectedMovies: [],
      stackDisplay: [],
      stackAreaWidth: 80,
      showEditPanel: false
    });
  },

  _syncRemove(id) {
    let { selectedIds, selectedMovies, movies } = this.data;
    const newSelectedIds = selectedIds.filter(sid => sid !== id);
    const newSelectedMovies = selectedMovies.filter(m => m.id !== id);

    const updatedMovies = movies.map(m => {
      const sIdx = newSelectedIds.indexOf(m.id);
      return {
        ...m,
        selected: sIdx > -1,
        selectedIndex: sIdx > -1 ? sIdx + 1 : 0
      };
    });

    this._updateSelectionState(updatedMovies, newSelectedIds, newSelectedMovies);
  },

  async startRanking() {
    const { selectedMovies } = this.data;
    if (selectedMovies.length < 2) {
      wx.showToast({ title: '至少选择2部电影', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '创建对战中...' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createRanking',
        data: {
          selectedItems: selectedMovies,
          type: 'movie'
        }
      });
      wx.hideLoading();
      if (result.code === 200) {
        wx.navigateTo({
          url: `/pages/battle/battle?rankingId=${result.data.rankingId}`
        });
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '创建失败', icon: 'none' });
    }
  },
  

  preventTouchMove() {}
});
