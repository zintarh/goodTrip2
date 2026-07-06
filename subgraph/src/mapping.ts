import { BigInt } from "@graphprotocol/graph-ts";
import { PlayerRegistered, UsernameUpdated } from "../generated/PlayerRegistry/PlayerRegistry";
import { ScoreRecorded } from "../generated/ScoreRegistry/ScoreRegistry";
import { Player } from "../generated/schema";

function loadOrCreatePlayer(address: string): Player {
  let player = Player.load(address);
  if (player == null) {
    player = new Player(address);
    player.username = null;
    player.registeredAt = null;
    player.totalScore = BigInt.fromI32(0);
    player.gamesPlayed = 0;
    player.lastScoreAt = null;
  }
  return player as Player;
}

export function handlePlayerRegistered(event: PlayerRegistered): void {
  const player = loadOrCreatePlayer(event.params.player.toHexString());
  player.username = event.params.username;
  player.registeredAt = event.params.timestamp;
  player.save();
}

export function handleUsernameUpdated(event: UsernameUpdated): void {
  const player = loadOrCreatePlayer(event.params.player.toHexString());
  player.username = event.params.newUsername;
  player.save();
}

export function handleScoreRecorded(event: ScoreRecorded): void {
  const player = loadOrCreatePlayer(event.params.player.toHexString());
  player.totalScore = player.totalScore.plus(event.params.score);
  player.gamesPlayed = player.gamesPlayed + 1;
  player.lastScoreAt = event.block.timestamp;
  player.save();
}
