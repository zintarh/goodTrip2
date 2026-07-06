/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as games from "../games.js";
import type * as hints from "../hints.js";
import type * as inviteMatches from "../inviteMatches.js";
import type * as lib_verifyPayment from "../lib/verifyPayment.js";
import type * as locations from "../locations.js";
import type * as players from "../players.js";
import type * as streaks from "../streaks.js";
import type * as vouchers from "../vouchers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  games: typeof games;
  hints: typeof hints;
  inviteMatches: typeof inviteMatches;
  "lib/verifyPayment": typeof lib_verifyPayment;
  locations: typeof locations;
  players: typeof players;
  streaks: typeof streaks;
  vouchers: typeof vouchers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
