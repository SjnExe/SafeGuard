import { newCommand } from '../handle';
import * as config from '../../config';

// Define a reusable function to get the version message
export function getSafeGuardVersionMessage() {
    return `§r§6[§eSafeGuard§6]§f Version: §ev${config.default.version}`;
}

newCommand({
    name:"version",
    description: "Shows the pack version",
    adminOnly: false,
    run: (data) => {
        try {
            data.player.sendMessage(getSafeGuardVersionMessage()); // API Call
        } catch (e) {
            logDebug("[SafeGuard ERROR][version]", e, e.stack);
            // Attempt to notify the player if possible, though sendMessage itself might be the issue
            if (data && data.player) {
                try {
                    // Avoid calling sendMessage if it's the source of the error
                    if (e.message && !e.message.includes("sendMessage")) {
                         data.player.sendMessage("§cAn error occurred while trying to display the version. Please check the console.");
                    }
                } catch (sendError) {
                    logDebug("[SafeGuard ERROR][version] Failed to send error message to command executor:", sendError, sendError.stack);
                }
            }
        }
    }
})