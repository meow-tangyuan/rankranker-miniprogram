const axios = require('axios');

const API_BASE = 'https://cloud1-d0grco1tx90404eb0-1433137864.ap-shanghai.app.tcloudbase.com/neteaseApi';

// 带重试的请求封装
async function neteaseRequest(config, retries = 2) {
  try {
    return await axios.request(config);
  } catch (err) {
    if (retries > 0 && (
      err.code === 'ECONNABORTED' ||
      err.code === 'ETIMEDOUT' ||
      err.code === 'ENOTFOUND' ||
      err.response?.status >= 500
    )) {
      console.warn(`网易云请求失败，1秒后重试... 剩余次数: ${retries}`);
      await new Promise(r => setTimeout(r, 1000));
      return neteaseRequest(config, retries - 1);
    }
    throw err;
  }
}

// ========== 搜索单曲 ==========
async function searchTracks(keyword) {
  const res = await neteaseRequest({
    method: 'GET',
    url: `${API_BASE}/search`,
    params: { keywords: keyword, type: 1, limit: 20, offset: 0 },
    timeout: 10000
  });

  const data = res.data;
  if (data.code !== 200 || !data.result) return [];
  const rawResults = data.result.songs || [];
  if (rawResults.length === 0) return [];

  // 批量获取封面
  let picMap = {};
  const ids = rawResults.map(s => s.id).join(',');
  try {
    const detailRes = await neteaseRequest({
      method: 'GET',
      url: `${API_BASE}/song/detail`,
      params: { ids },
      timeout: 8000
    });
    if (detailRes.data?.code === 200 && detailRes.data?.songs?.length > 0) {
      detailRes.data.songs.forEach(song => {
        const url = song.al?.picUrl || song.album?.picUrl;
        if (url) picMap[song.id] = url;
      });
    }
  } catch (detailErr) {
    console.error('song/detail 请求失败:', detailErr.message);
  }

  return rawResults.map(item => {
    const artistNames = item.artists?.map(a => a.name).join(' / ') 
      || item.ar?.map(a => a.name).join(' / ') 
      || '未知歌手';
    const picUrl = picMap[item.id] || item.album?.picUrl || item.al?.picUrl;
    return {
      id: item.id,
      name: item.name,
      thumb: (picUrl || '/images/default-poster.jpg').replace(/^http:\/\//, 'https://'),
      artist: artistNames,
      album: item.album?.name || item.al?.name || '未知专辑'
    };
  });
}

// ========== 搜索专辑 ==========
async function searchAlbums(keyword) {
  const res = await neteaseRequest({
    method: 'GET',
    url: `${API_BASE}/search`,
    params: { keywords: keyword, type: 10, limit: 20, offset: 0 },
    timeout: 10000
  });

  const data = res.data;
  if (data.code !== 200 || !data.result) return [];
  const rawAlbums = data.result.albums || [];

  return rawAlbums.map(item => ({
    id: item.id,
    name: item.name,
    thumb: (item.picUrl || '/images/default-poster.jpg').replace(/^http:\/\//, 'https://'),
    artist: item.artist?.name || '未知歌手',
    artistId: item.artist?.id,
    publishTime: item.publishTime
  }));
}

// ========== 获取专辑详情（含歌曲列表） ==========
async function getAlbumDetail(albumId) {
  const res = await neteaseRequest({
    method: 'GET',
    url: `${API_BASE}/album`,
    params: { id: albumId },
    timeout: 10000
  });

  const data = res.data;
  if (data.code !== 200) throw new Error('获取专辑详情失败');

  const album = data.album;
  const songs = (data.songs || []).map(song => {
    const artistNames = song.ar?.map(a => a.name).join(' / ') 
      || song.artists?.map(a => a.name).join(' / ') 
      || '未知歌手';
    return {
      id: song.id,
      name: song.name,
      thumb: (song.al?.picUrl || album.picUrl || '/images/default-poster.jpg').replace(/^http:\/\//, 'https://'),
      artist: artistNames,
      album: song.al?.name || album.name,
      duration: song.dt // 毫秒，前端可格式化为 mm:ss
    };
  });

  return {
    album: {
      id: album.id,
      name: album.name,
      thumb: (album.picUrl || '/images/default-poster.jpg').replace(/^http:\/\//, 'https://'),
      artist: album.artist?.name || '未知歌手',
      description: album.description || '',
      publishTime: album.publishTime
    },
    songs
  };
}

// ========== 云函数入口 ==========
exports.main = async (event, context) => {
  const { query, type = 'track', mode, albumId } = event;

  // 1. 专辑详情查询（通过 albumId 触发）
  if (albumId) {
    try {
      const detail = await getAlbumDetail(albumId);
      return { code: 200, data: detail, message: '获取成功' };
    } catch (err) {
      console.error('专辑详情失败:', err.message);
      return { code: 500, message: err.message || '获取专辑详情失败' };
    }
  }

  // 2. 搜索
  if (!query || !query.trim()) {
    return { code: 200, data: { tracks: [], albums: [] }, message: '关键词为空' };
  }

  const keyword = query.trim();
  // 兼容旧代码：如果没传 mode，按 type 推导；歌曲 ranking(type=track) 默认升级为 auto
  const searchMode = mode || (type === 'track' ? 'auto' : type);

  try {
    const promises = [];
    if (searchMode === 'auto' || searchMode === 'track') {
      promises.push(searchTracks(keyword));
    } else {
      promises.push(Promise.resolve([]));
    }

    if (searchMode === 'auto' || searchMode === 'album') {
      promises.push(searchAlbums(keyword));
    } else {
      promises.push(Promise.resolve([]));
    }

    const [tracks, albums] = await Promise.all(promises);

    return {
      code: 200,
      data: { tracks, albums, mode: searchMode },
      message: '搜索成功'
    };
  } catch (error) {
    console.error('搜索主流程失败:', error.message);
    return { code: 500, message: error.message || '请求失败' };
  }
};