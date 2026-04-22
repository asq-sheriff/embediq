import type { EventBus, Unsubscribe } from './bus.js';

/**
 * Contract for event bus subscribers. A subscriber registers one or more
 * handlers on the bus and returns the list of unsubscribe functions so
 * the host (CLI, web server, tests) can tear down cleanly.
 */
export interface Subscriber {
  readonly name: string;
  register(bus: EventBus): Unsubscribe[];
}
