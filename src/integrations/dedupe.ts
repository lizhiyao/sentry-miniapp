import type { Event, EventHint, Integration, IntegrationFn } from '@sentry/core';

/** Deduplication filter */
export class Dedupe implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Dedupe';

  /**
   * @inheritDoc
   */
  public name: string = Dedupe.id;

  /**
   * @inheritDoc
   */
  private _previousEvent?: Event;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // This integration doesn't need setup
  }

  /**
   * @inheritDoc
   */
  public processEvent(currentEvent: Event, _hint?: EventHint): Event | null {
    // We want to ignore any non-error type events, e.g. transactions or replays
    // These should never be deduped, and also not be compared against as _previousEvent.
    if (currentEvent.type) {
      return currentEvent;
    }

    // Juuust in case something goes wrong
    try {
      if (this._shouldDropEvent(currentEvent, this._previousEvent)) {
        return null;
      }
    } catch (_oO) {
      return (this._previousEvent = currentEvent);
    }

    return (this._previousEvent = currentEvent);
  }

  /** JSDoc */
  private _shouldDropEvent(currentEvent: Event, previousEvent?: Event): boolean {
    if (!previousEvent) {
      return false;
    }

    if (this._isSameMessageEvent(currentEvent, previousEvent)) {
      return true;
    }

    if (this._isSameExceptionEvent(currentEvent, previousEvent)) {
      return true;
    }

    return false;
  }

  /** JSDoc */
  private _isSameMessageEvent(currentEvent: Event, previousEvent: Event): boolean {
    const currentMessage = currentEvent.message;
    const previousMessage = previousEvent.message;

    // If neither event has a message property, they were both exceptions, so bail out
    if (!currentMessage && !previousMessage) {
      return false;
    }

    // If only one event has a message property, the events are not the same
    if ((currentMessage && !previousMessage) || (!currentMessage && previousMessage)) {
      return false;
    }

    if (currentMessage !== previousMessage) {
      return false;
    }

    if (!this._isSameFingerprint(currentEvent, previousEvent)) {
      return false;
    }

    if (!this._isSameStacktrace(currentEvent, previousEvent)) {
      return false;
    }

    return true;
  }

  /** JSDoc */
  private _isSameExceptionEvent(currentEvent: Event, previousEvent: Event): boolean {
    const currentException = this._getExceptionFromEvent(currentEvent);
    const previousException = this._getExceptionFromEvent(previousEvent);

    if (!currentException || !previousException) {
      return false;
    }

    if (currentException.type !== previousException.type || currentException.value !== previousException.value) {
      return false;
    }

    if (!this._isSameFingerprint(currentEvent, previousEvent)) {
      return false;
    }

    if (!this._isSameStacktrace(currentEvent, previousEvent)) {
      return false;
    }

    return true;
  }

  /** JSDoc */
  private _isSameStacktrace(currentEvent: Event, previousEvent: Event): boolean {
    let currentFrames = this._getFramesFromEvent(currentEvent);
    let previousFrames = this._getFramesFromEvent(previousEvent);

    // If neither event has a stacktrace, they are assumed to be the same
    if (!currentFrames && !previousFrames) {
      return true;
    }

    // If only one event has a stacktrace, but not the other one, they are not the same
    if ((currentFrames && !previousFrames) || (!currentFrames && previousFrames)) {
      return false;
    }

    currentFrames = currentFrames as any[];
    previousFrames = previousFrames as any[];

    // If number of frames differ, they are not the same
    if (previousFrames.length !== currentFrames.length) {
      return false;
    }

    // Otherwise, compare the frames
    for (let i = 0; i < previousFrames.length; i++) {
      const frameA = previousFrames[i];
      const frameB = currentFrames[i];

      if (
        frameA.filename !== frameB.filename ||
        frameA.lineno !== frameB.lineno ||
        frameA.colno !== frameB.colno ||
        frameA.function !== frameB.function
      ) {
        return false;
      }
    }

    return true;
  }

  /** JSDoc */
  private _isSameFingerprint(currentEvent: Event, previousEvent: Event): boolean {
    let currentFingerprint = currentEvent.fingerprint;
    let previousFingerprint = previousEvent.fingerprint;

    // If neither event has a fingerprint, they are assumed to be the same
    if (!currentFingerprint && !previousFingerprint) {
      return true;
    }

    // If only one event has a fingerprint, but not the other one, they are not the same
    if ((currentFingerprint && !previousFingerprint) || (!currentFingerprint && previousFingerprint)) {
      return false;
    }

    currentFingerprint = currentFingerprint as string[];
    previousFingerprint = previousFingerprint as string[];

    // Otherwise, compare the fingerprints
    try {
      return !!(currentFingerprint.join('') === previousFingerprint.join(''));
    } catch (_oO) {
      return false;
    }
  }

  /** JSDoc */
  private _getExceptionFromEvent(event: Event): any {
    return event.exception && event.exception.values && event.exception.values[0];
  }

  /** JSDoc */
  private _getFramesFromEvent(event: Event): any[] | undefined {
    const exception = event.exception;

    if (exception) {
      try {
        // @ts-ignore Object could be undefined
        return exception.values[0].stacktrace.frames;
      } catch (_oO) {
        // ignore
      }
    }

    return undefined;
  }
}

/**
 * Dedupe integration
 */
export const dedupeIntegration: IntegrationFn = () => {
  return new Dedupe();
};