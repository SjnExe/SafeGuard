import { newCommand } from '../handle';

newCommand({
    name:"vanish",
    description:"Toggles vanish mode",
    run: (data) => {
        try {
            data.player.runCommand("function admin_cmds/vanish"); // API Call
        } catch (e) {
            logDebug("[SafeGuard ERROR][vanish]", e, e.stack);
            if (data && data.player) {
                try {
                    data.player.sendMessage("§cAn error occurred while trying to toggle vanish. Please check the console.");
                } catch (sendError) {
                    logDebug("[SafeGuard ERROR][vanish] Failed to send error message to command executor:", sendError, sendError.stack);
                }
            }
        }
    }
})