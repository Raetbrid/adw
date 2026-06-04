export class ADWActorSheet extends ActorSheet {
  constructor(...args) {
    super(...args);
    this.selected = { id: null, quality: null };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["adw", "sheet", "actor"],
      width: 850,
      height: 900
    });
  }

  get template() {
    return this.actor.type === 'npc' ? "systems/adw/templates/npc-sheet.hbs" : "systems/adw/templates/actor-sheet.hbs";
  }

  async getData() {
    const context = super.getData();
    context.system = this.actor.system;
    
    if (this.actor.type === 'npc') return context;

    const stats = this.actor.system.stats || {};
    const leftIds = ['patience', 'vigor', 'understanding'];
    const rightIds = ['cunning', 'grace', 'persuasion'];
    const qualityKeys = ['generosity', 'selfishness', 'demonstration', 'observation', 'courage', 'wrath', 'endurance', 'defiance', 'purity', 'corruption', 'honesty', 'deceit'];

    let totalIdDots = 0;
    [...leftIds, ...rightIds].forEach(k => totalIdDots += (stats[k] || 0));
    let totalQualDots = 0;
    qualityKeys.forEach(k => totalQualDots += (stats[k] || 0));
    context.totalPoints = (Math.max(0, totalIdDots - 1) * 3) + totalQualDots;

    context.selected = this.selected;
    context.idSide = leftIds.includes(this.selected.id) ? 'Left' : (rightIds.includes(this.selected.id) ? 'Right' : null);

    const profKey = this.actor.system.profession;
    context.professionLabel = profKey ? game.i18n.localize(`ADW.Professions.${profKey}.Name`) : "";
    
    const profLinks = { "ACADEMIC": ["generosity", "demonstration"], "DETECTIVE": ["selfishness", "observation"], "DEFENDER": ["courage", "endurance"], "THUG": ["wrath", "defiance"], "INGENUE": ["purity", "honesty"], "FEMME_FATALE": ["corruption", "deceit"] };
    context.underlinedStats = profLinks[profKey] || [];

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (this.actor.type === 'npc') {
      html.find('.npc-dot').on('mousedown', ev => {
        const key = ev.currentTarget.dataset.key;
        const index = parseInt(ev.currentTarget.dataset.index);
        if (!this.actor.system.npcStats[key]) return;
        let val = (ev.button === 0) ? index : Math.max(0, this.actor.system.npcStats[key].value - 1);
        this.actor.update({[`system.npcStats.${key}.value`]: val});
      });
      html.find('.npc-roll').click(ev => {
        const stat = this.actor.system.npcStats[ev.currentTarget.dataset.key];
        this._onNpcRoll(stat.value, stat.name);
      });
      return;
    }

    html.find('.rollable').on('mousedown', ev => {
      if (ev.button === 2) return this._clearSelection();

      const prop = ev.currentTarget.dataset.prop;
      const isId = ['patience', 'cunning', 'vigor', 'grace', 'understanding', 'persuasion'].includes(prop);

      if (isId) {
        this.selected.id = (this.selected.id === prop) ? null : prop;
      } else {
        this.selected.quality = (this.selected.quality === prop) ? null : prop;
      }

      if (this.selected.id && this.selected.quality) {
        this._onRoll();
        this._clearSelection();
      } else {
        this.render();
      }
    });

    html.find('.clickable').on('mousedown', ev => {
      this._updateStat(ev.currentTarget.dataset.prop, ev.currentTarget.dataset.pair, ev.button === 2);
    });

    html.find('.profession-select').click(() => this._onSelectProfession());
    html.find('.profession-delete').click(ev => { ev.stopPropagation(); this.actor.update({ "system.profession": "" }); });
    html.find('.mod-checkbox').click(ev => {
      const val = parseInt(ev.currentTarget.dataset.value);
      this.actor.update({ "system.modifiers.value": (this.actor.system.modifiers?.value === val) ? 0 : val });
    });
    html.find('.target-icon').click(() => this.actor.update({ "system.modifiers.calledShotActive": !this.actor.system.modifiers?.calledShotActive }));
    html.find('.target-value').on('mousedown', ev => {
      let val = this.actor.system.modifiers?.calledShotValue || 10;
      val = (ev.button === 0) ? (val < 10 ? val + 1 : 1) : (val > 1 ? val - 1 : 10);
      this.actor.update({ "system.modifiers.calledShotValue": val });
    });

    html.find('.clickable, .target-value, .rollable').on('contextmenu', e => e.preventDefault());
  }

  _clearSelection() {
    this.selected = { id: null, quality: null };
    this.render();
  }

  async _onRoll() {
    const { id, quality } = this.selected;
    const stats = this.actor.system.stats;
    const mods = this.actor.system.modifiers || { value: 0, calledShotValue: 10, calledShotActive: false };

    let pool = (stats[id] || 0) + (stats[quality] || 0) + (mods.value || 0);
    let injectedDie = null;
    if (mods.calledShotActive) { pool -= 2; injectedDie = mods.calledShotValue; }
    pool = Math.max(Math.min(pool, 10), 0);

    let r = new Roll(`${pool}d10`);
    if (pool > 0) await r.evaluate();
    let results = pool > 0 ? r.terms[0].results.map(d => d.result) : [];
    if (injectedDie !== null) results.push(injectedDie);

    const label = `${game.i18n.localize("ADW.Stats."+id.charAt(0).toUpperCase()+id.slice(1))} + ${game.i18n.localize("ADW.Stats."+quality.charAt(0).toUpperCase()+quality.slice(1))}`;
    this._renderOreChat(results, label, mods.calledShotActive ? ` (Called ${mods.calledShotValue})` : "", pool, r);
  }
  
  async _onNpcRoll(pool, label) {
    if (pool <= 0) return ui.notifications.warn(game.i18n.localize("ADW.Roll.NoDiceWarning"));
    let r = new Roll(`${pool}d10`);
    await r.evaluate();
    const results = r.terms[0].results.map(d => d.result);
    this._renderOreChat(results, label, "", pool, r);
  }

  _renderOreChat(results, label, sublabel, pool, rollObj) {
    const counts = {};
    results.forEach(num => counts[num] = (counts[num] || 0) + 1);
    let sets = []; let loose = [];
    for (let [height, width] of Object.entries(counts)) {
      let h = parseInt(height);
      if (width > 1) sets.push({ width: width, height: h });
      else loose.push(h);
    }
    sets.sort((a, b) => b.width - a.width || b.height - a.height);
    loose.sort((a, b) => b - a);

    let chatHtml = `<div class="adw-roll" style="text-align: center; font-family: 'Marcellus', serif; color: black;">
        <div style="border-bottom: 2px solid black; margin-bottom: 10px; font-weight: bold; text-transform: uppercase;">
            ${label}${sublabel}
        </div>`;

    if (sets.length > 0) {
      sets.forEach(s => {
        let dots = "●".repeat(s.width);
        chatHtml += `<div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin: 6px 0;">
            <span style="font-size: 1.5em; font-weight: bold; width: 25px; text-align: right;">${s.width}</span>
            <span style="letter-spacing: 3px; font-size: 1.2em;">${dots}</span>
            <span style="display: inline-block; width: 26px; height: 26px; border: 2px solid black; border-radius: 50%; text-align: center; line-height: 23px; font-weight: bold;">${s.height}</span>
        </div>`;
      });
    } else chatHtml += `<div style="margin: 10px 0; font-style: italic; opacity: 0.6;">${game.i18n.localize("ADW.Roll.NoMatches")}</div>`;

    if (loose.length > 0) {
      chatHtml += `<div style="margin-top: 12px; border-top: 1px solid black; padding-top: 8px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px;">`;
      loose.forEach(val => { 
        chatHtml += `<div style="width: 22px; height: 22px; border: 1px solid black; border-radius: 2px; font-size: 0.9em; font-weight: bold; line-height: 21px; text-align: center;">${val}</div>`; 
      });
      chatHtml += `</div>`;
    }
    chatHtml += `</div>`;

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: chatHtml,
      roll: pool > 0 ? rollObj : null,
      type: CONST.CHAT_MESSAGE_TYPES.ROLL
    });
  }

  async _onSelectProfession() {
    const profKeys = ["ACADEMIC", "DETECTIVE", "DEFENDER", "THUG", "INGENUE", "FEMME_FATALE"];
    
    let content = `<div class="prof-dialog" style="font-family: 'Marcellus', serif; font-size: 1.1em;">`;
    
    for (let key of profKeys) {
      const name = game.i18n.localize(`ADW.Professions.${key}.Name`);
      const desc = game.i18n.localize(`ADW.Professions.${key}.Desc`);
      
      content += `<label style="display:block; margin-bottom:12px; cursor:pointer;">
        <input type="radio" name="prof" value="${key}"> <strong style="font-size: 1.2em;">${name}</strong><br>
        <small style="font-size: 0.95em; line-height: 1.3; display: block; margin-top: 4px;">${desc}</small>
      </label>`;
    }
    content += `</div>`;

    new Dialog({
      title: game.i18n.localize("ADW.Professions.DialogTitle"),
      content: content,
      buttons: {
        select: { label: game.i18n.localize("ADW.Professions.Select"), callback: (html) => {
          const prof = html.find('input[name="prof"]:checked').val();
          if (prof) this.actor.update({ "system.profession": prof });
        }}
      }
    }).render(true);
  }

  async _updateStat(prop, pair, isDecrease) {
    const stats = foundry.utils.duplicate(this.actor.system.stats);
    let val = stats[prop];
    let pairVal = stats[pair];
    if (isDecrease) { if (val > 0) val--; }
    else { if (val < 5 && (val + pairVal < 7)) val++; else return ui.notifications.warn(game.i18n.localize("ADW.Notifications.LimitReached")); }
    await this.actor.update({ [`system.stats.${prop}`]: val });
  }
}