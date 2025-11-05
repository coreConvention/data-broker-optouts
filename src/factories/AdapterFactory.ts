import type { BrokerEntry } from "../types.js";
import { BaseAdapter } from "../adapters/BaseAdapter.js";
import { GenericFormAdapter } from "../adapters/GenericFormAdapter.js";
import { SpokeoAdapter } from "../adapters/sites/SpokeoAdapter.js";
import { WhitepagesAdapter } from "../adapters/sites/WhitepagesAdapter.js";
import { NuwberAdapter } from "../adapters/sites/NuwberAdapter.js";
import { RadarisAdapter } from "../adapters/sites/RadarisAdapter.js";
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

      case "Radaris":
        return new RadarisAdapter(entry);

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
      "Radaris",
      "BeenVerified",
      "Intelius",
      "MyLife"
    ];

    return validAdapters.includes(adapterName);
  }
}
