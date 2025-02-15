import { DnD5eResources } from "../dnd5e-resources.js";
import { ResourceActor } from "./actor.js";

export class ResourceItem {
	static init() {
		Hooks.on("preUpdateItem", (data, changes, options, user) => {
			if (data.actor && data.type == "feat" && data.system.type.value == "resource" && data.flags["dnd5e-resources"].spellCasting && data.flags["dnd5e-resources"].calculateUsesFromSpellSlots) {
				ResourceItem.calculateUsesFromSpellSlots(data, changes);
			}
		});

		Hooks.on("renderItemSheet", (app, html) => {
			if (ResourceItem.isResourceItem(app.item)) ResourceItem.renderItemSheetElement(app, html, DnD5eResources.TEMPLATES.resourceItemSettings);

			if (ResourceItem.isSpellItem(app.item)) {
				if (ResourceItem.isLeveledSpellItem(app.item)) ResourceItem.renderItemSheetElement(app, html, DnD5eResources.TEMPLATES.spellItemSettings);
				else ResourceItem.cleanFlags(app.item);
			} else ResourceItem.renderItemSheetElement(app, html, DnD5eResources.TEMPLATES.itemSettings);
		});

		Hooks.on("renderActivityUsageDialog", (app, html) => {
			ResourceItem.renderActivityUsageDialog(app, html);
		});

		Hooks.on("dnd5e.preActivityConsumption", (activity, usageConfig, messageConfig) => {
			ResourceItem.preActivityConsumption(activity, usageConfig, messageConfig);
		});

		Hooks.on("dnd5e.activityConsumption", (activity, usageConfig, messageConfig, updates) => {
			ResourceItem.activityConsumption(activity, usageConfig, messageConfig, updates);
		});

		Hooks.on("renderChatMessage", (message, html, messageData) => {
			ResourceItem.renderChatMessage(message, html, messageData);
		});
	}

	static isResourceItem(item) {
		return item.type == "feat" && item.system.type.value == "resource";
	}

	static isSpellItem(item) {
		return item.type == "spell";
	}

	static isLeveledSpellItem(item) {
		return item.type == "spell" && item.system.level > 0;
	}

	static get defaultResourceSettings() {
		return {
			showResourceBar: false,
			resourceBarColorL: "#3a0e5f",
			resourceBarColorR: "#8a40c7",
			spellCasting: false,
			spellSlot: {
				lvl1: 2,
				lvl2: 3,
				lvl3: 5,
				lvl4: 6,
				lvl5: 7,
				lvl6: 9,
				lvl7: 10,
				lvl8: 11,
				lvl9: 13,
			},
			calculateUsesFromSpellSlots: false,
			allowSituationalCost: false,
		};
	}

	static get defaultItemSettings() {
		return {
			upcasting: false,
			upcastingCost: 1,
			upcastingLimit: 3,
			upcastingCap: true,
			brutalUpcasting: false,
		};
	}

	static async cleanFlags(item) {
		if (typeof item.flags["dnd5e-resources"] !== "undefined") {
			await item.setFlag("dnd5e-resources", "upcasting", false);
			await item.setFlag("dnd5e-resources", "brutalUpcasting", false);
		}
	}

	static setDefaultResourceValues(item) {
		let defaultConfig = ResourceItem.defaultItemSettings;
		if (ResourceItem.isResourceItem(item)) defaultConfig = { ...ResourceItem.defaultResourceSettings, ...defaultConfig };
		let config = typeof item.flags["dnd5e-resources"] !== "undefined" ? item.flags["dnd5e-resources"] : {};

		config = foundry.utils.mergeObject(config, defaultConfig, { recursive: true, insertKeys: true, insertValues: true, overwrite: false });

		if (ResourceItem.isLeveledSpellItem(item)) config.upcasting = config.brutalUpcasting;

		item.flags["dnd5e-resources"] = config;

		return item;
	}

	static async calculateUsesFromSpellSlots(item, changes) {
		const spellSlots = item.actor.system.spells;

		const defaultConfig = ResourceItem.defaultSettings;
		let config = typeof item.flags["dnd5e-resources"] !== "undefined" ? item.flags["dnd5e-resources"] : {};
		config = foundry.utils.mergeObject(config, defaultConfig, { recursive: true, insertKeys: true, insertValues: true, overwrite: false });
		const spellCost = config.spellSlot;

		const uses =
			spellSlots.spell1.max * spellCost.lvl1 +
			spellSlots.spell2.max * spellCost.lvl2 +
			spellSlots.spell3.max * spellCost.lvl3 +
			spellSlots.spell4.max * spellCost.lvl4 +
			spellSlots.spell5.max * spellCost.lvl5 +
			spellSlots.spell6.max * spellCost.lvl6 +
			spellSlots.spell7.max * spellCost.lvl7 +
			spellSlots.spell8.max * spellCost.lvl8 +
			spellSlots.spell9.max * spellCost.lvl9;

		if (uses != item.system.uses.max && uses != changes.system?.uses?.max) {
			let changes = {
				system: {
					uses: {
						max: `${uses}`,
					},
				},
			};

			item.update(changes);
		}
	}

