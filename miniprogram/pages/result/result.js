Page({
  data: {
    rankingId: '',
    mode: '',
    title: '',
    type: '',
    top3: [],
    rankedList: [],
    unplayedList: [],
    showPosterModal: false,
    posterUrl: '',
    challengeId: '',
    isProcessing: false,
    challengeStatus: '',
    similarity: 0
  },

  async onLoad(options) {
    let { rankingId, challengeId, scene } = options;

    // ✅ FIX #1: 解析小程序码 scene 参数
    if (scene && !rankingId) {
      try {
        const decodedScene = decodeURIComponent(scene);
        // scene 可能直接就是 rankingId（推荐方案），也可能是 rankingId=xxx 格式
        if (decodedScene.includes('=')) {
          const params = {};
          decodedScene.split('&').forEach(pair => {
            const [k, v] = pair.split('=');
            if (k && v) params[k] = v;
          });
          rankingId = params.rankingId || decodedScene;
          challengeId = params.challengeId || challengeId;
        } else {
          rankingId = decodedScene;
        }
      } catch (e) {
        console.error('scene 解析失败', e);
      }
    }

    if (!rankingId) {
      wx.showToast({ title: '无效结果ID', icon: 'none' });
      return wx.navigateBack();
    }

    this.setData({ rankingId, challengeId });
    await this.loadResult();
    if (challengeId) {
      this.checkChallengeStatus(challengeId);
    }
  },

  async loadResult() {
    wx.showLoading({ title: '加载结果...' });
    try {
      const db = wx.cloud.database();
      const { data: ranking } = await db.collection('rankings').doc(this.data.rankingId).get();
      if (!ranking) throw new Error('结果不存在');

      const { mode, items, title, type } = ranking;

      const enrich = (item) => ({
        ...item,
        displayTitle: item.title || item.name || '未知作品',
        displaySub: item.year || item.artist || '',
        displayCover: item.posterPath || item.thumb || '/images/default-poster.jpg',
        displayScore: mode === 'elo'
          ? item.score + ' 分'
          : (item.matches > 0 ? Math.round((item.wins / item.matches) * 100) : 0) + '% 胜率',
        scorePercent: mode === 'elo'
          ? Math.min(100, Math.max(0, Math.round((item.score / Math.max(...items.map(i => i.score), 1)) * 100)))
          : (item.matches > 0 ? Math.round((item.wins / item.matches) * 100) : 0)
      });

      const played = items.filter(i => i.matches > 0).map(i => enrich(i));
      const unplayed = items.filter(i => i.matches === 0).map(i => enrich(i));

      let sortedPlayed;
      if (mode === 'elo') {
        sortedPlayed = played.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.wins !== a.wins) return b.wins - a.wins;
          return a.matches - b.matches;
        });
      } else {
        sortedPlayed = played.sort((a, b) => {
          const rateA = a.matches > 0 ? a.wins / a.matches : 0;
          const rateB = b.matches > 0 ? b.wins / b.matches : 0;
          if (rateB !== rateA) return rateB - rateA;
          if (b.wins !== a.wins) return b.wins - a.wins;
          return a.index - b.index;
        });
      }

      const top3 = sortedPlayed.slice(0, 3);
      const rest = sortedPlayed.slice(3).map((item, idx) => ({ ...item, rank: idx + 4 }));

      this.setData({
        mode,
        title: title || '未命名榜单',
        type,
        top3,
        rankedList: rest,
        unplayedList: unplayed
      });
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      wx.showModal({ title: '加载失败', content: err.message, showCancel: false });
    }
  },

  async checkChallengeStatus(challengeId) {
    try {
      const db = wx.cloud.database();
      const { data: challenge } = await db.collection('challenges').doc(challengeId).get();
      if (challenge && challenge.status === 'completed') {
        this.setData({
          challengeStatus: 'completed',
          similarity: challenge.similarity || 0
        });
      } else if (challenge) {
        this.setData({ challengeStatus: 'waiting' });
      }
    } catch (e) {
      console.error('查询挑战状态失败', e);
    }
  },

  onShareAppMessage() {
    const { rankingId, title, challengeId, challengeStatus } = this.data;
    let path, shareTitle;

    if (challengeId && challengeStatus === 'completed') {
      path = `/pages/compare/compare?challengeId=${challengeId}`;
      shareTitle = `我们的"${title}"品味相似度出炉了，快来看看！`;
    } else if (challengeId) {
      path = `/pages/battle/battle?challengeId=${challengeId}`;
      shareTitle = `有人向你发起"${title}"品味挑战，敢来比比吗？`;
    } else {
      path = `/pages/result/result?rankingId=${rankingId}`;
      shareTitle = `我的"${title}"排名出炉了，来看看Top10！`;
    }

    return {
      title: shareTitle,
      path,
      imageUrl: this.data.posterUrl || ''
    };
  },

  /* ==================== 海报生成 ==================== */
  async generatePoster() {
    if (this.data.isProcessing) return;
    this.setData({ isProcessing: true });
    wx.showLoading({ title: '海报绘制中...', mask: true });

    try {
      const { title, top3, rankedList } = this.data;
      const top10 = [...top3, ...rankedList].slice(0, 10);

      const qrCodeUrl = await this.getQRCode();
      const images = await this.downloadAllImages(top10, qrCodeUrl);
      const posterUrl = await this.drawPoster(title, top10, images);

      if (!posterUrl) throw new Error('海报导出失败');

      this.setData({
        posterUrl,
        showPosterModal: true,
        isProcessing: false
      });
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
      this.setData({ isProcessing: false });
    }
  },

  async getQRCode() {
    const { rankingId } = this.data;
    const { result } = await wx.cloud.callFunction({
      name: 'getRankingQRCode',
      data: {
        // ✅ FIX #1: 如果 rankingId 是 ObjectId（24字符），直接作为 scene
        // 如果超过32字符限制，需要改用短码方案
        scene: rankingId,
        page: 'pages/result/result'
      }
    });
    if (!result || !result.fileUrl) throw new Error('小程序码生成失败');
    return result.fileUrl;
  },

  async downloadAllImages(top10, qrCodeUrl) {
    const tasks = top10.map((item, idx) => {
      return this.downloadImage(item.displayCover).then(path => ({ idx, path, type: 'cover' }));
    });
    tasks.push(this.downloadImage(qrCodeUrl).then(path => ({ idx: -1, path, type: 'qr' })));
    const results = await Promise.all(tasks);
    const covers = {};
    let qr = '';
    results.forEach(r => {
      if (r.type === 'cover') covers[r.idx] = r.path;
      else qr = r.path;
    });
    return { covers, qr };
  },

  downloadImage(src) {
    return new Promise((resolve) => {
      if (!src || src === '/images/default-poster.jpg') return resolve('');
      wx.getImageInfo({
        src,
        success: (res) => resolve(res.path),
        fail: () => resolve('')
      });
    });
  },

  async drawPoster(title, top10, images) {
    const query = wx.createSelectorQuery();
    const canvas = await new Promise((resolve) => {
      query.select('#posterCanvas')
        .fields({ node: true, size: true })
        .exec((res) => resolve(res[0] ? res[0].node : null));
    });
    if (!canvas) throw new Error('Canvas 初始化失败');

    const ctx = canvas.getContext('2d');
    const dpr = wx.getSystemInfoSync().pixelRatio;
    const W = 750;
    const H = 1300;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // 背景
    ctx.fillStyle = '#FAF3E0';
    ctx.fillRect(0, 0, W, H);

    // 顶部装饰
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(W / 2, -120, 320, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 140, 0, 0.15)';
    ctx.beginPath();
    ctx.arc(W / 2, -100, 360, 0, Math.PI * 2);
    ctx.fill();

    // 标题
    ctx.fillStyle = '#4A3728';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`「${title}」`, W / 2, 100);
    ctx.fillStyle = '#B8A898';
    ctx.font = '30px sans-serif';
    ctx.fillText('我的 Top 10 排名', W / 2, 145);

    // 预加载图片对象
    const loadImg = (src) => {
      return new Promise((resolve) => {
        if (!src) return resolve(null);
        const img = canvas.createImage();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    };

    const coverImgs = await Promise.all(top10.map((_, idx) => loadImg(images.covers[idx])));
    const qrImg = await loadImg(images.qr);

    // Top 3 领奖台
    const top3Y = 190;
    const positions = [
      { x: 60, y: top3Y + 50, w: 200, h: 260, badge: '🥈', grad: ['#E8E8E8', '#B8B8B8'] },
      { x: 275, y: top3Y, w: 200, h: 310, badge: '🥇', grad: ['#FFD700', '#FF8C00'] },
      { x: 490, y: top3Y + 50, w: 200, h: 260, badge: '🥉', grad: ['#E8A86D', '#CD7F32'] }
    ];

    positions.forEach((pos, idx) => {
      const item = top10[idx];
      if (!item) return;

      // 卡片背景
      const grad = ctx.createLinearGradient(pos.x, pos.y, pos.x, pos.y + pos.h);
      grad.addColorStop(0, pos.grad[0]);
      grad.addColorStop(1, pos.grad[1]);
      ctx.fillStyle = grad;
      this.roundRect(ctx, pos.x, pos.y, pos.w, pos.h, 20);
      ctx.fill();

      // 封面
      if (coverImgs[idx]) {
        ctx.save();
        const coverH = pos.badge === '🥇' ? 160 : 130;
        this.roundRect(ctx, pos.x + 25, pos.y + 20, pos.w - 50, coverH, 10);
        ctx.clip();
        ctx.drawImage(coverImgs[idx], pos.x + 25, pos.y + 20, pos.w - 50, coverH);
        ctx.restore();
      }

      // 徽章背景
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(pos.x + pos.w / 2, pos.y + (pos.badge === '🥇' ? 200 : 180), 24, 0, Math.PI * 2);
      ctx.fill();

      // 徽章
      ctx.fillStyle = '#4A3728';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pos.badge, pos.x + pos.w / 2, pos.y + (pos.badge === '🥇' ? 209 : 189));

      // 标题
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(this.truncateText(ctx, item.displayTitle, pos.w - 30), pos.x + pos.w / 2, pos.y + pos.h - 75);

      // 副标题
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '18px sans-serif';
      ctx.fillText(this.truncateText(ctx, item.displaySub || '', pos.w - 30), pos.x + pos.w / 2, pos.y + pos.h - 50);

      // 分数
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(item.displayScore, pos.x + pos.w / 2, pos.y + pos.h - 22);
    });

    // Top 4-10 列表
    let listY = top3Y + 340;
    for (let i = 3; i < 10; i++) {
      const item = top10[i];
      if (!item) break;

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      this.roundRect(ctx, 50, listY, 650, 72, 14);
      ctx.fill();

      ctx.fillStyle = '#8C7B6B';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, 90, listY + 44);

      if (coverImgs[i]) {
        ctx.save();
        this.roundRect(ctx, 120, listY + 10, 40, 52, 6);
        ctx.clip();
        ctx.drawImage(coverImgs[i], 120, listY + 10, 40, 52);
        ctx.restore();
      }

      ctx.fillStyle = '#4A3728';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(this.truncateText(ctx, item.displayTitle, 380), 175, listY + 32);

      ctx.fillStyle = '#8C7B6B';
      ctx.font = '18px sans-serif';
      ctx.fillText(this.truncateText(ctx, item.displaySub || '', 380), 175, listY + 54);

      ctx.fillStyle = '#00C896';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(item.displayScore, 670, listY + 42);

      listY += 84;
    }

    // 分割线
    ctx.strokeStyle = 'rgba(74, 55, 40, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100, listY + 20);
    ctx.lineTo(650, listY + 20);
    ctx.stroke();

    // 小程序码
    const qrY = listY + 50;
    ctx.fillStyle = '#4A3728';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('长按识别小程序码 · 查看完整排名', W / 2, qrY);

    if (qrImg) {
      ctx.save();
      this.roundRect(ctx, W / 2 - 80, qrY + 20, 160, 160, 12);
      ctx.strokeStyle = 'rgba(74, 55, 40, 0.1)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.clip();
      ctx.drawImage(qrImg, W / 2 - 80, qrY + 20, 160, 160);
      ctx.restore();
    }

    // 品牌
    ctx.fillStyle = '#B8A898';
    ctx.font = '20px sans-serif';
    ctx.fillText('Rankranker · 发现你的品味', W / 2, qrY + 210);

    // 导出
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      });
    });
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  truncateText(ctx, text, maxWidth) {
    if (!text) return '';
    let width = ctx.measureText(text).width;
    if (width <= maxWidth) return text;
    let len = text.length;
    while (len > 0) {
      const sub = text.substring(0, len) + '…';
      if (ctx.measureText(sub).width <= maxWidth) return sub;
      len--;
    }
    return '…';
  },

  async savePoster() {
    const { posterUrl } = this.data;
    if (!posterUrl) return;
    try {
      const { authSetting } = await wx.getSetting();
      if (!authSetting['scope.writePhotosAlbum']) {
        await wx.authorize({ scope: 'scope.writePhotosAlbum' });
      }
      await wx.saveImageToPhotosAlbum({ filePath: posterUrl });
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '需要授权',
          content: '请允许保存图片到相册',
          success: (res) => { if (res.confirm) wx.openSetting(); }
        });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    }
  },

  closePoster() {
    this.setData({ showPosterModal: false });
  },

  preventClose() {},

  /* ==================== 挑战好友 ==================== */
  async challengeFriend() {
    if (this.data.isProcessing) return;
    this.setData({ isProcessing: true });
    wx.showLoading({ title: '创建挑战...', mask: true });

    try {
      const { rankingId, title, type, mode } = this.data;
      const top10 = [...this.data.top3, ...this.data.rankedList].slice(0, 10);
      const inviterTop10 = top10.map(item => item._id || item.id || item.title);

      const db = wx.cloud.database();
      const { data: ranking } = await db.collection('rankings').doc(rankingId).get();
      const items = ranking.items.map(item => ({
        id: item._id || item.id || item.title,
        title: item.title || item.name,
        posterPath: item.posterPath || item.thumb,
        year: item.year,
        artist: item.artist
      }));

      const { result } = await wx.cloud.callFunction({
        name: 'createChallenge',
        data: {
          inviterRankingId: rankingId,
          title,
          type,
          mode,
          items,
          inviterTop10
        }
      });

      // ✅ FIX #13: 处理云函数返回的错误
      if (!result || !result.success) {
        throw new Error(result?.errMsg || '创建挑战失败');
      }

      this.setData({
        challengeId: result.challengeId,
        isProcessing: false
      });
      wx.hideLoading();

      wx.showModal({
        title: '挑战已创建',
        content: '点击右上角"…"或下方分享按钮，发送给好友吧！',
        showCancel: false
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '创建失败', icon: 'none' });
      this.setData({ isProcessing: false });
    }
  },

  goCompare() {
    const { challengeId } = this.data;
    if (challengeId) {
      wx.navigateTo({ url: `/pages/compare/compare?challengeId=${challengeId}` });
    }
  },

  goHome() {
    wx.reLaunch({ url: '/pages/home/home' });
  },

  goAgain() {
    const url = this.data.type === 'movie' ? '/pages/movie/movie' : '/pages/music/music';
    wx.reLaunch({ url });
  }
});
