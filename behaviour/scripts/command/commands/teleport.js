import { Command } from "../command";
import { world } from "mojang-minecraft";

// Command Info
const command = new Command(
  "teleport",
  "Teleports a player or yourself to a player or coordinates.",
  ["tp"]
);

command.setCallback((player, args) => {
  if (!player.hasAdmin()) {
    return player.tell("§cYou do not have permission to use this command.");
  }

  if (args.length < 1) {
    return player.tell("§cUsage: .teleport <targetPlayerName> [destinationPlayerName | x y z]");
  }

  const firstArg = args[0];
  let targetPlayer;

  // Check if the first argument is a player name
  if (args.length === 1 || (args.length === 3 && isNaN(parseFloat(args[1])))) {
    targetPlayer = Array.from(world.getPlayers()).find(p => p.name === firstArg);
    if (!targetPlayer) {
      return player.tell(`§cPlayer "${firstArg}" not found.`);
    }
  }

  // Case 1: .teleport <targetPlayerName> (sender to targetPlayer)
  if (args.length === 1) {
    if (!targetPlayer) { // Should have been caught above, but as a safeguard
        return player.tell(`§cPlayer "${firstArg}" not found.`);
    }
    player.teleport(targetPlayer.location, targetPlayer.dimension, targetPlayer.rotation.x, targetPlayer.rotation.y);
    return player.tell(`§aTeleported to ${targetPlayer.name}.`);
  }

  // Case 2: .teleport <targetPlayerName> <destinationPlayerName>
  if (args.length === 2) {
    if (!targetPlayer) { // targetPlayer is the first argument
        targetPlayer = Array.from(world.getPlayers()).find(p => p.name === firstArg);
        if (!targetPlayer) {
            return player.tell(`§cPlayer "${firstArg}" not found.`);
        }
    }
    const destinationPlayerName = args[1];
    const destinationPlayer = Array.from(world.getPlayers()).find(p => p.name === destinationPlayerName);
    if (!destinationPlayer) {
      return player.tell(`§cDestination player "${destinationPlayerName}" not found.`);
    }
    targetPlayer.teleport(destinationPlayer.location, destinationPlayer.dimension, destinationPlayer.rotation.x, destinationPlayer.rotation.y);
    return player.tell(`§aTeleported ${targetPlayer.name} to ${destinationPlayer.name}.`);
  }

  // Case 3: .teleport <x> <y> <z> (sender to coordinates)
  if (args.length === 3) {
    const x = parseFloat(args[0]);
    const y = parseFloat(args[1]);
    const z = parseFloat(args[2]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      // This case could also be .teleport <player> <x> <y> which is invalid, or .teleport <player> <player> handled above
      // If the first arg was a player, targetPlayer would be set.
      if (targetPlayer) { // e.g. .teleport PlayerX 10 20 - this is invalid
           return player.tell("§cInvalid command usage. To teleport a player to coordinates, use: .teleport <targetPlayerName> <x> <y> <z>");
      }
      return player.tell("§cInvalid coordinates. Usage: .teleport <x> <y> <z>");
    }
    player.teleport({ x, y, z }, player.dimension, player.rotation.x, player.rotation.y);
    return player.tell(`§aTeleported to coordinates ${x}, ${y}, ${z}.`);
  }

  // Case 4: .teleport <targetPlayerName> <x> <y> <z>
  if (args.length === 4) {
    // First arg must be a player name
    targetPlayer = Array.from(world.getPlayers()).find(p => p.name === firstArg);
    if (!targetPlayer) {
        return player.tell(`§cPlayer "${firstArg}" not found.`);
    }

    const x = parseFloat(args[1]);
    const y = parseFloat(args[2]);
    const z = parseFloat(args[3]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      return player.tell("§cInvalid coordinates. Usage: .teleport <targetPlayerName> <x> <y> <z>");
    }
    targetPlayer.teleport({ x, y, z }, targetPlayer.dimension, targetPlayer.rotation.x, targetPlayer.rotation.y);
    return player.tell(`§aTeleported ${targetPlayer.name} to coordinates ${x}, ${y}, ${z}.`);
  }

  // If none of the above cases matched, it's an invalid usage
  player.tell("§cInvalid command usage. Check help for correct syntax.");
});

export { command };
