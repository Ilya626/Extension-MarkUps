// Live note state belongs to the chat UI, not to a particular RP message.
export function renderLiveNotes(scope, { enabled, onCollapse, onEdit }) {
    let panel = document.getElementById('mu_live_panel');
    if (!enabled || !scope || scope.record.uiPlacement === 'messages') { panel?.remove(); return; }
    if (panel?.dataset.chatKey !== scope.chatKey) { panel?.remove(); panel = null; }
    const { record, bank } = scope;
    if (!panel) {
        panel = document.createElement('details'); panel.id = 'mu_live_panel'; panel.className = 'mu-live-panel';
        panel.dataset.chatKey = scope.chatKey; panel.open = !record.panelCollapsed;
        const heading = document.createElement('summary');
        const title = document.createElement('strong'); title.className = 'mu-live-title';
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'menu_button mu-live-edit'; edit.textContent = 'Edit notes';
        edit.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); onEdit(); });
        heading.append(title, edit);
        const content = document.createElement('div'); content.className = 'mu-live-content';
        panel.append(heading, content);
        panel.addEventListener('toggle', event => {
            if (event.target !== panel || !panel.isConnected) return;
            const current = panel.muScope;
            if (Boolean(current.record.panelCollapsed) !== !panel.open) { current.record.panelCollapsed = !panel.open; onCollapse(current); }
        });
    }
    panel.muScope = scope;
    panel.open = !record.panelCollapsed;
    const notes = record.bindings.flatMap(ref => {
        const note = bank.instances[ref.id]; return note?.visible ? [{ key: ref.key, note }] : [];
    });
    panel.querySelector('.mu-live-title').textContent = `Notes · ${notes.length} ${notes.length === 1 ? 'list' : 'lists'}`;
    const signature = JSON.stringify(notes);
    if (panel.muContentSignature !== signature) {
        panel.muContentSignature = signature;
        const body = panel.querySelector('.mu-live-content'); body.replaceChildren();
        for (const { key, note } of notes) {
            const list = document.createElement('details'); list.className = 'mu-live-list'; list.dataset.noteKey = key; list.open = !record.collapsedLists?.[key];
            const summary = document.createElement('summary');
            const title = document.createElement('strong'); title.textContent = note.title;
            const usage = document.createElement('span'); usage.className = `mu-usage${note.tokens > note.limit ? ' mu-over' : ''}`;
            usage.textContent = `${note.entries.length} ${note.entries.length === 1 ? 'entry' : 'entries'} · ${note.tokens} / ${note.limit} tokens`;
            summary.append(title, usage); list.append(summary);
            if (note.entries.length) {
                const entries = document.createElement('ul');
                for (const entry of note.entries) { const item = document.createElement('li'); item.textContent = entry.text; entries.append(item); }
                list.append(entries);
            } else {
                const empty = document.createElement('p'); empty.className = 'mu-muted';
                empty.textContent = 'No entries yet. Ask the AI to keep a list, or add entries with Edit notes.'; list.append(empty);
            }
            list.addEventListener('toggle', event => {
                if (event.target !== list || !list.isConnected) return;
                const current = panel.muScope;
                current.record.collapsedLists ??= {};
                if (Boolean(current.record.collapsedLists[key]) !== !list.open) { current.record.collapsedLists[key] = !list.open; onCollapse(current); }
            });
            body.append(list);
        }
        if (!notes.length) { const empty = document.createElement('p'); empty.className = 'mu-muted'; empty.textContent = 'No visible lists. Use Edit notes to show a notebook.'; body.append(empty); }
    }
    const chat = document.getElementById('chat'), composer = document.getElementById('form_sheld');
    panel.classList.toggle('mu-live-in-chat', record.uiPlacement !== 'above_input');
    if (record.uiPlacement === 'above_input') {
        if (composer && panel.nextElementSibling !== composer) composer.before(panel);
    } else if (chat) {
        const index = scope.ctx.chat.findLastIndex(message => !message.is_user && !message.is_system);
        const reply = chat.querySelector(`.mes[mesid="${index}"]`);
        if (record.uiPlacement === 'between_messages') {
            const userIndex = scope.ctx.chat.findLastIndex(message => message.is_user && !message.is_system);
            const newest = chat.querySelector(`.mes[mesid="${Math.max(index, userIndex)}"]`);
            if (index >= 0 && userIndex >= 0 && newest) { if (panel.nextElementSibling !== newest) newest.before(panel); }
            else if (newest) { if (panel.previousElementSibling !== newest) newest.after(panel); }
            else if (panel.parentElement !== chat) chat.append(panel);
        }
        else if (!reply) { if (panel.parentElement !== chat || panel !== chat.lastElementChild) chat.append(panel); }
        else if (record.uiPlacement === 'before_ai') { if (panel.nextElementSibling !== reply) reply.before(panel); }
        else if (panel.previousElementSibling !== reply) reply.after(panel);
    }
}
