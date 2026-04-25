/**
 * Unit tests for VelocityCalculator
 * 
 * Tests velocity tracking accuracy including:
 * - Task completion recording
 * - Weekly aggregations
 * - Required vs optional task tracking
 * - Spec activity tracking
 * - Multi-workspace scenarios
 * 
 * Requirements: 19.1-19.6, 21.1-21.10
 */

import { VelocityCalculator } from './velocityCalculator';
import { StateManager } from './stateManager';
import { VelocityData, WeeklyTaskData, SpecActivityData } from './types';

// Mock StateManager
class MockStateManager {
  private velocityData: VelocityData | null = null;

  async getVelocityData(): Promise<VelocityData | null> {
    return this.velocityData;
  }

  async saveVelocityData(data: VelocityData): Promise<void> {
    this.velocityData = data;
  }

  async getActiveAnalyticsTab(): Promise<string> {
    return 'velocity';
  }

  async saveActiveAnalyticsTab(tab: string): Promise<void> {
    // No-op for tests
  }
}

/**
 * Helper to get a date relative to the current week.
 * weekOffset: 0 = current week, -1 = last week, -2 = two weeks ago, etc.
 * dayOfWeek: 0 = Monday, 1 = Tuesday, ..., 6 = Sunday
 */
function getRelativeDate(weekOffset: number, dayOfWeek: number = 0, hour: number = 10): Date {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(hour, 0, 0, 0);
  const target = new Date(monday);
  target.setDate(monday.getDate() + (weekOffset * 7) + dayOfWeek);
  return target;
}

