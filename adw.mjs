import { ADWActorSheet } from "./module/actor-sheet.mjs";

Hooks.once("init", async function() {
  console.log("ADW | Initializing A Dirty World");

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("adw", ADWActorSheet, { makeDefault: true });

Handlebars.registerHelper('drawDots', function(currentValue, isReverse = false) {
    let html = "";
    for (let i = 1; i <= 5; i++) {
        const cls = i <= currentValue ? "filled" : "";
        html += `<span class="dot ${cls}"></span>`;
    }
    return new Handlebars.SafeString(html);
});

Handlebars.registerHelper('numLoop10', function(currentValue, key, options) {
    let html = "";
    for (let i = 1; i <= 10; i++) {
        const cls = i <= currentValue ? "filled" : "";
        html += options.fn({ class: cls, index: i, key: key });
    }
    return html;
});

Handlebars.registerHelper('isUnderlined', function(stat, list) {
    return (list || []).includes(stat) ? 'underlined' : '';
});

Handlebars.registerHelper('numLoopRange', function(from, to, options) {
    let accum = '';
    for (let i = from; i <= to; i++) {
        if (i === 0) continue;
        accum += options.fn({value: i});
    }
    return accum;
});
});