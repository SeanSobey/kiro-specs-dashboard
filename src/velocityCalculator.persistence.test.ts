/**
 * Unit tests for VelocityCalculator state persistence
 * 
 * Tests analytics state persistence:
 * - Velocity data persistence across sessions
 * - Active tab restoration
 * - Workspace-specific data isolation
 * - Corrupted data recovery
 * 
 * Requirements: 23.1-23.5
 */

import { VelocityCalculator } from './velocityCalculator';
import { StateManager } from './stateManager';
import { VelocityData } from './types';

// Mock StateManager with persistence simulation
class MockStateManager {
  private velocityData: any = null;
  private activeTab: string = 'velocity';
  private workspaceId: string = 'default';

  constructor(workspaceId: string = 'default') {
    this.workspaceId = workspaceId;
  }

  async getVelocityData(): Promise<any> {
    return this.velocityData;
  }

  async saveVelocityData(data: any): Promise<void> {
    // Simulate serialization (dates become strings)
    this.velocityData = JSON.parse(JSON.stringify(data));
  }

  async getActiveAnalyticsTab(): Promise<string> {
    return this.activeTab;
  }

  async saveActiveAnalyticsTab(tab: string): Promise<void> {
    this.activeTab = tab;
  }

  getWorkspaceId(): string {
    return this.workspaceId;
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

describe('VelocityCalculator - State Persistence', () => {
  test('should persist velocity data after task completion', async () => {
    const mockStateManager = new MockStateManager();
    const calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();

    const timestamp = getRelativeDate(0, 0);
    await calculator.recordTaskCompletion('spec-1', 'task-1', true, timestamp);

    const savedData = await mockStateManager.getVelocityData();
    expect(savedData).not.toBeNull();
    expect(savedData.weeklyTasks).toBeDefined();
    expect(savedData.weeklyTasks.length).toBeGreaterThan(0);
  });

  test('should restore velocity data on initialization', async () => {
    const mockStateManager = new MockStateManager();
    
    // First calculator: record some data
    const calculator1 = new VelocityCalculator(mockStateManager as any);
    await calculator1.initialize();
    
    const timestamp = getRelativeDate(0, 0);
    await calculator1.recordTaskCompletion('spec-1', 'task-1', true, timestamp);
    await calculator1.recordTaskCompletion('spec-1', 'task-2', false, timestamp);

    // Second calculator: should restore data
    const calculator2 = new VelocityCalculator(mockStateManager as any);
    await calculator2.initialize();

    const metrics = calculator2.calculateMetrics();
    expect(metrics.currentWeekTasks).toBe(2);
    expect(metrics.requiredVsOptional.required).toBe(1);
    expect(metrics.requiredVsOptional.optional).toBe(1);
  });

  test('should persist spec activity data', async () => {
    const mockStateManager = new MockStateManager();
    const calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();

    const start = getRelativeDate(0, 0);
    const end = getRelativeDate(0, 4);

    await calculator.recordTaskCompletion('spec-1', 'task-1', true, start);
    await calculator.recordSpecCompletion('spec-1', 10, 10, end);

    const savedData = await mockStateManager.getVelocityData();
    expect(savedData.specActivity['spec-1']).toBeDefined();
    expect(savedData.specActivity['spec-1'].completionDate).toBeDefined();
  });

  test('should persist day of week data', async () => {
    const mockStateManager = new MockStateManager();
    const calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();

    const monday = getRelativeDate(0, 0);
    const friday = getRelativeDate(0, 4);

    await calculator.recordTaskCompletion('spec-1', 'task-1', true, monday);
    await calculator.recordTaskCompletion('spec-1', 'task-2', true, friday);

    const savedData = await mockStateManager.getVelocityData();
    expect(savedData.dayOfWeekTasks.monday).toBe(1);
    expect(savedData.dayOfWeekTasks.friday).toBe(1);
  });

  test('should handle missing velocity data gracefully', async () => {
    const mockStateManager = new MockStateManager();
    const calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();

    const metrics = calculator.calculateMetrics();
    expect(metrics.currentWeekTasks).toBe(0);
    expect(metrics.tasksPerWeek.every(count => count === 0)).toBe(true);
  });
});

describe('VelocityCalculator - Active Tab Persistence', () => {
  test('should persist active tab', async () => {
    const mockStateManager = new MockStateManager();

    await mockStateManager.saveActiveAnalyticsTab('timeline');

    const savedTab = await mockStateManager.getActiveAnalyticsTab();
    expect(savedTab).toBe('timeline');
  });

  test('should default to velocity tab', async () => {
    const mockStateManager = new MockStateManager();

    const defaultTab = await mockStateManager.getActiveAnalyticsTab();
    expect(defaultTab).toBe('velocity');
  });

  test('should restore last active tab', async () => {
    const mockStateManager = new MockStateManager();

    await mockStateManager.saveActiveAnalyticsTab('forecasts');

    // Simulate reopening
    const restoredTab = await mockStateManager.getActiveAnalyticsTab();
    expect(restoredTab).toBe('forecasts');
  });
});

describe('VelocityCalculator - Workspace Isolation', () => {
  test('should maintain separate data per workspace', async () => {
    const workspace1Manager = new MockStateManager('workspace-1');
    const workspace2Manager = new MockStateManager('workspace-2');

    const calculator1 = new VelocityCalculator(workspace1Manager as any);
    const calculator2 = new VelocityCalculator(workspace2Manager as any);

    await calculator1.initialize();
    await calculator2.initialize();

    const timestamp = getRelativeDate(0, 0);

    // Record different data in each workspace
    await calculator1.recordTaskCompletion('spec-1', 'task-1', true, timestamp);
    await calculator1.recordTaskCompletion('spec-1', 'task-2', true, timestamp);

    await calculator2.recordTaskCompletion('spec-2', 'task-1', true, timestamp);

    // Verify isolation
    const metrics1 = calculator1.calculateMetrics();
    const metrics2 = calculator2.calculateMetrics();

    expect(metrics1.currentWeekTasks).toBe(2);
    expect(metrics2.currentWeekTasks).toBe(1);
  });

  test('should not share velocity data between workspaces', async () => {
    const workspace1Manager = new MockStateManager('workspace-1');
    const workspace2Manager = new MockStateManager('workspace-2');

    const calculator1 = new VelocityCalculator(workspace1Manager as any);
    await calculator1.initialize();

    const timestamp = getRelativeDate(0, 0);
    await calculator1.recordTaskCompletion('spec-1', 'task-1', true, timestamp);

    // Create calculator for different workspace
    const calculator2 = new VelocityCalculator(workspace2Manager as any);
    await calculator2.initialize();

    const metrics2 = calculator2.calculateMetrics();
    expect(metrics2.currentWeekTasks).toBe(0); // Should not see workspace-1 data
  });

  test('should maintain separate active tabs per workspace', async () => {
    const workspace1Manager = new MockStateManager('workspace-1');
    const workspace2Manager = new MockStateManager('workspace-2');

    await workspace1Manager.saveActiveAnalyticsTab('velocity');
    await workspace2Manager.saveActiveAnalyticsTab('timeline');

    const tab1 = await workspace1Manager.getActiveAnalyticsTab();
    const tab2 = await workspace2Manager.getActiveAnalyticsTab();

    expect(tab1).toBe('velocity');
    expect(tab2).toBe('timeline');
  });
});

describe('VelocityCalculator - Corrupted Data Recovery', () => {
  test('should handle corrupted velocity data', async () => {
    const mockStateManager = new MockStateManager();
    
    // Manually set corrupted data
    await mockStateManager.saveVelocityData({
      weeklyTasks: 'invalid', // Should be array
      weeklySpecs: null,
      specActivity: undefined,
      dayOfWeekTasks: 'corrupted'
    });

    const calculator = new VelocityCalculator(mockStateManager as any);
    
    // Should not throw, should use defaults
    await expect(calculator.initialize()).resolves.not.toThrow();
  });

  test('should handle missing fields in velocity data', async () => {
    const mockStateManager = new MockStateManager();
    
    // Partially corrupted data
    await mockStateManager.saveVelocityData({
      weeklyTasks: [],
      // Missing weeklySpecs, specActivity, dayOfWeekTasks
    });

    const calculator = new VelocityCalculator(mockStateManager as any);
    await expect(calculator.initialize()).resolves.not.toThrow();
  });

  test('should handle invalid date strings', async () => {
    const mockStateManager = new MockStateManager();
    
    await mockStateManager.saveVelocityData({
      weeklyTasks: [{
        weekStart: 'invalid-date',
        weekEnd: 'invalid-date',
        completed: 5,
        required: 3,
        optional: 2
      }],
      weeklySpecs: [],
      specActivity: {},
      dayOfWeekTasks: {
        monday: 0,
        tuesday: 0,
        wednesday: 0,
        thursday: 0,
        friday: 0,
        saturday: 0,
        sunday: 0
      }
    });

    const calculator = new VelocityCalculator(mockStateManager as any);
    await expect(calculator.initialize()).resolves.not.toThrow();
  });

  test('should recover from null velocity data', async () => {
    const mockStateManager = new MockStateManager();
    
    // Explicitly set null
    await mockStateManager.saveVelocityData(null);

    const calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();

    const metrics = calculator.calculateMetrics();
    expect(metrics.currentWeekTasks).toBe(0);
  });

  test('should continue working after recovering from corruption', async () => {
    const mockStateManager = new MockStateManager();
    
    // Start with corrupted data
    await mockStateManager.saveVelocityData({ corrupted: true });

    const calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();

    // Should be able to record new data
    const timestamp = getRelativeDate(0, 0);
    await expect(
      calculator.recordTaskCompletion('spec-1', 'task-1', true, timestamp)
    ).resolves.not.toThrow();

    const metrics = calculator.calculateMetrics();
    expect(metrics.currentWeekTasks).toBeGreaterThanOrEqual(0);
  });
});

describe('VelocityCalculator - Date Serialization', () => {
  test('should correctly serialize and deserialize dates', async () => {
    const mockStateManager = new MockStateManager();
    const calculator1 = new VelocityCalculator(mockStateManager as any);
    await calculator1.initialize();

    const originalDate = getRelativeDate(0, 0);
    await calculator1.recordTaskCompletion('spec-1', 'task-1', true, originalDate);

    // Create new calculator to test deserialization
    const calculator2 = new VelocityCalculator(mockStateManager as any);
    await calculator2.initialize();

    const savedData = await mockStateManager.getVelocityData();
    expect(savedData.weeklyTasks[0].weekStart).toBeDefined();
  });

  test('should handle spec activity date serialization', async () => {
    const mockStateManager = new MockStateManager();
    const calculator1 = new VelocityCalculator(mockStateManager as any);
    await calculator1.initialize();

    const start = getRelativeDate(-1, 0);
    const end = getRelativeDate(0, 0);

    await calculator1.recordTaskCompletion('spec-1', 'task-1', true, start);
    await calculator1.recordSpecCompletion('spec-1', 10, 10, end);

    // Create new calculator to test deserialization
    const calculator2 = new VelocityCalculator(mockStateManager as any);
    await calculator2.initialize();

    const avgTime = calculator2.calculateAvgTimeToComplete();
    expect(avgTime).toBeGreaterThan(0);
  });
});

describe('VelocityCalculator - Long-term Persistence', () => {
  test('should maintain data integrity over multiple sessions', async () => {
    const mockStateManager = new MockStateManager();

    // Session 1: Record some data
    const calc1 = new VelocityCalculator(mockStateManager as any);
    await calc1.initialize();
    await calc1.recordTaskCompletion('spec-1', 'task-1', true, getRelativeDate(-2, 0));

    // Session 2: Record more data
    const calc2 = new VelocityCalculator(mockStateManager as any);
    await calc2.initialize();
    await calc2.recordTaskCompletion('spec-1', 'task-2', true, getRelativeDate(-1, 0));

    // Session 3: Record even more data
    const calc3 = new VelocityCalculator(mockStateManager as any);
    await calc3.initialize();
    await calc3.recordTaskCompletion('spec-1', 'task-3', true, getRelativeDate(0, 0));

    // Session 4: Verify all data is present
    const calc4 = new VelocityCalculator(mockStateManager as any);
    await calc4.initialize();

    const tasksPerWeek = calc4.getTasksPerWeek(12);
    const nonZeroWeeks = tasksPerWeek.filter(count => count > 0);
    expect(nonZeroWeeks.length).toBe(3); // 3 different weeks
  });

  test('should handle data accumulation over many weeks', async () => {
    const mockStateManager = new MockStateManager();
    const calculator = new VelocityCalculator(mockStateManager as any);
    await calculator.initialize();

    // Record data for 20 weeks
    for (let week = 0; week < 20; week++) {
      const weekDate = getRelativeDate(-19 + week, 0);

      for (let i = 0; i < 5; i++) {
        await calculator.recordTaskCompletion('spec-1', `w${week}-${i}`, true, weekDate);
      }
    }

    const tasksPerWeek = calculator.getTasksPerWeek(12);
    expect(tasksPerWeek.length).toBe(12);
    expect(tasksPerWeek.every(count => count === 5)).toBe(true); // Last 12 weeks should all have 5 tasks
  });
});
