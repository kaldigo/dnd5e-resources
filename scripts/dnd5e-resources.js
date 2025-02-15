import Make5eConfigChanges from "./5e-config.js";
import logger from "./lib/logger.js";
import { ResourceItem } from "./classes/item.js";
import { ResourceActor } from "./classes/actor.js";

export class DnD5eResources {
    static MODULE_NAME = 'D&D 5e Resources';
    static MODULE_ID = 'dnd5e-resources';
    static FLAGS = {};
    static TEMPLATES = {
        resourceItemSettings: `modules/${DnD5eResources.MODULE_ID}/templates/resource-item-sheet.hbs`,
        spellItemSettings: `modules/${DnD5eResources.MODULE_ID}/templates/upcasting/spell-sheet.hbs`,
        itemSettings: `modules/${DnD5eResources.MODULE_ID}/templates/upcasting/item-sheet.hbs`,
        resourceActorCardBar: `modules/${DnD5eResources.MODULE_ID}/templates/resource-actor-sheet-card.hbs`,
        resourceActorDefaultSpellResource: `modules/${DnD5eResources.MODULE_ID}/templates/resource-actor-sheet-defualt-spell-resource.hbs`,
        activityUsage: {
            spellScaling: `modules/${DnD5eResources.MODULE_ID}/templates/activity-usage/spell-scaling.hbs`,
            spellResource: `modules/${DnD5eResources.MODULE_ID}/templates/activity-usage/spell-resource.hbs`,
            situationalCost: `modules/${DnD5eResources.MODULE_ID}/templates/activity-usage/situational-cost.hbs`,
            upcasting: `modules/${DnD5eResources.MODULE_ID}/templates/activity-usage/upcasting.hbs`,
            notes: `modules/${DnD5eResources.MODULE_ID}/templates/activity-usage/notes.hbs`,
        }
    };
    static ASSETS = {};
    static RULES = {}

    static init(config) {
        logger.info("Making 5e Config Changes")
        Make5eConfigChanges();

        ResourceItem.init();
        ResourceActor.init();

        if (!game.modules.get("lib-wrapper")?.active && game.user?.isGM) {
            let word = "install and activate";
            if (game.modules.get("lib-wrapper")) word = "activate";
            throw error(`Requires the 'libWrapper' module. Please ${word} it.`);
        }
    }
}

Hooks.once('init', async function() {
    DnD5eResources.init();
});

Hooks.once('ready', async function() {

});