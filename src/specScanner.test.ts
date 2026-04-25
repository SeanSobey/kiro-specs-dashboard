import { SpecScanner } from './specScanner';

describe('SpecScanner', () => {
  let scanner: SpecScanner;

  beforeEach(() => {
    scanner = new SpecScanner();
  });

  afterEach(() => {
    scanner.dispose();
  });

  describe('parseTaskStats()', () => {
    it('should return zeros for empty content', () => {
      const stats = scanner.parseTaskStats('');
      expect(stats).toEqual({
        totalTasks: 0,
        completedTasks: 0,
        optionalTasks: 0,
        completedRequired: 0,
        completedOptional: 0,
        progress: 0,
      });
    });

    it('should count completed required and optional tasks separately', () => {
      const content = [
        '- [x] Required task done',
        '- [ ] Required task pending',
        '- [x]* Optional task done',
        '- [ ]* Optional task pending',
      ].join('\n');

      const stats = scanner.parseTaskStats(content);

      expect(stats.totalTasks).toBe(4);
      expect(stats.completedTasks).toBe(2);
      expect(stats.optionalTasks).toBe(2);
      expect(stats.completedRequired).toBe(1);
      expect(stats.completedOptional).toBe(1);
      expect(stats.progress).toBe(50);
    });

    it('should handle all required tasks completed', () => {
      const content = [
        '- [x] Task 1',
        '- [x] Task 2',
        '- [x] Task 3',
      ].join('\n');

      const stats = scanner.parseTaskStats(content);

      expect(stats.completedRequired).toBe(3);
      expect(stats.completedOptional).toBe(0);
      expect(stats.completedTasks).toBe(3);
      expect(stats.progress).toBe(100);
    });

    it('should handle all optional tasks completed', () => {
      const content = [
        '- [x]* Optional 1',
        '- [x]* Optional 2',
      ].join('\n');

      const stats = scanner.parseTaskStats(content);

      expect(stats.completedRequired).toBe(0);
      expect(stats.completedOptional).toBe(2);
      expect(stats.optionalTasks).toBe(2);
      expect(stats.completedTasks).toBe(2);
    });

    it('should not count in-progress or queued tasks as completed', () => {
      const content = [
        '- [~] In progress required',
        '- [-] Queued required',
        '- [x] Done required',
        '- [~]* In progress optional',
        '- [x]* Done optional',
      ].join('\n');

      const stats = scanner.parseTaskStats(content);

      expect(stats.totalTasks).toBe(5);
      expect(stats.completedTasks).toBe(2);
      expect(stats.completedRequired).toBe(1);
      expect(stats.completedOptional).toBe(1);
      expect(stats.optionalTasks).toBe(2);
    });

    it('should handle content with no tasks', () => {
      const content = '# Just a heading\n\nSome text without tasks.';
      const stats = scanner.parseTaskStats(content);

      expect(stats.totalTasks).toBe(0);
      expect(stats.completedRequired).toBe(0);
      expect(stats.completedOptional).toBe(0);
    });

    it('should satisfy decomposition invariant: completedTasks === completedRequired + completedOptional', () => {
      const content = [
        '- [x] Done 1',
        '- [x] Done 2',
        '- [ ] Pending',
        '- [x]* Optional done',
        '- [ ]* Optional pending',
        '- [~] In progress',
      ].join('\n');

      const stats = scanner.parseTaskStats(content);

      expect(stats.completedTasks).toBe(stats.completedRequired + stats.completedOptional);
      expect(stats.completedRequired).toBeLessThanOrEqual(stats.totalTasks - stats.optionalTasks);
      expect(stats.completedOptional).toBeLessThanOrEqual(stats.optionalTasks);
    });
  });
});
