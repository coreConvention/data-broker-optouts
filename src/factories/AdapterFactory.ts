import type { BrokerEntry } from "../types.js";
import { BaseAdapter } from "../adapters/BaseAdapter.js";
import type { ListingAdapter } from "../adapters/ListingAdapter.js";
import { GenericFormAdapter } from "../adapters/GenericFormAdapter.js";
import { SpokeoAdapter } from "../adapters/sites/SpokeoAdapter.js";
import { WhitepagesAdapter } from "../adapters/sites/WhitepagesAdapter.js";
import { NuwberAdapter } from "../adapters/sites/NuwberAdapter.js";
import { BeenVerifiedAdapter } from "../adapters/sites/BeenVerifiedAdapter.js";
import { InteliusAdapter } from "../adapters/sites/InteliusAdapter.js";
import { MyLifeAdapter } from "../adapters/sites/MyLifeAdapter.js";

/**
 * Factory for creating appropriate adapter instances
 * Single Responsibility: Adapter instantiation based on broker configuration
 *
 * Follows Factory Pattern for object creation
 */
export class AdapterFactory {
  /**
   * Create an adapter instance for the given broker entry
   *
   * @param entry - Broker configuration entry
   * @returns Instantiated adapter for the broker
   */
  public static createAdapter(entry: BrokerEntry): BaseAdapter {
    switch (entry.adapter) {
      case "Spokeo":
        return new SpokeoAdapter(entry);

      case "Whitepages":
        return new WhitepagesAdapter(entry);

      case "Nuwber":
        return new NuwberAdapter(entry);

      case "BeenVerified":
        return new BeenVerifiedAdapter(entry);

      case "Intelius":
        return new InteliusAdapter(entry);

      case "MyLife":
        return new MyLifeAdapter(entry);

      case "generic":
      default:
        return new GenericFormAdapter(entry);
    }
  }

  /**
   * Create the scan-first adapter for a broker, if it has one.
   *
   * A broker with a listing adapter is driven through scan, confirm, request
   * by ExecutionOrchestrator instead of through `createAdapter(entry).run()`.
   *
   * @param _entry - Broker configuration entry
   * @returns The broker's listing adapter, or null when it has none. No
   *   broker has one yet; Whitepages is the first (#39).
   */
  public static createListingAdapter(_entry: BrokerEntry): ListingAdapter | null {
    return null;
  }

  /**
   * Check if an adapter is available for the given adapter name
   *
   * @param adapterName - Name of the adapter
   * @returns True if adapter exists
   */
  public static hasAdapter(adapterName: string): boolean {
    const validAdapters = [
      "generic",
      "Spokeo",
      "Whitepages",
      "Nuwber",
      "BeenVerified",
      "Intelius",
      "MyLife"
    ];

    return validAdapters.includes(adapterName);
  }
}
