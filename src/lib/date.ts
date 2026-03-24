export function formatDate(date: Date | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export function formatRelativeDate(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) {
    return '刚刚';
  } else if (diff < hour) {
    return `${Math.floor(diff / minute)} 分钟前`;
  } else if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`;
  } else if (diff < week) {
    return `${Math.floor(diff / day)} 天前`;
  } else if (diff < month) {
    return `${Math.floor(diff / week)} 周前`;
  } else if (diff < year) {
    return `${Math.floor(diff / month)} 个月前`;
  } else {
    return `${Math.floor(diff / year)} 年前`;
  }
}

export function formatDateForSEO(date: Date | string): string {
  return new Date(date).toISOString().split('T')[0];
}

export function getReadingTime(text: string): string {
  const wordsPerMinute = 200;
  const wordCount = text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  return `${minutes} 分钟阅读`;
}