describe('VelocityCalculator - Task Completion Recording', () => {
  let calculator: VelocityCalculator;
  let mockStateManager: MockStateManager;

  beforeEach(async () => {
    mockStateManager = new MockStateManager();
    calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();
  });

  test('should record required task completion correctly', async () => {
    const timestamp = getRelativeDate(0, 0); // Current week Monday
    
    await calculator.recordTaskCompletion('test-spec', 'task-1', true, timestamp);
    
    const metrics = calculator.calculateMetrics();
    expect(metrics.currentWeekTasks).toBe(1);
    
    const reqVsOpt = metrics.requiredVsOptional;
    expect(reqVsOpt.required).toBe(1);
    expect(reqVsOpt.optional).toBe(0);
  });

  test('should record optional task completion correctly', async () => {
    const timestamp = getRelativeDate(0, 0);
    
    await calculator.recordTaskCompletion('test-spec', 'task-1', false, timestamp);
    
    const metrics = calculator.calculateMetrics();
    expect(metrics.currentWeekTasks).toBe(1);
    
    const reqVsOpt = metrics.requiredVsOptional;
    expect(reqVsOpt.required).toBe(0);
    expect(reqVsOpt.optional).toBe(1);
  });

  test('should aggregate multiple task completions in same week', async () => {
    const monday = getRelativeDate(0, 0);
    const wednesday = getRelativeDate(0, 2);
    const friday = getRelativeDate(0, 4);
    
    await calculator.recordTaskCompletion('spec-1', 'task-1', true, monday);
    await calculator.recordTaskCompletion('spec-1', 'task-2', true, wednesday);
    await calculator.recordTaskCompletion('spec-2', 'task-1', false, friday);
    
    const metrics = calculator.calculateMetrics();
    expect(metrics.currentWeekTasks).toBe(3);
    
    const reqVsOpt = metrics.requiredVsOptional;
    expect(reqVsOpt.required).toBe(2);
    expect(reqVsOpt.optional).toBe(1);
  });

  test('should track tasks across different weeks', async () => {
    const week1 = getRelativeDate(-2, 0);
    const week2 = getRelativeDate(-1, 0);
    const week3 = getRelativeDate(0, 0);
    
    await calculator.recordTaskCompletion('spec-1', 'task-1', true, week1);
    await calculator.recordTaskCompletion('spec-1', 'task-2', true, week1);
    await calculator.recordTaskCompletion('spec-1', 'task-3', true, week2);
    await calculator.recordTaskCompletion('spec-1', 'task-4', true, week2);
    await calculator.recordTaskCompletion('spec-1', 'task-5', true, week2);
    await calculator.recordTaskCompletion('spec-1', 'task-6', true, week3);
    
    const tasksPerWeek = calculator.getTasksPerWeek(12);
    
    // Should have 2, 3, 1 in the last 3 weeks
    expect(tasksPerWeek[tasksPerWeek.length - 3]).toBe(2);
    expect(tasksPerWeek[tasksPerWeek.length - 2]).toBe(3);
    expect(tasksPerWeek[tasksPerWeek.length - 1]).toBe(1);
  });

  test('should track day of week correctly', async () => {
    const monday = getRelativeDate(0, 0);
    const tuesday = getRelativeDate(0, 1);
    const wednesday = getRelativeDate(0, 2);
    const thursday = getRelativeDate(0, 3);
    const friday = getRelativeDate(0, 4);
    
    await calculator.recordTaskCompletion('spec-1', 'task-1', true, monday);
    await calculator.recordTaskCompletion('spec-1', 'task-2', true, monday);
    await calculator.recordTaskCompletion('spec-1', 'task-3', true, tuesday);
    await calculator.recordTaskCompletion('spec-1', 'task-4', true, wednesday);
    await calculator.recordTaskCompletion('spec-1', 'task-5', true, friday);
    await calculator.recordTaskCompletion('spec-1', 'task-6', true, friday);
    await calculator.recordTaskCompletion('spec-1', 'task-7', true, friday);
    
    const metrics = calculator.calculateMetrics();
    const dayOfWeek = metrics.dayOfWeekVelocity;
    
    expect(dayOfWeek.monday).toBe(2);
    expect(dayOfWeek.tuesday).toBe(1);
    expect(dayOfWeek.wednesday).toBe(1);
    expect(dayOfWeek.thursday).toBe(0);
    expect(dayOfWeek.friday).toBe(3);
    expect(dayOfWeek.saturday).toBe(0);
    expect(dayOfWeek.sunday).toBe(0);
  });

  test('should track spec activity on first task', async () => {
    const timestamp = getRelativeDate(0, 0);
    
    await calculator.recordTaskCompletion('new-spec', 'task-1', true, timestamp);
    
    const metrics = calculator.calculateMetrics();
    // Spec activity is tracked internally, verify through state persistence
    const savedData = await mockStateManager.getVelocityData();
    
    expect(savedData).not.toBeNull();
    expect(savedData!.specActivity['new-spec']).toBeDefined();
    expect(savedData!.specActivity['new-spec'].firstTaskDate).toEqual(timestamp);
    expect(savedData!.specActivity['new-spec'].lastTaskDate).toEqual(timestamp);
  });

  test('should update spec activity on subsequent tasks', async () => {
    const firstTask = getRelativeDate(0, 0);
    const secondTask = getRelativeDate(0, 2);
    const thirdTask = getRelativeDate(0, 4);
    
    await calculator.recordTaskCompletion('spec-1', 'task-1', true, firstTask);
    await calculator.recordTaskCompletion('spec-1', 'task-2', true, secondTask);
    await calculator.recordTaskCompletion('spec-1', 'task-3', true, thirdTask);
    
    const savedData = await mockStateManager.getVelocityData();
    const activity = savedData!.specActivity['spec-1'];
    
    expect(activity.firstTaskDate).toEqual(firstTask);
    expect(activity.lastTaskDate).toEqual(thirdTask);
  });

  test('should handle multiple specs independently', async () => {
    const timestamp = getRelativeDate(0, 0);
    
    await calculator.recordTaskCompletion('spec-a', 'task-1', true, timestamp);
    await calculator.recordTaskCompletion('spec-a', 'task-2', true, timestamp);
    await calculator.recordTaskCompletion('spec-b', 'task-1', false, timestamp);
    await calculator.recordTaskCompletion('spec-c', 'task-1', true, timestamp);
    await calculator.recordTaskCompletion('spec-c', 'task-2', false, timestamp);
    
    const savedData = await mockStateManager.getVelocityData();
    
    expect(savedData!.specActivity['spec-a']).toBeDefined();
    expect(savedData!.specActivity['spec-b']).toBeDefined();
    expect(savedData!.specActivity['spec-c']).toBeDefined();
    
    const metrics = calculator.calculateMetrics();
    expect(metrics.currentWeekTasks).toBe(5);
    expect(metrics.requiredVsOptional.required).toBe(3);
    expect(metrics.requiredVsOptional.optional).toBe(2);
  });

  test('should persist data after each task completion', async () => {
    const timestamp = getRelativeDate(0, 0);
    
    await calculator.recordTaskCompletion('spec-1', 'task-1', true, timestamp);
    
    const savedData = await mockStateManager.getVelocityData();
    expect(savedData).not.toBeNull();
    expect(savedData!.weeklyTasks.length).toBeGreaterThan(0);
  });
});

