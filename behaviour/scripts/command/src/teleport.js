import { newCommand } from "../handle.js";
import { world } from "@minecraft/server";

newCommand({
    name: "teleport",
    description: "Teleports a player or yourself to a player or coordinates.",
    aliases: ["tp"],
    adminOnly: true,
    run: (data) => {
        const player = data.player;
        const args = data.args.slice(1); // Remove the command name itself

        if (args.length < 1) {
            return player.sendMessage("§cUsage: .teleport <targetPlayerName> [destinationPlayerName | x y z]");
        }

        const firstArg = args[0];
        let targetPlayer;

        // Determine if the first argument is a player name to identify the command structure
        // This logic differs slightly from the original to better fit the argument parsing
        // Cases to consider:
        // 1. .tp <target> (sender to target)
        // 2. .tp <playerX> <playerY> (playerX to playerY)
        // 3. .tp <x> <y> <z> (sender to coords)
        // 4. .tp <playerX> <x> <y> <z> (playerX to coords)

        if (args.length === 1) { // .tp <targetPlayerName> (sender to target)
            targetPlayer = Array.from(world.getPlayers()).find(p => p.name === firstArg);
            if (!targetPlayer) {
                return player.sendMessage(`§cPlayer "${firstArg}" not found.`);
            }
            player.teleport(targetPlayer.location, { dimension: targetPlayer.dimension, rotation: player.getRotation() });
            return player.sendMessage(`§aTeleported to ${targetPlayer.name}.`);
        } else if (args.length === 2) { // .tp <targetPlayerName> <destinationPlayerName>
            targetPlayer = Array.from(world.getPlayers()).find(p => p.name === firstArg);
            if (!targetPlayer) {
                return player.sendMessage(`§cPlayer "${firstArg}" (target) not found.`);
            }
            const destinationPlayerName = args[1];
            const destinationPlayer = Array.from(world.getPlayers()).find(p => p.name === destinationPlayerName);
            if (!destinationPlayer) {
                return player.sendMessage(`§cPlayer "${destinationPlayerName}" (destination) not found.`);
            }
            targetPlayer.teleport(destinationPlayer.location, { dimension: destinationPlayer.dimension, rotation: destinationPlayer.getRotation() });
            return player.sendMessage(`§aTeleported ${targetPlayer.name} to ${destinationPlayer.name}.`);
        } else if (args.length === 3) { // .tp <x> <y> <z> (sender to coordinates)
            // This case assumes if 3 args are given, they are coordinates for the sender
            // This is different from the original, which allowed .tp <player> <x> <y> and then errored.
            // The newCommand structure encourages more direct parsing.
            const x = parseFloat(args[0]);
            const y = parseFloat(args[1]);
            const z = parseFloat(args[2]);

            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                 // If the first arg could be a player, and the other two are not numbers, it's an invalid format.
                 // However, our structure with args.length === 3 is now strictly for sender to coords.
                return player.sendMessage("§cInvalid coordinates. Usage: .teleport <x> <y> <z>");
            }
            player.teleport({ x, y, z }, { dimension: player.dimension, rotation: player.getRotation() });
            return player.sendMessage(`§aTeleported to coordinates ${x}, ${y}, ${z}.`);
        } else if (args.length === 4) { // .tp <targetPlayerName> <x> <y> <z>
            targetPlayer = Array.from(world.getPlayers()).find(p => p.name === firstArg);
            if (!targetPlayer) {
                return player.sendMessage(`§cPlayer "${firstArg}" not found.`);
            }
            const x = parseFloat(args[1]);
            const y = parseFloat(args[2]);
            const z = parseFloat(args[3]);

            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                return player.sendMessage("§cInvalid coordinates. Usage: .teleport <targetPlayerName> <x> <y> <z>");
            }
            targetPlayer.teleport({ x, y, z }, { dimension: targetPlayer.dimension, rotation: targetPlayer.getRotation() });
            return player.sendMessage(`§aTeleported ${targetPlayer.name} to coordinates ${x}, ${y}, ${z}.`);
        } else {
            // If none of the above cases matched, it's an invalid usage
            return player.sendMessage("§cInvalid command usage. Check help for correct syntax. Usage: .teleport <targetPlayerNameOrX> [destinationPlayerNameOrY] [z] [targetX] [targetY] [targetZ]");
        }
    }
});
