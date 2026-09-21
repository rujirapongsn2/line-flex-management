/**
 * Backward-compat thin wrapper → /api/location/action (same handler logic).
 * Prefer POST /api/location/action for new clients.
 */
export { GET, POST, dynamic } from "../../location/action/route";