	static async renderItemSheetElement(app, html, template) {
		const item = ResourceItem.setDefaultResourceValues(app.item);
		const renderedHtml = await renderTemplate(template, item);

		$(".sheet-body .tab.details fieldset legend:contains('Usage')", html).parent().before(renderedHtml);
	}

	static async renderActivityUsageDialog(app, html) {
		// Exit early if spell slot consumption is not enabled
		if (!app?.options?.config?.consume?.spellSlot) return;

		// Retrieve actor spellcasting configuration
		const actorConfig = ResourceActor.setDefaultValues(app.actor).flags["dnd5e-resources"];
		if (!actorConfig?.selectedSpellcastingResource?.id) return;

		// Locate the Scaling section in the HTML
		let scalingElement = $(".window-content fieldset legend:contains('Scaling')", html);
		if (scalingElement.length == 0) return;
		scalingElement = scalingElement.parent().parent();

		// Initialize spellcasting resource configurations
		app.config.spellcastingResource = app.config.spellcastingResource ?? actorConfig.selectedSpellcastingResource.id;
		app.config.situationalCost = app.config.situationalCost ?? 0;
		app.config.resources = { spellcasting: actorConfig.spellcastingResources };

		const spellSlotElement = $("section[data-application-part='scaling']", html);

		// Determine selected spell level and limits
		let selectedLevel = app.config.spell.slot ?? app.options.config.spell.slot;
		const minimumLevel = app.item.system.level ?? 1;
		const maximumLevel = Object.values(app.actor.system.spells).reduce((max, d) => (d.max ? Math.max(max, d.level) : max), 0);
		const consumeSlot = app.config.consume?.spellSlot;

		// Handle non-slot-based spellcasting resources
		if (app.config.spellcastingResource !== "slots") {
			const resourceItem = app.actor.items.contents.find((i) => i._id == app.config.spellcastingResource);
			const resourceItemConfig = resourceItem.flags["dnd5e-resources"];
			const spellContext = { notes: [] };

			// Generate spell slot options
			const spellSlotOptions = Object.entries(app.actor.system.spells)
				.map(([value, slot]) => {
					if (slot.level < minimumLevel || slot.level > maximumLevel || slot.type !== "leveled") return null;
					const spellLevelCost = resourceItemConfig.spellSlot["lvl" + slot.level];
					const resourceRemaining = resourceItem?.system?.uses?.value ?? 0;

					let label = `${slot.label} (${spellLevelCost} ${resourceItem.name})`;
					const disabled = spellLevelCost > resourceRemaining && consumeSlot;
					if (!disabled && !selectedLevel) selectedLevel = value;

					return { value, label, disabled, selected: selectedLevel === value && !disabled };
				})
				.filter(Boolean);

			// Set spell slot selection context
			spellContext.spellSlots = {
				field: new foundry.data.fields.StringField({ label: game.i18n.localize("DND5E.SpellCastUpcast") }),
				name: "spell.slot",
				value: app.config.spell?.slot,
				options: spellSlotOptions,
			};

			// Warn if no available resources
			if (!spellSlotOptions.some((o) => !o.disabled)) {
				spellContext.notes.push({
					type: "warn",
					message: `You have no available ${resourceItem.name} with which to cast ${app.item.name}!`,
				});
				spellContext.spellSlots.value = null;
			}

			// Render spell scaling UI
			const spellScalingHtml = await renderTemplate(DnD5eResources.TEMPLATES.activityUsage.spellScaling, spellContext);
			spellSlotElement.find("select[name='spell.slot']").closest(".form-group").replaceWith(spellScalingHtml);

			// Render warning messages if applicable
			const spellScalingNotesHtml = await renderTemplate(DnD5eResources.TEMPLATES.activityUsage.notes, spellContext);
			let noteElement = spellSlotElement.find(".note.warn");
			if (noteElement.length == 0) spellSlotElement.append(spellScalingNotesHtml);
			else noteElement.replaceWith(spellScalingNotesHtml);
		}

		// Upcasting logic
		const upcastContext = [];
		const itemConfig = ResourceItem.setDefaultResourceValues(app.item).flags["dnd5e-resources"];
		let upcastingResources = actorConfig.upcastingResources;
		if (itemConfig.upcasting) {
			upcastingResources[app.options.activity.item._id] = {
				itemId: app.options.activity.item._id,
				label: app.options.activity.item.name,
				cost: itemConfig.upcastingCost,
				limt: itemConfig.upcastingLimit,
				cap: itemConfig.upcastingCap,
				brutal: itemConfig.brutalUpcasting,
			};
		}
		app.config.resources.upcasting = app.config.resources.upcasting ?? upcastingResources;

		// Determine spell level with upcasting
		const totalUpcastLevels = Object.values(app.config.resources.upcasting).reduce((sum, item) => sum + (item.selected || 0), 0);
		const currentSpellLevel = Number(selectedLevel.split("spell")[1]) + totalUpcastLevels;
		const maxSpellLevel = Math.max(...Object.keys(CONFIG.DND5E.spellLevels).map(Number));

		// Generate upcasting options array
		for (const [upcastingId, upcastingResource] of Object.entries(app.config.resources.upcasting)) {
			const field = new foundry.data.fields.StringField({ label: upcastingResource.label });
			const name = `resources.upcasting.${upcastingId}.selected`;
			const selectElement = $(`select[name="${name}"]`, html);
			const value = selectElement.length === 0 ? 0 : Number(selectElement.val());
			app.config.resources.upcasting[upcastingId].selected = value;

			let resourceItem = upcastingResource.itemId && !upcastingResource.brutal ? app.actor.items.contents.find((i) => i._id == upcastingResource.itemId) ?? null : null;

			// Generate upcasting options
			const options = Array.from({ length: upcastingResource.limt + 1 }, (_, i) => {
				const upcastCost = i * upcastingResource.cost;
				let hasResources = upcastingResource.brutal ? upcastCost < Math.floor(app.actor.system.attributes.hp.value) : resourceItem?.system?.uses?.value >= upcastCost;

				const castCap = upcastingResource.cap ? maximumLevel : maxSpellLevel;
				const castLevel = currentSpellLevel + i;
				const overCap = castLevel > castCap;

				let label = `${i} Levels`;
				if (upcastingResource.cost > 0) label += ` (${upcastCost} ${upcastingResource.brutal ? "Hit Points" : resourceItem.name})`;

				const disabled = !(hasResources && !overCap) && consumeSlot;
				return { value: i, label, disabled, selected: value === i && !disabled };
			});
			upcastContext.push({ field, name, value, options });
		}

		// Store upcasting options in the configuration
		app.config.resources.upcastingOptions = upcastContext;
		// Check if multiple spellcasting resources are available
		app.config.resources.hasResources = Object.keys(app.config.resources.spellcasting).length > 1;
		// Determine if upcasting options exist
		app.config.resources.hasUpcasting = Object.keys(app.config.resources.upcasting).length > 0;

		// Render spell resource UI
		const spellResourceHtml = await renderTemplate(DnD5eResources.TEMPLATES.activityUsage.spellResource, app.config);
		const spellResourceElement = $("section[data-resource-part='resource']", html);
		if (spellResourceElement.length == 0) scalingElement.before(spellResourceHtml);
		else spellResourceElement.replaceWith(spellResourceHtml);

		// Render upcasting UI
		const upcastingHtml = await renderTemplate(DnD5eResources.TEMPLATES.activityUsage.upcasting, app.config);
		const upcastingElement = $("section[data-resource-part='upcasting']", html);
		if (upcastingElement.length == 0) spellSlotElement.after(upcastingHtml);
		else upcastingElement.replaceWith(upcastingHtml);
	}

