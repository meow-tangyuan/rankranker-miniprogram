Page({
  data: {
    keyword: '',
    mode: 'auto', // 'auto' | 'track' | 'album'
    tracks: [],
    albums: [],
    selectedItems: [],
    selectedTrackIds: [],
    selectedAlbumIds: [],
    stackDisplay: [],
    stackAreaWidth: 80,
    showEditPanel: false,
    placeholderText: '搜索歌曲、专辑或歌手'
  },

  onLoad(options) {
    const { type } = options;
    if (type === 'album') {
      this.setData({ mode: 'album', placeholderText: '搜索专辑或歌手' });
    } else {
      this.setData({ mode: 'auto', placeholderText: '搜索歌曲、专辑或歌手' });
    }
  },

  // ========== 【新增】从其他页面返回时刷新底部栏 ==========
  onShow() {
    this._updateBottomBar();
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  async searchMusic() {
    const { keyword, mode } = this.data;
    if (!keyword.trim()) {
      wx.showToast({ title: '请输入关键词', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '搜索中...' });
    try {
      const res = await this._callWithRetry({
        name: 'searchMusic',
        data: { query: keyword.trim(), mode }
      }, 2);

      wx.hideLoading();
      if (res.code === 200) {
        const { tracks = [], albums = [], mode: resMode } = res.data;
        // 恢复选中态：用持久化的 ID 池给新结果打标
        const { selectedTrackIds, selectedAlbumIds } = this.data;
        const markedTracks = tracks.map(t => ({
          ...t,
          selected: selectedTrackIds.includes(t.id),
          type: 'track'
        }));
        const markedAlbums = albums.map(a => ({
          ...a,
          selected: selectedAlbumIds.includes(a.id),
          type: 'album'
        }));
        this.setData({
          tracks: markedTracks,
          albums: markedAlbums,
          mode: resMode
        });
        // ========== 【关键新增】搜索后必须刷新底部栏 ==========
        this._updateBottomBar();
      } else {
        wx.showToast({ title: res.message || '搜索失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('搜索最终失败:', err);
      wx.showToast({ title: '搜索失败，请重试', icon: 'none' });
    }
  },

  _callWithRetry(cloudData, maxRetries) {
    return new Promise((resolve, reject) => {
      const attempt = (retriesLeft) => {
        wx.cloud.callFunction(cloudData).then(res => {
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
    const { index, type } = e.currentTarget.dataset;
    if (type === 'track') {
      const tracks = this.data.tracks;
      tracks[index].thumb = '/images/default-poster.jpg';
      this.setData({ tracks });
    } else if (type === 'album') {
      const albums = this.data.albums;
      albums[index].thumb = '/images/default-poster.jpg';
      this.setData({ albums });
    }
  },

  goToAlbumDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/album/album?id=${id}` });
  },

  onToggleTrack(e) {
    const { index } = e.currentTarget.dataset;
    const track = this.data.tracks[index];
    this.toggleItem(track, 'track');
  },

  onToggleAlbum(e) {
    const { index } = e.currentTarget.dataset;
    const album = this.data.albums[index];
    this.toggleItem(album, 'album');
  },

  toggleItem(item, type) {
    let { selectedItems, selectedTrackIds, selectedAlbumIds } = this.data;
    const isTrack = type === 'track';
    const idList = isTrack ? selectedTrackIds : selectedAlbumIds;
    const idx = idList.indexOf(item.id);

    let newSelectedItems = [...selectedItems];
    let newTrackIds = [...selectedTrackIds];
    let newAlbumIds = [...selectedAlbumIds];

    if (idx > -1) {
      newSelectedItems = newSelectedItems.filter(s => !(s.id === item.id && s.type === type));
      if (isTrack) newTrackIds.splice(idx, 1);
      else newAlbumIds.splice(idx, 1);
    } else {
      newSelectedItems.push({ ...item, type });
      if (isTrack) newTrackIds.push(item.id);
      else newAlbumIds.push(item.id);
    }

    const tracks = this.data.tracks.map(t => ({
      ...t,
      selected: newTrackIds.includes(t.id)
    }));
    const albums = this.data.albums.map(a => ({
      ...a,
      selected: newAlbumIds.includes(a.id)
    }));

    this.setData({
      tracks,
      albums,
      selectedItems: newSelectedItems,
      selectedTrackIds: newTrackIds,
      selectedAlbumIds: newAlbumIds
    });
    this._updateBottomBar();
  },

  _updateBottomBar() {
    const { selectedItems } = this.data;
    const visibleCount = Math.min(selectedItems.length, 3);
    const visibleItems = selectedItems.slice(-3);
    const stackDisplay = visibleItems.map((item, idx) => ({
      ...item,
      stackLeft: idx * 28,
      stackZIndex: idx + 1
    }));
    const stackAreaWidth = visibleCount * 28 + 52;
    this.setData({ stackDisplay, stackAreaWidth });
  },

  openEditPanel() {
    this.setData({ showEditPanel: true });
  },

  closeEditPanel() {
    this.setData({ showEditPanel: false });
  },

  removeSelected(e) {
    const { id, type } = e.currentTarget.dataset;
    const item = this.data.selectedItems.find(s => s.id === id && s.type === type);
    if (item) this.toggleItem(item, type);
  },

  clearSelected() {
    const { tracks, albums } = this.data;
    this.setData({
      tracks: tracks.map(t => ({ ...t, selected: false })),
      albums: albums.map(a => ({ ...a, selected: false })),
      selectedItems: [],
      selectedTrackIds: [],
      selectedAlbumIds: [],
      stackDisplay: [],
      stackAreaWidth: 80,
      showEditPanel: false
    });
  },

  // ========== 【核心新增】album 页返回时同步选中歌曲 ==========
  _syncAlbumSelection(albumSelectedSongs) {
    const { selectedItems, selectedTrackIds, tracks } = this.data;
    
    // 获取当前 album 的标识
    const sourceAlbum = (albumSelectedSongs[0] && albumSelectedSongs[0].sourceAlbum) || 'unknown';
    
    // 1. 移除所有来自该 album 的 track
    let newSelectedItems = selectedItems.filter(s => {
      if (s.type !== 'track') return true;
      return s.sourceAlbum !== sourceAlbum;
    });

    // 2. 从 track ID 池中移除对应 id
    const removedIds = selectedItems
      .filter(s => s.type === 'track' && s.sourceAlbum === sourceAlbum)
      .map(s => s.id);
    let newTrackIds = selectedTrackIds.filter(id => !removedIds.includes(id));

    // 3. 把 album 页当前选中的歌曲加回
    if (albumSelectedSongs && albumSelectedSongs.length > 0) {
      const songsWithType = albumSelectedSongs.map(s => ({ ...s, type: 'track' }));
      newSelectedItems = [...newSelectedItems, ...songsWithType];
      newTrackIds = [...newTrackIds, ...albumSelectedSongs.map(s => s.id)];
    }

    // 4. 同步更新 tracks 列表
    const newTracks = tracks.map(t => ({
      ...t,
      selected: newTrackIds.includes(t.id)
    }));

    this.setData({
      tracks: newTracks,
      selectedItems: newSelectedItems,
      selectedTrackIds: newTrackIds
    });
    this._updateBottomBar();
  },

  async startRanking() {
    const { selectedItems } = this.data;
    if (selectedItems.length < 2) {
      wx.showToast({ title: '至少选择2个对象', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '创建对战中...' });
    try {
      const result = await this._callWithRetry({
        name: 'createRanking',
        data: {
          selectedItems: selectedItems.map(item => ({
            id: item.id,
            name: item.name,
            thumb: item.thumb,
            artist: item.artist,
            album: item.album,
            title: item.name,
            posterPath: item.thumb,
            year: item.album || ''
          })),
          type: 'music'
        }
      }, 2);

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
      console.error('创建对战最终失败:', err);
      wx.showToast({ title: err.message || '创建失败，请重试', icon: 'none' });
    }
  },

  preventTouchMove() {}
});