describe('VelocityCalculator - Spec Completion Tracking', () => {
  let calculator: VelocityCalculator;
  let mockStateManager: MockStateManager;

  beforeEach(async () => {
    mockStateManager = new MockStateManager();
    calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();
  });

  test('should record spec completion correctly', async () => {
    const timestamp = getRelativeDate(0, 0);
    
    await calculator.recordSpecCompletion('spec-1', 10, 10, timestamp);
    
    const savedData = await mockStateManager.getVelocityData();
    const activity = savedData!.specActivity['spec-1'];
    
    expect(activity.completionDate).toEqual(timestamp);
    expect(activity.totalTasks).toBe(10);
    expect(activity.completedTasks).toBe(10);
    
    const specsPerWeek = calculator.getSpecsPerWeek(8);
    expect(specsPerWeek[specsPerWeek.length - 1]).toBe(1);
  });

  test('should track multiple spec completions in same week', async () => {
    const monday = getRelativeDate(0, 0);
    const wednesday = getRelativeDate(0, 2);
    const friday = getRelativeDate(0, 4);
    
    await calculator.recordSpecCompletion('spec-1', 5, 5, monday);
    await calculator.recordSpecCompletion('spec-2', 8, 8, wednesday);
    await calculator.recordSpecCompletion('spec-3', 12, 12, friday);
    
    const specsPerWeek = calculator.getSpecsPerWeek(8);
    expect(specsPerWeek[specsPerWeek.length - 1]).toBe(3);
  });

  test('should update spec progress and detect completion', async () => {
    // Simulate gradual progress
    await calculator.updateSpecProgress('spec-1', 10, 5);
    
    let savedData = await mockStateManager.getVelocityData();
    let activity = savedData!.specActivity['spec-1'];
    expect(activity.completionDate).toBeNull();
    
    // Complete the spec
    await calculator.updateSpecProgress('spec-1', 10, 10);
    
    savedData = await mockStateManager.getVelocityData();
    activity = savedData!.specActivity['spec-1'];
    expect(activity.completionDate).not.toBeNull();
    expect(activity.totalTasks).toBe(10);
    expect(activity.completedTasks).toBe(10);
  });

  test('should handle spec uncompleted (task unchecked)', async () => {
    const timestamp = getRelativeDate(0, 0);
    
    // Complete the spec
    await calculator.recordSpecCompletion('spec-1', 10, 10, timestamp);
    
    let savedData = await mockStateManager.getVelocityData();
    expect(savedData!.specActivity['spec-1'].completionDate).not.toBeNull();
    
    // Uncheck a task
    await calculator.updateSpecProgress('spec-1', 10, 9);
    
    savedData = await mockStateManager.getVelocityData();
    expect(savedData!.specActivity['spec-1'].completionDate).toBeNull();
    expect(savedData!.specActivity['spec-1'].completedTasks).toBe(9);
  });
});

describe('VelocityCalculator - Data Persistence', () => {
  let calculator: VelocityCalculator;
  let mockStateManager: MockStateManager;

  beforeEach(async () => {
    mockStateManager = new MockStateManager();
    calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();
  });

  test('should persist and restore velocity data', async () => {
    const timestamp = getRelativeDate(0, 0);
    
    // Record some data
    await calculator.recordTaskCompletion('spec-1', 'task-1', true, timestamp);
    await calculator.recordTaskCompletion('spec-1', 'task-2', false, timestamp);
    await calculator.recordSpecCompletion('spec-1', 10, 10, timestamp);
    
    // Create new calculator instance (simulating extension restart)
    const newCalculator = new VelocityCalculator(mockStateManager as any);
    await newCalculator.initialize();
    
    // Verify data was restored
    const metrics = newCalculator.calculateMetrics();
    expect(metrics.currentWeekTasks).toBe(2);
    expect(metrics.requiredVsOptional.required).toBe(1);
    expect(metrics.requiredVsOptional.optional).toBe(1);
    
    const specsPerWeek = newCalculator.getSpecsPerWeek(8);
    expect(specsPerWeek[specsPerWeek.length - 1]).toBe(1);
  });

  test('should handle missing velocity data gracefully', async () => {
    // Initialize with no saved data
    const calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();
    
    const metrics = calculator.calculateMetrics();
    expect(metrics.currentWeekTasks).toBe(0);
    expect(metrics.tasksPerWeek.every(count => count === 0)).toBe(true);
  });
});
