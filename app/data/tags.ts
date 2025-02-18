/*
 * @LastEditors: biz
 */
import { Tag } from '../store/recommendation';

export const predefinedTags: Tag[] = [
  // 电影标签
  { id: 'movie-action', name: '动作', type: 'movie' },
  { id: 'movie-comedy', name: '喜剧', type: 'movie' },
  { id: 'movie-drama', name: '剧情', type: 'movie' },
  { id: 'movie-scifi', name: '科幻', type: 'movie' },
  { id: 'movie-horror', name: '恐怖', type: 'movie' },
  { id: 'movie-romance', name: '爱情', type: 'movie' },
  { id: 'movie-animation', name: '动画', type: 'movie' },

  // 书籍标签
  { id: 'book-fiction', name: '小说', type: 'book' },
  { id: 'book-nonfiction', name: '非虚构', type: 'book' },
  { id: 'book-science', name: '科学', type: 'book' },
  { id: 'book-tech', name: '技术', type: 'book' },
  { id: 'book-biography', name: '传记', type: 'book' },
  { id: 'book-history', name: '历史', type: 'book' },
  { id: 'book-philosophy', name: '哲学', type: 'book' },

  // 音乐标签
  { id: 'music-pop', name: '流行', type: 'music' },
  { id: 'music-rock', name: '摇滚', type: 'music' },
  { id: 'music-jazz', name: '爵士', type: 'music' },
  { id: 'music-classical', name: '古典', type: 'music' },
  { id: 'music-electronic', name: '电子', type: 'music' },
  { id: 'music-hiphop', name: '嘻哈', type: 'music' },
  { id: 'music-folk', name: '民谣', type: 'music' },

  // 文章标签
  { id: 'article-tech', name: '科技', type: 'article' },
  { id: 'article-culture', name: '文化', type: 'article' },
  { id: 'article-lifestyle', name: '生活方式', type: 'article' },
  { id: 'article-business', name: '商业', type: 'article' },
  { id: 'article-health', name: '健康', type: 'article' },
  { id: 'article-education', name: '教育', type: 'article' },

  // 网站标签
  { id: 'website-news', name: '新闻', type: 'website' },
  { id: 'website-social', name: '社交', type: 'website' },
  { id: 'website-education', name: '教育', type: 'website' },
  { id: 'website-entertainment', name: '娱乐', type: 'website' },
  { id: 'website-productivity', name: '生产力', type: 'website' },
  { id: 'website-shopping', name: '购物', type: 'website' },
]; 