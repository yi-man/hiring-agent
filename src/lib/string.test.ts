import {
  truncate,
  capitalize,
  slugify,
  stripHtml,
  escapeHtml,
  generateRandomString,
} from './string';

describe('string utilities', () => {
  describe('truncate', () => {
    it('should return the original string if it is shorter than or equal to maxLength', () => {
      expect(truncate('Hello World', 11)).toBe('Hello World');
      expect(truncate('Short', 10)).toBe('Short');
    });

    it('should truncate strings longer than maxLength and add ellipsis', () => {
      expect(truncate('This is a long string that needs to be truncated', 20)).toBe(
        'This is a long st...',
      );
    });

    it('should use default maxLength of 100 if not provided', () => {
      const longString = 'a'.repeat(100);
      expect(truncate(longString)).toBe(longString);
      expect(truncate(longString + 'a')).toBe(longString.slice(0, 97) + '...');
    });
  });

  describe('capitalize', () => {
    it('should capitalize the first letter of a string', () => {
      expect(capitalize('hello world')).toBe('Hello world');
      expect(capitalize('123 test')).toBe('123 test');
    });

    it('should return empty string for empty input', () => {
      expect(capitalize('')).toBe('');
    });
  });

  describe('slugify', () => {
    it('should convert string to URL-friendly slug', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Test  Page!')).toBe('test-page');
    });

    it('should handle special characters correctly', () => {
      expect(slugify('Café & Tea')).toBe('caf-tea');
      expect(slugify('Hello@World#123')).toBe('helloworld123');
    });

    it('should handle multiple spaces and hyphens', () => {
      expect(slugify('  Test   Page  ')).toBe('test-page');
      expect(slugify('Test--Page')).toBe('test-page');
    });
  });

  describe('stripHtml', () => {
    it('should remove HTML tags from string', () => {
      expect(stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
      expect(stripHtml('Plain text')).toBe('Plain text');
    });

    it('should handle empty string', () => {
      expect(stripHtml('')).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML characters', () => {
      expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
      );
    });

    it('should return empty string for empty input', () => {
      expect(escapeHtml('')).toBe('');
    });
  });

  describe('generateRandomString', () => {
    it('should generate random string of specified length', () => {
      const length = 10;
      const randomStr = generateRandomString(length);
      expect(randomStr.length).toBe(length);
    });

    it('should use default length of 8 if not provided', () => {
      const randomStr = generateRandomString();
      expect(randomStr.length).toBe(8);
    });

    it('should generate different random strings on subsequent calls', () => {
      const first = generateRandomString();
      const second = generateRandomString();
      expect(first).not.toBe(second);
    });
  });
});
