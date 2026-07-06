// Shared domain types used by both apps/web and convex/

export type GameMode = "random" | "region" | "invite" | "staked";

export type SplitType = "winner-take-all" | "top-3" | "top-4";

export type TokenType = "GD" | "USDT";

export interface Player {
  address: string;
  username: string;
  avatarUrl: string;
  allTimeScore: number;
  weeklyScore: number;
  isWhitelisted: boolean;
}

export interface Region {
  id: string;
  name: string;
  countryCode: string;
  locationCount: number;
  isUnlocked: boolean; // true when locationCount >= threshold (~20)
}

export interface Location {
  id: string;
  regionId: string;
  imageUrl: string;
  placeName: string;
  // Coordinates are NEVER sent to the client before a guess is locked
}

export interface Round {
  roundNumber: number; // 1–5
  locationId: string;
  guessLat?: number;
  guessLng?: number;
  score?: number; // 0–500, filled after server-side scoring
  distanceKm?: number;
  isComplete: boolean;
}

export interface GameSession {
  id: string;
  playerAddress: string;
  mode: GameMode;
  regionId?: string;
  rounds: Round[];
  totalScore: number;
  isComplete: boolean;
  createdAt: number;
}

export interface MatchConfig {
  stakeAmount: string;
  token: TokenType;
  split: SplitType;
}

export interface InviteMatch {
  id: string;
  inviteCode: string;
  creatorAddress: string;
  config: MatchConfig;
  locationIds: string[]; // locked at creation, same 5 for all players
  playerAddresses: string[];
  isSettled: boolean;
  createdAt: number;
}

export type HintType = "region-reveal" | "area-narrow" | "place-clue";

export interface HintPurchase {
  roundId: string;
  hintType: HintType;
  costGD: string;
  purchasedAt: number;
}