	static preActivityConsumption(activity, usageConfig, messageConfig) {
		if (usageConfig.consume.spellSlot && usageConfig.spellcastingResource !== "slots") {
			usageConfig.consume.spellSlot = false;
			usageConfig.consume.spellcastingResource = true;
		}
	}

	static activityConsumption(activity, usageConfig, messageConfig, updates) {
		if (usageConfig.consume.spellcastingResource) {
			const errors = [];

			const resourceItem = activity.actor.items.contents.find((i) => i._id == usageConfig.spellcastingResource);

			if (usageConfig.spell.slot == "") {
				errors.push(new dnd5e.dataModels.activity.ConsumptionError(`You do not have enough ${resourceItem.name} available with which to cast ${activity.item.name}`));
			} else {
				const resourceItemConfig = resourceItem.flags["dnd5e-resources"];
				const spellLevel = activity.actor.system.spells[usageConfig.spell.slot].level;
				const spellLevelCost = resourceItemConfig.spellSlot["lvl" + spellLevel];
				const spellPointsSpent = Math.max(resourceItem.system.uses.spent + spellLevelCost + usageConfig.situationalCost, 0);

				if (spellPointsSpent > resourceItem.system.uses.max) errors.push(new dnd5e.dataModels.activity.ConsumptionError(`You do not have enough ${resourceItem.name} available with which to cast ${activity.item.name}`));

				updates.item.push({
					_id: resourceItem._id,
					"system.uses.spent": spellPointsSpent,
				});

				let upcastingLevels = 0;
				for (const upcastingSource of Object.values(usageConfig.resources.upcasting)) {
					if (upcastingSource.cost == 0) {
						upcastingLevels += Number(upcastingSource.selected);
						continue;
					}

					if (upcastingSource.brutal) {
						upcastingLevels += Number(upcastingSource.selected);

						const upcastCost = upcastingSource.selected;
						if (upcastCost == 0) continue;

						const newHP = activity.actor.system.attributes.hp.value - upcastCost;

						if (newHP <= 0) errors.push(new dnd5e.dataModels.activity.ConsumptionError(`You do not have enough Hit Points available with which to upcast ${activity.item.name}`));

						if (!updates.actor._id) updates.actor._id = activity.actor._id;
						foundry.utils.mergeObject(updates.actor, { ["system.attributes.hp.value"]: newHP });

						continue;
					}

					if (upcastingSource.itemId) {
						upcastingLevels += Number(upcastingSource.selected);

						const upcastingItem = activity.actor.items.contents.find((i) => i._id == upcastingSource.itemId);
						const upcastingItemConfig = upcastingItem.flags["dnd5e-resources"];
						const upcastCost = upcastingSource.selected * upcastingItemConfig.upcastingCost;
						if (upcastCost == 0) continue;

						const upcastSpent = upcastingItem.system.uses.spent + upcastCost;

						if (upcastSpent > upcastingItem.system.uses.max) errors.push(new dnd5e.dataModels.activity.ConsumptionError(`You do not have enough ${upcastingItem.name} available with which to upcast ${activity.item.name}`));

						let existingUpdate = updates.item.find((update) => update._id === upcastingItem._id);

						if (existingUpdate) {
							existingUpdate["system.uses.spent"] += upcastCost;
						} else {
							updates.item.push({
								_id: upcastingItem._id,
								"system.uses.spent": upcastSpent,
							});
						}

						continue;
					}

					errors.push(new dnd5e.dataModels.activity.ConsumptionError(`Invalid upcasting source selected for ${activity.item.name}`));
				}

				const maxSpellLevel = Math.max(...Object.keys(CONFIG.DND5E.spellLevels).map(Number));
				const spellCastLevel = spellLevel + upcastingLevels;
				const scaling = usageConfig.scaling;
				if (spellCastLevel > maxSpellLevel) errors.push(new dnd5e.dataModels.activity.ConsumptionError(`You cannot upcast ${activity.item.name} beyond level ${maxSpellLevel}`));

				usageConfig.scaling = scaling + upcastingLevels;
				try {
					messageConfig.data.flags.dnd5e.scaling = scaling + upcastingLevels;
					messageConfig.data.flags.dnd5e.use.spellLevel = spellCastLevel;

					messageConfig.data.flags.dnd5e.use.config = usageConfig;
					messageConfig.data.flags.dnd5e.use.resourceUsed = true;
				} catch (e) {}
			}

			if (errors.length > 0) {
				errors.forEach((err) => ui.notifications.error(err.message, { console: true }));
				return false;
			}
		}
	}

