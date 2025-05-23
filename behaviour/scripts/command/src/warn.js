import { newCommand } from '../handle';
import { getPlayerByName,sendMessageToAllAdmins } from '../../assets/util';

newCommand({
    name: "warn",
    description: "<player> Warns a player",
    run: (data) => {
        const { player, args } = data;
        try {
            const setName = args.slice(1).join(" ").replace(/["@]/g, "").trim();

            const targetPlayer = getPlayerByName(setName);

            if (!targetPlayer) {
                player.sendMessage(`§6[§eAnti Cheats§6]§f Player §e${setName}§f was not found`);
                return;
            }

            if (targetPlayer.hasAdmin()) {
                player.sendMessage(`§6[§eAnti Cheats§6]§f Can't warn §e${targetPlayer.name}§f, they're an admin.`);
                return;
            }
            sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§e ${player.name} §fwarned the player§e ${targetPlayer.name}! §r`, true);
            targetPlayer.sendMessage(`§6[§eAnti Cheats§6]§f You were warned by the admin §e${player.name}§f!`);
            targetPlayer.setWarning("manual");
        } catch (error) {
            logDebug("[Anti Cheats Command Error][warn]", error, error.stack);
            if (player) {
                player.sendMessage("§cAn unexpected error occurred while trying to warn the player.");
            }
        }
    }
})