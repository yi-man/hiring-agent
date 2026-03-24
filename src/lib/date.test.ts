import { formatDate, formatRelativeDate, formatDateForSEO, getReadingTime } from '@/lib/date';

describe('date.ts - 日期工具函数', () => {
  describe('formatDate', () => {
    it('格式化 Date 对象为中文日期字符串', () => {
      const date = new Date('2024-01-15');
      expect(formatDate(date)).toEqual('2024年1月15日');
    });

    it('格式化日期字符串为中文日期', () => {
      expect(formatDate('2024-01-15')).toEqual('2024年1月15日');
    });

    it('格式化无效日期', () => {
      expect(() => formatDate('invalid-date')).not.toThrow();
    });
  });

  describe('formatRelativeDate', () => {
    it('显示刚刚', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 30 * 1000);
      expect(formatRelativeDate(date)).toEqual('刚刚');
    });

    it('显示分钟前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('5 分钟前');
    });

    it('显示小时前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('2 小时前');
    });

    it('显示天前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('2 天前');
    });

    it('显示周前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('1 周前');
    });

    it('显示月前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('1 个月前');
    });

    it('显示年前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('1 年前');
    });
  });

  describe('formatDateForSEO', () => {
    it('格式化日期为 SEO 友好格式', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(formatDateForSEO(date)).toEqual('2024-01-15');
    });
  });

  describe('getReadingTime', () => {
    it('计算阅读时间', () => {
      const text = 'word '.repeat(200); // 200 个单词
      expect(getReadingTime(text)).toEqual('1 分钟阅读');
    });

    it('计算长文本阅读时间', () => {
      const text = 'word '.repeat(1000); // 1000 个单词
      expect(getReadingTime(text)).toEqual('5 分钟阅读');
    });

    it('空文本阅读时间', () => {
      expect(getReadingTime('')).toEqual('0 分钟阅读');
    });
  });
});
