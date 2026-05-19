const axios = require('axios');

// ========== DNS 硬编码 IP（定期更新）==========
const HOST_MAP = {
  'api.themoviedb.org': [
    '18.65.63.37',
    '18.65.63.56',
    '18.65.63.34',
    '18.65.63.23'
  ],
  'image.tmdb.org': [
    '79.127.134.225'
  ]
};

const customLookup = (hostname, options, callback) => {
  const ips = HOST_MAP[hostname];
  if (ips && ips.length > 0) {
    const ip = ips[Math.floor(Math.random() * ips.length)];
    console.log(`[DNS Override] ${hostname} -> ${ip}`);
    return callback(null, ip, 4);
  }
  const dns = require('dns');
  dns.lookup(hostname, options, callback);
};

const tmdbClient = axios.create({
  timeout: 2500,
  lookup: customLookup,
});

const TMDB_API_KEY = process.env.TMDB_KEY;

async function tmdbRequest(config, retries = 2) {
  try {
    return await tmdbClient.request(config);
  } catch (err) {
    if (retries > 0 && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.response?.status >= 500)) {
      console.warn(`请求失败，1秒后重试... 剩余次数: ${retries}`);
      await new Promise(r => setTimeout(r, 1000));
      return tmdbRequest(config, retries - 1);
    }
    throw err;
  }
}

function formatMovie(movie) {
  return {
    id: movie.id,
    title: movie.title,
    originalTitle: movie.original_title,
    overview: movie.overview,
    posterPath: movie.poster_path 
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
      : null,
    backdropPath: movie.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`
      : null,
    releaseDate: movie.release_date,
    year: movie.release_date ? movie.release_date.split('-')[0] : '',
    voteAverage: movie.vote_average,
    popularity: movie.popularity
  };
}

exports.main = async (event, context) => {
  const { query } = event;
  
  if (!query || query.trim() === '') {
    return { code: 400, message: '搜索关键词不能为空' };
  }

  const trimmedQuery = query.trim();

  try {
    // 1. 先尝试搜影人（演员 / 导演）
    const personRes = await tmdbRequest({
      method: 'GET',
      url: `https://api.themoviedb.org/3/search/person`,
      params: {
        api_key: TMDB_API_KEY,
        query: trimmedQuery,
        language: 'zh-CN',
        page: 1,
        include_adult: false
      }
    });

    const persons = personRes.data.results || [];
    console.log('影人搜索结果条数:', persons.length);

    // 如果找到影人，返回其作品列表
    if (persons.length > 0) {
      const person = persons[0];
      console.log('匹配到影人:', person.name, 'ID:', person.id);

      const creditsRes = await tmdbRequest({
        method: 'GET',
        url: `https://api.themoviedb.org/3/person/${person.id}/movie_credits`,
        params: {
          api_key: TMDB_API_KEY,
          language: 'zh-CN'
        }
      });

      // 核心职位白名单（只保留这些）
      const coreJobs = ['Director', 'Writer', 'Screenplay', 'Story', 'Author'];
      
      // 合并 cast 和 crew，按电影ID去重，过滤无关职位
      const movieMap = new Map();

      // 演员作品
      (creditsRes.data.cast || []).forEach(movie => {
        if (!movieMap.has(movie.id)) {
          movieMap.set(movie.id, {
            ...formatMovie(movie),
            role: movie.character || '演员'
          });
        }
      });

      // 幕后作品：只保留核心职位
      (creditsRes.data.crew || []).forEach(movie => {
        if (!coreJobs.includes(movie.job)) return;

        if (!movieMap.has(movie.id)) {
          movieMap.set(movie.id, {
            ...formatMovie(movie),
            role: movie.job
          });
        } else {
          const existing = movieMap.get(movie.id);
          if (!existing.role.includes(movie.job)) {
            existing.role += ` / ${movie.job}`;
          }
        }
      });

      // 按热度排序，取前 50 部
      const movies = Array.from(movieMap.values())
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, 50);

      return {
        code: 200,
        data: {
          movies,
          totalResults: movies.length,
          personInfo: {
            id: person.id,
            name: person.name,
            profilePath: person.profile_path
              ? `https://image.tmdb.org/t/p/w200${person.profile_path}`
              : null,
            knownForDepartment: person.known_for_department,
            popularity: person.popularity
          }
        }
      };
    }

    // 2. 没找到影人，fallback 搜电影（原有逻辑）
    const searchRes = await tmdbRequest({
      method: 'GET',
      url: `https://api.themoviedb.org/3/search/movie`,
      params: {
        api_key: TMDB_API_KEY,
        query: trimmedQuery,
        language: 'zh-CN',
        page: 1,
        include_adult: false
      }
    });

    console.log('TMDB电影搜索原始返回条数:', searchRes.data.results.length);
    if (searchRes.data.results.length > 0) {
      console.log('TMDB原始第一条数据:', JSON.stringify(searchRes.data.results[0], null, 2));
    }

    const movies = (searchRes.data.results || []).slice(0, 10).map(formatMovie);

    return {
      code: 200,
      data: {
        movies,
        totalResults: searchRes.data.total_results
      }
    };

  } catch (err) {
    console.error('TMDB 请求失败:', err.message);
    return {
      code: 500,
      message: `请求 TMDB 失败: ${err.message}`
    };
  }
};
