import { DnD5eResources } from "../dnd5e-resources.js";

export class ResourceActor {
	static init() {
		Hooks.on("renderActorSheet5eCharacter2", (app, html, data) => {
			ResourceActor.alterCharacterSheet(app, html, data);
		});
	}

	static get defaultSettings() {
		return {
			selectedSpellcastingResource: {
				id: "slots",
				name: "Spell Slots",
			},
			spellcastingResources: {
				slots: "Spell Slots",
			},
			upcastingResources: {},
			externalUpcastingResources: {},
		};
	}

	static setDefaultValues(actor) {
		const defaultConfig = ResourceActor.defaultSettings;
		let config = typeof actor.flags["dnd5e-resources"] !== "undefined" ? actor.flags["dnd5e-resources"] : {};

		config = foundry.utils.mergeObject(config, defaultConfig, { recursive: true, insertKeys: true, insertValues: true, overwrite: false });

		config.spellcastingResources = ResourceActor.getSpellcastingResources(actor);
		config.upcastingResources = ResourceActor.getUpcastingResources(actor, config);

		if (typeof config.selectedSpellcastingResource == "string") {
			var resouceID = config.selectedSpellcastingResource;
			config.selectedSpellcastingResource = {
				id: resouceID,
			};
		}

		config.selectedSpellcastingResource.name = config.spellcastingResources[config.selectedSpellcastingResource.id];

		actor.flags["dnd5e-resources"] = config;

		return actor;
	}

	static async alterCharacterSheet(app, html, data) {
		await ResourceActor.addResourceBars(app, html, data);
		await ResourceActor.addDefaultSpellResource(app, html, data);
	}

	static async addResourceBars(app, html, data) {
		console.log("addResourceBars", { app, html, data });
		const charCard = $(".main-content .sidebar .card .stats", html);
		const items = app.actor.items.contents.filter((i) => i.type === "feat" && i.system.type.value === "resource" && i.flags["dnd5e-resources"]?.showResourceBar);

		for (const item of items) {
			var hexcolor = item.flags["dnd5e-resources"].resourceBarColorL;

			if (hexcolor.slice(0, 1) === "#") {
				hexcolor = hexcolor.slice(1);
			}

			var r = parseInt(hexcolor.substr(0, 2), 16);
			var g = parseInt(hexcolor.substr(2, 2), 16);
			var b = parseInt(hexcolor.substr(4, 2), 16);

			var yiq = (r * 299 + g * 587 + b * 114) / 1000;

			item.flags["dnd5e-resources"].textColor = yiq >= 128 ? "dark-text" : "light-text";

			item.system.uses.pct = Math.round((item.system.uses.value / item.system.uses.max) * 100);
			let renderedHtml = $(await renderTemplate(DnD5eResources.TEMPLATES.resourceActorCardBar, item));

			if (app.isEditable) {
				$(".meter.resource", renderedHtml).on("click", (event) => ResourceActor.toggleEditResource(event, true, item));
				$(".meter.resource > input", renderedHtml).on("blur", (event) => ResourceActor.toggleEditResource(event, false, item));
				$(".meter.resource > input", renderedHtml).on("keydown", (event) => {
					if (event.key === "Enter") event.currentTarget.blur();
				});
			}

			charCard.append(renderedHtml);
		}
	}

	static async addDefaultSpellResource(app, html, data) {
		const spellTab = $(".main-content .tab-body .tab.spells", html);
		const spellTop = $(".top", spellTab);
		const actor = ResourceActor.setDefaultValues(app.actor);
		actor.editable = data.editable;

		let renderedHtml = $(await renderTemplate(DnD5eResources.TEMPLATES.resourceActorDefaultSpellResource, actor));
		spellTop.after(renderedHtml);

		if (actor.flags["dnd5e-resources"].selectedSpellcastingResource.id != "slots") {
			$(".inventory-element .spells-list .items-section .pips", spellTab).hide();
		} else {
			$(".inventory-element .spells-list .items-section .pips", spellTab).show();
		}
	}

	static getSpellcastingResources(actor) {
		const items = actor.items.contents.filter((i) => i.type === "feat" && i.system.type.value === "resource" && i.flags["dnd5e-resources"]?.spellCasting);

		let resources = ResourceActor.defaultSettings.spellcastingResources;

		for (const item of items) {
			resources[item._id] = item.name;
		}

		return resources;
	}

	static getUpcastingResources(actor, config) {
		const items = actor.items.contents.filter((i) => i.type !== "spell" && i.flags["dnd5e-resources"]?.upcasting);

		let upcastingConfigs = {};

		for (const item of items) {
			upcastingConfigs[item._id] = {
				itemId: item._id,
				label: item.name,
				cost: item.flags["dnd5e-resources"].upcastingCost,
				limt: item.flags["dnd5e-resources"].upcastingLimit,
				cap: item.flags["dnd5e-resources"].upcastingCap,
				brutal: item.flags["dnd5e-resources"].brutalUpcasting,
			};
		}

		upcastingConfigs = foundry.utils.mergeObject(upcastingConfigs, config.externalUpcastingResources, { recursive: true, insertKeys: true, insertValues: true, overwrite: false });

		return upcastingConfigs;
	}

	static toggleEditResource(event, edit, item) {
		const target = event.currentTarget.closest(".resource");
		const label = target.querySelector(":scope > .label");
		const input = target.querySelector(":scope > input");
		label.hidden = edit;
		input.hidden = !edit;
		if (edit) {
			input.focus();
			input.select();
		} else {
			const value = parseInt(input.value);
			const spent = item.system.uses.max - value;
			item.update({ system: { uses: { spent } } });
		}
	}
}
