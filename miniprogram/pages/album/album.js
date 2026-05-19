Page({
  data: {
    album: null,
    songs: [],
    loading: true,
    selectedSongIds: [],
    selectedSongs: [],
    stackDisplay: [],
    stackAreaWidth: 80,
    showEditPanel: false
  },

  onLoad(options) {
    const { id } = options;
    if (!id) {
      wx.showToast({ title: '无效专辑ID', icon: 'none' });
      wx.navigateBack();
      return;
    }
    this.loadAlbumDetail(id);
  },

  async loadAlbumDetail(albumId) {
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'searchMusic',
        data: { albumId }
      });
      wx.hideLoading();

      if (res.result.code === 200) {
        let preSelectedIds = [];
        let preSelectedSongs = [];
        try {
          const pages = getCurrentPages();
          const musicPage = pages[pages.length - 2];
          if (musicPage && musicPage.data) {
            preSelectedIds = [...(musicPage.data.selectedTrackIds || [])];
            preSelectedSongs = [...(musicPage.data.selectedItems || [])]
              .filter(item => item.type === 'track')
              .map(item => ({
                id: item.id,
                name: item.name,
                thumb: item.thumb,
                artist: item.artist,
                album: item.album,
                displayName: item.displayName || item.name,
                sourceAlbum: item.sourceAlbum || 'unknown'
              }));
          }
        } catch (e) { console.error('获取上一页状态失败', e); }

        const songs = (res.result.data.songs || []).map(song => ({
          ...song,
          displayName: this.formatLongName(song.name),
          selected: preSelectedIds.includes(song.id)
        }));

        this.setData({
          album: res.result.data.album,
          songs,
          loading: false,
          selectedSongIds: preSelectedIds,
          selectedSongs: preSelectedSongs
        });

        this._updateBottomBar();
      } else {
        wx.showToast({ title: res.result.message || '加载失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  formatLongName(name) {
    if (!name || name.length <= 35) return name;
    return name.slice(0, 32) + '...';
  },

  onSongImageError(e) {
    const index = e.currentTarget.dataset.index;
    const songs = this.data.songs;
    songs[index].thumb = '/images/default-poster.jpg';
    this.setData({ songs });
  },

  onSelectSong(e) {
    const song = e.currentTarget.dataset.song;
    let { selectedSongIds, selectedSongs, songs } = this.data;

    const idx = selectedSongIds.indexOf(song.id);
    let newSelectedIds = [...selectedSongIds];
    let newSelectedSongs = [...selectedSongs];

    if (idx > -1) {
      newSelectedIds.splice(idx, 1);
      newSelectedSongs = newSelectedSongs.filter(s => s.id !== song.id);
    } else {
      newSelectedIds.push(song.id);
      newSelectedSongs.push({
        ...song,
        displayName: song.displayName || this.formatLongName(song.name),
        sourceAlbum: this.data.album?.id || this.data.album?.name || 'unknown'
      });
    }

    const updatedSongs = songs.map(s => ({
      ...s,
      selected: newSelectedIds.includes(s.id)
    }));

    this.setData({
      songs: updatedSongs,
      selectedSongIds: newSelectedIds,
      selectedSongs: newSelectedSongs
    });

    this._updateBottomBar();
    this._syncToMusicPage(newSelectedSongs);
  },

  _updateBottomBar() {
    const { selectedSongs } = this.data;
    const visibleCount = Math.min(selectedSongs.length, 3);
    const visibleItems = selectedSongs.slice(-3);

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
    const { id } = e.currentTarget.dataset;
    this._syncRemove(id);
  },

  clearSelected() {
    const { songs } = this.data;
    this.setData({
      songs: songs.map(s => ({ ...s, selected: false })),
      selectedSongIds: [],
      selectedSongs: [],
      stackDisplay: [],
      stackAreaWidth: 80,
      showEditPanel: false
    });
    this._syncToMusicPage([]);
  },

  _syncRemove(id) {
    let { selectedSongIds, selectedSongs, songs } = this.data;
    const newSelectedIds = selectedSongIds.filter(sid => sid !== id);
    const newSelectedSongs = selectedSongs.filter(s => s.id !== id);
    const updatedSongs = songs.map(s => ({
      ...s,
      selected: newSelectedIds.includes(s.id)
    }));

    this.setData({
      songs: updatedSongs,
      selectedSongIds: newSelectedIds,
      selectedSongs: newSelectedSongs
    });

    this._updateBottomBar();
    this._syncToMusicPage(newSelectedSongs);
  },

  toggleSelectAll() {
    const { songs, selectedSongIds, selectedSongs } = this.data;
    if (songs.length === 0) return;

    const currentIds = songs.map(s => s.id);
    const isAllSelected = currentIds.every(id => selectedSongIds.includes(id));

    let newSelectedIds, newSelectedSongs, updatedSongs;

    if (isAllSelected) {
      newSelectedIds = selectedSongIds.filter(id => !currentIds.includes(id));
      newSelectedSongs = selectedSongs.filter(s => !currentIds.includes(s.id));
      updatedSongs = songs.map(s => ({ ...s, selected: false }));
    } else {
      const songsToAdd = songs.filter(s => !selectedSongIds.includes(s.id));
      
      newSelectedIds = [...selectedSongIds, ...songsToAdd.map(s => s.id)];
      newSelectedSongs = [
        ...selectedSongs,
        ...songsToAdd.map(s => ({
          ...s,
          displayName: s.displayName || this.formatLongName(s.name),
          sourceAlbum: this.data.album?.id || this.data.album?.name || 'unknown'
        }))
      ];
      updatedSongs = songs.map(s => ({ ...s, selected: true }));
    }

    this.setData({
      songs: updatedSongs,
      selectedSongIds: newSelectedIds,
      selectedSongs: newSelectedSongs
    });

    this._updateBottomBar();
    this._syncToMusicPage(newSelectedSongs);
  },

  async startRanking() {
    const { selectedSongs } = this.data;
    if (selectedSongs.length < 2) {
      wx.showToast({ title: '至少选择2个对象', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '创建对战中...' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createRanking',
        data: {
          selectedItems: selectedSongs.map(item => ({
            id: item.id,
            name: item.name,
            thumb: item.thumb,
            artist: item.artist,
            album: item.album || this.data.album?.name || '',
            title: item.name,
            posterPath: item.thumb,
            year: item.album || this.data.album?.name || ''
          })),
          type: 'music'
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
      wx.showToast({ title: err.message || '创建失败，请重试', icon: 'none' });
    }
  },

  onUnload() {
    this._syncToMusicPage(this.data.selectedSongs);
  },

  _syncToMusicPage(selectedSongs) {
    const pages = getCurrentPages();
    if (pages.length < 2) return;
    const musicPage = pages[pages.length - 2];
    if (musicPage && musicPage.route && musicPage.route.includes('music')) {
      const songsToSync = (selectedSongs || [])
        .filter(s => s && s.id)
        .map(s => ({
          id: s.id,
          name: s.name,
          thumb: s.thumb,
          artist: s.artist,
          album: s.album || this.data.album?.name || '',
          displayName: s.displayName || this.formatLongName(s.name),
          sourceAlbum: s.sourceAlbum || this.data.album?.id || this.data.album?.name || 'unknown'
        }));
      if (musicPage._syncAlbumSelection) {
        musicPage._syncAlbumSelection(songsToSync);
      }
    }
  },

  preventTouchMove() {}
});
