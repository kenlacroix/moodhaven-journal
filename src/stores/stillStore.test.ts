const mockEngineInstance = {
  start: vi.fn(),
  stop: vi.fn(),
  resume: vi.fn(),
  setSpeed: vi.fn(),
  onTick: vi.fn(() => vi.fn()),
  onPause: vi.fn(() => vi.fn()),
};

const constructorSpy = vi.fn();

vi.mock('../modules/stillhaven/engine/bilateralEngine', () => {
  class MockBilateralEngine {
    start = mockEngineInstance.start;
    stop = mockEngineInstance.stop;
    resume = mockEngineInstance.resume;
    setSpeed = mockEngineInstance.setSpeed;
    onTick = mockEngineInstance.onTick;
    onPause = mockEngineInstance.onPause;
    constructor(config?: unknown) { constructorSpy(config); }
  }
  return {
    BilateralEngine: MockBilateralEngine,
    ENGINE_DEFAULTS: { speedHz: 1.0, toneHz: 200, volumeDb: -18, envelopeMs: 30 },
  };
});

import { useStillStore } from './stillStore';
import { BilateralEngine } from '../modules/stillhaven/engine/bilateralEngine';

describe('stillStore', () => {
  beforeEach(() => {
    useStillStore.setState({
      engine: null,
      isRunning: false,
      isPaused: false,
      elapsedSeconds: 0,
      lastTick: null,
    });
    vi.clearAllMocks();
    constructorSpy.mockClear();
    // Restore return values after clearAllMocks wipes them
    mockEngineInstance.onTick.mockImplementation(() => vi.fn());
    mockEngineInstance.onPause.mockImplementation(() => vi.fn());
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('engine is null', () => {
      expect(useStillStore.getState().engine).toBeNull();
    });

    it('isRunning is false', () => {
      expect(useStillStore.getState().isRunning).toBe(false);
    });

    it('isPaused is false', () => {
      expect(useStillStore.getState().isPaused).toBe(false);
    });

    it('elapsedSeconds is 0', () => {
      expect(useStillStore.getState().elapsedSeconds).toBe(0);
    });

    it('lastTick is null', () => {
      expect(useStillStore.getState().lastTick).toBeNull();
    });
  });

  describe('startEngine', () => {
    it('creates a new BilateralEngine instance', () => {
      useStillStore.getState().startEngine();
      expect(constructorSpy).toHaveBeenCalledTimes(1);
    });

    it('stores the engine instance in state', () => {
      useStillStore.getState().startEngine();
      expect(useStillStore.getState().engine).not.toBeNull();
      expect(useStillStore.getState().engine).toBeInstanceOf(BilateralEngine);
    });

    it('calls engine.start()', () => {
      useStillStore.getState().startEngine();
      expect(mockEngineInstance.start).toHaveBeenCalledTimes(1);
    });

    it('sets isRunning to true', () => {
      useStillStore.getState().startEngine();
      expect(useStillStore.getState().isRunning).toBe(true);
    });

    it('sets isPaused to false', () => {
      useStillStore.setState({ isPaused: true });
      useStillStore.getState().startEngine();
      expect(useStillStore.getState().isPaused).toBe(false);
    });

    it('resets elapsedSeconds to 0', () => {
      useStillStore.setState({ elapsedSeconds: 42 });
      useStillStore.getState().startEngine();
      expect(useStillStore.getState().elapsedSeconds).toBe(0);
    });

    it('wires onTick subscription on the engine', () => {
      useStillStore.getState().startEngine();
      expect(mockEngineInstance.onTick).toHaveBeenCalledTimes(1);
    });

    it('wires onPause subscription on the engine', () => {
      useStillStore.getState().startEngine();
      expect(mockEngineInstance.onPause).toHaveBeenCalledTimes(1);
    });

    it('reuses existing engine rather than creating a second one', () => {
      useStillStore.getState().startEngine();
      const existingEngine = useStillStore.getState().engine;
      constructorSpy.mockClear();
      mockEngineInstance.start.mockClear();

      // Keep the engine in state so startEngine reuses it
      useStillStore.getState().startEngine();

      expect(constructorSpy).not.toHaveBeenCalled();
      expect(mockEngineInstance.start).toHaveBeenCalledTimes(1);
      expect(useStillStore.getState().engine).toBe(existingEngine);
    });

    it('passes config to the BilateralEngine constructor', () => {
      useStillStore.getState().startEngine({ speedHz: 1.5 });
      expect(constructorSpy).toHaveBeenCalledWith({ speedHz: 1.5 });
    });
  });

  describe('stopEngine', () => {
    it('calls engine.stop()', () => {
      useStillStore.getState().startEngine();
      useStillStore.getState().stopEngine();
      expect(mockEngineInstance.stop).toHaveBeenCalledTimes(1);
    });

    it('resets engine to null', () => {
      useStillStore.getState().startEngine();
      useStillStore.getState().stopEngine();
      expect(useStillStore.getState().engine).toBeNull();
    });

    it('resets isRunning to false', () => {
      useStillStore.getState().startEngine();
      useStillStore.getState().stopEngine();
      expect(useStillStore.getState().isRunning).toBe(false);
    });

    it('resets isPaused to false', () => {
      useStillStore.getState().startEngine();
      useStillStore.setState({ isPaused: true });
      useStillStore.getState().stopEngine();
      expect(useStillStore.getState().isPaused).toBe(false);
    });

    it('resets elapsedSeconds to 0', () => {
      useStillStore.getState().startEngine();
      useStillStore.setState({ elapsedSeconds: 30 });
      useStillStore.getState().stopEngine();
      expect(useStillStore.getState().elapsedSeconds).toBe(0);
    });

    it('resets lastTick to null', () => {
      useStillStore.getState().startEngine();
      useStillStore.setState({ lastTick: { side: 'L', t: 1.0 } });
      useStillStore.getState().stopEngine();
      expect(useStillStore.getState().lastTick).toBeNull();
    });

    it('is a no-op when no engine is active', () => {
      expect(() => useStillStore.getState().stopEngine()).not.toThrow();
      expect(useStillStore.getState().engine).toBeNull();
    });
  });

  describe('resumeEngine', () => {
    it('calls engine.resume()', () => {
      useStillStore.getState().startEngine();
      useStillStore.setState({ isPaused: true });

      useStillStore.getState().resumeEngine();

      expect(mockEngineInstance.resume).toHaveBeenCalledTimes(1);
    });

    it('sets isPaused to false', () => {
      useStillStore.getState().startEngine();
      useStillStore.setState({ isPaused: true });

      useStillStore.getState().resumeEngine();

      expect(useStillStore.getState().isPaused).toBe(false);
    });

    it('is a no-op when no engine exists', () => {
      expect(() => useStillStore.getState().resumeEngine()).not.toThrow();
    });
  });

  describe('setSpeed', () => {
    it('delegates to engine.setSpeed()', () => {
      useStillStore.getState().startEngine();

      useStillStore.getState().setSpeed(1.5);

      expect(mockEngineInstance.setSpeed).toHaveBeenCalledWith(1.5);
    });

    it('is a no-op when no engine exists', () => {
      expect(() => useStillStore.getState().setSpeed(1.0)).not.toThrow();
    });
  });

  describe('elapsed timer', () => {
    it('increments elapsedSeconds by 1 each second while running', () => {
      vi.useFakeTimers();

      useStillStore.getState().startEngine();
      vi.advanceTimersByTime(3000);

      expect(useStillStore.getState().elapsedSeconds).toBe(3);

      vi.useRealTimers();
    });

    it('does not increment elapsedSeconds when isPaused is true', () => {
      vi.useFakeTimers();

      useStillStore.getState().startEngine();
      useStillStore.setState({ isPaused: true });
      vi.advanceTimersByTime(3000);

      expect(useStillStore.getState().elapsedSeconds).toBe(0);

      vi.useRealTimers();
    });

    it('stops incrementing after stopEngine is called', () => {
      vi.useFakeTimers();

      useStillStore.getState().startEngine();
      vi.advanceTimersByTime(2000);

      useStillStore.getState().stopEngine();
      vi.advanceTimersByTime(3000);

      // stopEngine resets elapsedSeconds to 0 and clears the interval
      expect(useStillStore.getState().elapsedSeconds).toBe(0);

      vi.useRealTimers();
    });

    it('resumes incrementing after resumeEngine clears the pause', () => {
      vi.useFakeTimers();

      useStillStore.getState().startEngine();
      vi.advanceTimersByTime(2000);        // +2s

      useStillStore.setState({ isPaused: true });
      vi.advanceTimersByTime(2000);        // paused — should not count

      useStillStore.getState().resumeEngine();
      vi.advanceTimersByTime(2000);        // +2s more

      expect(useStillStore.getState().elapsedSeconds).toBe(4);

      vi.useRealTimers();
    });
  });
});
