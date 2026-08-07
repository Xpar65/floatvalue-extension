import { extractSteamInventoryItemSnapshot } from "./extract-steam-inventory-item";
import {
  STEAM_INVENTORY_SELECTION_EVENT,
  STEAM_INVENTORY_SELECTION_READY_EVENT,
  STEAM_INVENTORY_SELECTION_REQUEST_EVENT
} from "../shared/steam-inventory-selection-bridge";

const BRIDGE_STATE_KEY = "__cslyticsSteamInventorySelectionBridgeV1";
const SELECTION_POLL_MS = 50;

interface BridgeState {
  dispatchCurrent(force?: boolean): void;
  dispose(): void;
}

type BridgeWindow = Window &
  typeof globalThis & {
    [BRIDGE_STATE_KEY]?: BridgeState;
  };

/**
 * Runs in Steam's MAIN world. It observes only the already-hydrated selected item and crosses the
 * isolated-world boundary with the same narrow snapshot used by the one-shot extractor.
 */
export function installSteamInventorySelectionBridge(): BridgeState {
  const bridgeWindow = window as BridgeWindow;
  const installed = bridgeWindow[BRIDGE_STATE_KEY];
  if (installed && typeof installed.dispatchCurrent === "function") {
    installed.dispatchCurrent(true);
    return installed;
  }

  let lastSerialized: string | undefined;
  let disposed = false;

  const dispatchCurrent = (force = false): void => {
    if (disposed) return;
    const serialized = JSON.stringify(extractSteamInventoryItemSnapshot("selection"));
    if (!force && serialized === lastSerialized) return;
    lastSerialized = serialized;
    window.dispatchEvent(
      new CustomEvent<string>(STEAM_INVENTORY_SELECTION_EVENT, { detail: serialized })
    );
  };
  const handleRequest = (): void => dispatchCurrent(true);
  window.addEventListener(STEAM_INVENTORY_SELECTION_REQUEST_EVENT, handleRequest);
  const timer = window.setInterval(dispatchCurrent, SELECTION_POLL_MS);

  const state: BridgeState = {
    dispatchCurrent,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener(STEAM_INVENTORY_SELECTION_REQUEST_EVENT, handleRequest);
      if (bridgeWindow[BRIDGE_STATE_KEY] === state) delete bridgeWindow[BRIDGE_STATE_KEY];
    }
  };
  bridgeWindow[BRIDGE_STATE_KEY] = state;

  window.dispatchEvent(new Event(STEAM_INVENTORY_SELECTION_READY_EVENT));
  dispatchCurrent(true);
  return state;
}