	static renderChatMessage(message, html, messageData) {
		const consumedFlag = message.getFlag("dnd5e", "use.consumed");
		const resourceFlag = message.getFlag("dnd5e", "use.resourceUsed");

		const buttonsContainer = $(".card-buttons", html);

		if (!consumedFlag && !!resourceFlag) {
			const consumeButton = buttonsContainer.find("button[data-action='consumeResource']");
			consumeButton.hide();
			const newConsumeButton = $(`<button type="button" data-resource-action="consumeResource"><i class="fa-solid fa-cubes-stacked" inert=""></i> <span>Consume Resource</span></button>`);

			newConsumeButton.on("click", async (event) => {
				const messageConfig = {};
				const usageConfig = message.getFlag("dnd5e", "use.config");
				const sourceActivity = fromUuidSync(message.getFlag("dnd5e", "activity.uuid"));
				const linkedActivity = sourceActivity.getLinkedActivity(message.getFlag("dnd5e", "use.cause"));
				if (linkedActivity)
					usageConfig.cause = {
						activity: linkedActivity.relativeUUID,
						resources: linkedActivity.consumption.targets.length > 0,
					};
				await sourceActivity.consume(usageConfig, messageConfig);
				if (!foundry.utils.isEmpty(messageConfig.data)) await message.update(messageConfig.data);
			});

			buttonsContainer.append(newConsumeButton);
		} else {
			buttonsContainer.find("button[data-resource-action='consumeResource']").remove();
		}
	}

	static getLinkedActivity(relativeUUID) {
		if (!this.actor) return null;
		relativeUUID ??= this.item.getFlag("dnd5e", "cachedFor");
		return fromUuidSync(relativeUUID, { relative: this.actor, strict: false });
	}
}
