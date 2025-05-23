import { getPlayerByName, logDebug, sendMessageToAllAdmins } from '../../assets/util';
import { newCommand } from '../handle';

newCommand({
    name:"unmute",
	description: "<player> Unmutes a muted player",
    run: (data) => {
        try {
            const {player, args} = data; // Ensure args is destructured

            const setNameUnmute = args.slice(1).join(" ").replace(/["@]/g, ""); // Use args from destructured data
            if (!setNameUnmute) { // Basic validation for player name
                player.sendMessage("§cUsage: .unmute <player name>");
                return;
            }
            const targetPlayer = getPlayerByName(setNameUnmute); // Already wrapped
            if (!targetPlayer) {
              player.sendMessage(`§6[§eSafeGuard§6]§f Player §e${setNameUnmute}§f was not found`);
              return;
            }
            if (targetPlayer.name === player.name) {
                player.sendMessage(`§6[§eSafeGuard§6]§f Cannot execute this command on yourself!`);
                return;
            }
            if (!targetPlayer.isMuted) { // isMuted is a property, should be safe, but good to be in try-catch
              player.sendMessage(`§6[§eSafeGuard§6]§f Player §e${targetPlayer.name}§f is not muted.`);
              return;
            }
            
            targetPlayer.unmute(); // Already wrapped in player.js

            targetPlayer.sendMessage(`§6[§eSafeGuard§6]§f You were unmuted by §e${player.name}`);
            player.sendMessage(`§6[§eSafeGuard§6]§f Unmuted §e${targetPlayer.name}`);
            sendMessageToAllAdmins(`§6[§eSafeGuard Notify§6]§e ${player.name} §funmuted§e ${targetPlayer.name}§f!`,true); // Already wrapped
        } catch (e) {
            logDebug("[SafeGuard ERROR][unmute]", e, e.stack);
            if (data && data.player) {
                try {
                    data.player.sendMessage("§cAn error occurred while trying to unmute the player. Please check the console.");
                } catch (sendError) {
                    logDebug("[SafeGuard ERROR][unmute] Failed to send error message to command executor:", sendError, sendError.stack);
                }
            }
        }
    }
})