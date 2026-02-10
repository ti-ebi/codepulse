/**
 * Adapter registry.
 *
 * Central lookup for finding which adapter handles a given measurement axis.
 * Adapters register themselves here; the orchestration layer queries the
 * registry to find the right adapter for each requested axis.
 */

import type { AxisId } from "../types/axis.js";
import type { ToolAdapter } from "./adapter.js";

export class AdapterRegistry {
  private readonly adapters: Map<string, ToolAdapter> = new Map();

  /**
   * Register an adapter. Throws if an adapter with the same id
   * is already registered (programmer error).
   */
  register(adapter: ToolAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(
        `Adapter with id "${adapter.id}" is already registered`,
      );
    }
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * Find all adapters that support the given axis.
   * Returns an empty array if no adapter supports the axis.
   */
  getAdaptersForAxis(axisId: AxisId): readonly ToolAdapter[] {
    const matching: ToolAdapter[] = [];
    for (const adapter of this.adapters.values()) {
      if (adapter.supportedAxes.includes(axisId)) {
        matching.push(adapter);
      }
    }
    return matching;
  }

  /**
   * Get a specific adapter by its id.
   * Returns undefined if not found.
   */
  getAdapter(id: string): ToolAdapter | undefined {
    return this.adapters.get(id);
  }

  /**
   * List all registered adapter ids.
   */
  getRegisteredIds(): readonly string[] {
    return [...this.adapters.keys()];
  }
}
