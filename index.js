import { COMMAND_PATTERN, HIDE_PATTERN, parseCommands, stripCommands, contentText, newNote, newId, applyCommands, markedPost } from './commands.js';
import { exportNotes, parseNotes, importNotes } from './note-files.js';

const KEY = 'markups';
const REGEX_ID = 'markups-command-cleanup-v1';
let work = Promise.resolve();
let native;
let promptSources = [];
const BEFORE_START = '<markups_before_chat>';
const BEFORE_END = '</markups_before_chat>';

function status(text) { $('#mu_status').text(text); }
function run(action) {
    work = work.then(action).catch(error => {
        console.error('[MarkUps]', error);
        status(error.message);
        toastr.error(error.message, 'MarkUps');
    });
    return work;
}

function settings() {
    const ctx = SillyTavern.getContext();
    return ctx.extensionSettings[KEY] ??= { enabled: true };
}

function scope() {
    const ctx = SillyTavern.getContext();
    const card = ctx.characters[ctx.characterId];
    if (ctx.groupId || !card || !ctx.chatId) return null;
    card.data ??= {};
    card.data.extensions ??= {};
    const bank = card.data.extensions[KEY] ??= { version: 1, instances: {}, chats: {} };
    let meta = ctx.chatMetadata[KEY];
    if (!meta || !bank.chats[meta.chatKey]) {
        const existing = Object.entries(bank.chats).find(([, chat]) => chat.name === ctx.chatId);
        meta = ctx.chatMetadata[KEY] = { chatKey: existing?.[0] || newId(), card: card.avatar };
    }
    meta.card = card.avatar;
    let record = bank.chats[meta.chatKey];
    if (!record) {
        record = bank.chats[meta.chatKey] = { name: ctx.chatId, position: 'after_user', depth: 0, bindings: [] };
        for (const key of ['visible', 'hidden']) {
            const note = newNote(key, key === 'visible');
            bank.instances[note.id] = note;
            record.bindings.push({ key, id: note.id });
        }
    }
    record.name = ctx.chatId;
    return { ctx, card, bank, record, chatKey: meta.chatKey };
}

const attached = s => new Map(s.record.bindings.flatMap(ref => s.bank.instances[ref.id] ? [[ref.key, s.bank.instances[ref.id]]] : []));
const sameChat = s => {
    const ctx = SillyTavern.getContext();
    return ctx.chatMetadata === s.ctx.chatMetadata && ctx.chatId === s.ctx.chatId;
};

async function persist(s) {
    const ctx = SillyTavern.getContext();
    const cardIndex = ctx.characters.findIndex(card => card.avatar === s.card.avatar);
    if (cardIndex < 0) throw new Error('The character card is no longer available.');
    await ctx.writeExtensionField(cardIndex, KEY, s.bank);
    if (sameChat(s)) await ctx.saveMetadata();
}

async function countNotes(s) {
    for (const note of attached(s).values()) {
        const text = contentText(note);
        note.tokens = text ? await s.ctx.getTokenCountAsync(text, 0) : 0;
    }
}

function installRegex() {
    const ctx = SillyTavern.getContext();
    const scripts = ctx.extensionSettings.regex ??= [];
    const script = { id: REGEX_ID, scriptName: 'MarkUps — hide note commands', findRegex: HIDE_PATTERN.toString(),
        replaceString: '', trimStrings: [], placement: [2], disabled: !settings().enabled,
        markdownOnly: true, promptOnly: true, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null };
    const index = scripts.findIndex(item => item.id === REGEX_ID);
    if (index < 0) scripts.push(script);
    else scripts[index] = script;
}

function promptText(s) {
    const notes = attached(s);
    return `[MarkUps notes: persistent state, not dialogue]
Write the RP reply normally. In the SAME reply you may update the attached notes using the commands below. Commands are processed by MarkUps and hidden from the displayed post. Use only the listed instance keys. Only the player creates or attaches instances.
Each instance has its own content-token budget, initially 512. Token usage is shown below. Keep notes concise; you may raise a limit yourself when needed. Never erase facts merely to satisfy a budget. Hidden notes are for your continuity/planning and are not displayed in the RP post. Visible notes are displayed as note cards. Do not copy hidden content into prose unless intentionally revealing it.
Commands (IDs: letters/numbers/_/-; command bodies: plain text):
[mu:set visible entry_id]new or replacement entry text[/mu]
[mu:delete visible entry_id]
[mu:limit hidden 1024]
[mu:show visible start] or [mu:show visible end]
[mu:show visible here] — place the instance at this exact point in the RP post
[mu:hide hidden]
Replace visible/hidden with any attached key. Set replaces just one named entry, not the whole note. Delete removes just that entry. Show/hide applies to the whole instance. A here marker is needed in each reply that needs inline placement; without it, inline notes appear at the end. Omit commands when no update is needed. Do not include these commands in code fences or reasoning.
ATTACHED INSTANCES:
${[...notes].map(([key, note]) => `INSTANCE ${key} | title=${JSON.stringify(note.title)} | ${note.visible ? 'VISIBLE' : 'HIDDEN'} | post=${note.placement} | ${note.tokens}/${note.limit} content tokens${note.tokens > note.limit ? ' (OVER BUDGET: shorten or increase the limit)' : ''}\n${contentText(note) || '(empty)'}`).join('\n\n')}
[/MarkUps notes]`;
}

async function updateInjection(processedChat = null) {
    const ctx = SillyTavern.getContext();
    const s = scope();
    if (!settings().enabled || !s) { ctx.setExtensionPrompt(KEY, '', 1, 0, false, 0); return; }
    await countNotes(s);
    if (!sameChat(s)) return;
    let depth = 0;
    if (s.record.position === 'before') depth = ctx.mainApi === 'openai' ? 0 : 10000;
    else if (s.record.position === 'depth') depth = Math.max(0, Number(s.record.depth) || 0);
    else if (s.record.position === 'after_user') {
        const chat = processedChat || ctx.chat.filter(message => !message.is_system);
        const index = chat.findLastIndex(message => message.is_user);
        depth = index < 0 ? 0 : chat.length - index - 1;
    }
    const text = promptText(s);
    ctx.setExtensionPrompt(KEY, s.record.position === 'before' && ctx.mainApi === 'openai' ? `${BEFORE_START}\n${text}\n${BEFORE_END}` : text, 1, depth, false, 0);
}

globalThis.markupsPrepareContext = async chat => {
    // Commands do not belong in history, even if ST's Regex extension is off.
    for (const message of chat) if (!message.is_user) message.mes = stripCommands(message.mes || '');
    promptSources = chat;
    await updateInjection(chat);
};

async function placeBeforeChat({ chat }) {
    if (!Array.isArray(chat)) return;
    const index = chat.findIndex(message => typeof message.content === 'string' && message.content.includes(BEFORE_START));
    if (index < 0) return;
    const source = chat[index], start = source.content.indexOf(BEFORE_START), end = source.content.indexOf(BEFORE_END, start);
    if (end < 0) return;
    const text = source.content.slice(start + BEFORE_START.length, end).trim();
    const rest = (source.content.slice(0, start) + source.content.slice(end + BEFORE_END.length)).trim();
    if (rest) source.content = rest;
    else chat.splice(index, 1);
    const { setOpenAIMessages } = await import('/scripts/openai.js');
    const ctx = SillyTavern.getContext();
    const sourceTexts = new Set(setOpenAIMessages(promptSources).map(message => `${message.role}\0${ctx.substituteParams(message.content)}`));
    const plain = content => typeof content === 'string' ? content : (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');
    const first = chat.findIndex(message => sourceTexts.has(`${message.role}\0${plain(message.content)}`));
    chat.splice(first < 0 ? chat.length : first, 0, { role: 'system', content: text });
}

function signature(text) {
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return `${text.length}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

async function receive(s, index, message) {
    if (!settings().enabled || !sameChat(s) || s.ctx.chat[index] !== message || message.is_user || message.is_system) return;
    message.extra ??= {};
    const raw = message.mes || '';
    const sig = signature(raw);
    const previous = message.extra[KEY];
    if (previous?.signature === sig || (previous?.raw && stripCommands(previous.raw) === raw)) { paint(index); return; }
    const notes = attached(s);
    const commands = parseCommands(raw);
    const errors = applyCommands(commands, notes);
    if (/\[mu:/i.test(raw.replace(new RegExp(COMMAND_PATTERN), ''))) errors.push('An incomplete or unknown MarkUps command was ignored.');
    // Keep command bodies out of ordinary history and other summarizers too.
    message.mes = stripCommands(raw);
    await countNotes(s);
    const views = [...notes].filter(([, note]) => note.visible && note.entries.length)
        .map(([key, note]) => ({ key, title: note.title, placement: note.placement, entries: structuredClone(note.entries) }));
    message.extra[KEY] = { signature: sig, ...(raw !== message.mes ? { raw } : {}), views };
    await persist(s);
    if (sameChat(s)) {
        // Regular replies emit MESSAGE_RECEIVED before ST creates their DOM.
        if (document.querySelector(`#chat .mes[mesid="${Number(index)}"] .mes_text`)) s.ctx.updateMessageBlock(index, message);
        native.syncMesToSwipe(index);
        await s.ctx.saveChat();
        paint(index);
        await updateInjection();
        renderSettings();
    }
    const over = [...notes].filter(([, note]) => note.tokens > note.limit).map(([key]) => key);
    if (errors.length || over.length) {
        const text = [...errors, ...(over.length ? [`Over budget: ${over.join(', ')}. Content kept; shorten it or increase the limit.`] : [])].join(' ');
        status(text);
        toastr.warning(text, 'MarkUps');
    } else status(`Processed ${commands.length} note commands. Saved.`);
}

function paint(index) {
    const ctx = SillyTavern.getContext();
    const message = ctx.chat[index];
    if (!message || message.is_user) return;
    const root = document.querySelector(`#chat .mes[mesid="${Number(index)}"] .mes_text`);
    if (!root) return;
    root.querySelectorAll('.mu-note-card').forEach(element => element.remove());
    const views = settings().enabled ? message.extra?.[KEY]?.views || [] : [];
    if (views.some(view => view.placement === 'inline') && !message.extra?.display_text) {
        const raw = message.extra?.[KEY]?.raw;
        const text = raw && stripCommands(raw) === message.mes ? raw : message.mes || '';
        root.innerHTML = ctx.messageFormatting(markedPost(text, new Set(views.map(view => view.key))), message.name, message.is_system, false, index, {}, false);
    }
    const start = document.createDocumentFragment();
    for (const view of views) {
        const card = document.createElement('aside');
        card.className = 'mu-note-card';
        const title = document.createElement('strong');
        title.textContent = view.title;
        card.append(title);
        const body = document.createElement('div');
        body.className = 'mu-note-body';
        for (const entry of view.entries) {
            const line = document.createElement('div');
            line.className = 'mu-note-entry';
            line.textContent = entry.text;
            body.append(line);
        }
        card.append(body);
        const slot = [...root.querySelectorAll('.mu-inline-slot, .custom-mu-inline-slot')].find(element => element.dataset.muKey === view.key);
        if (view.placement === 'start') start.append(card);
        else if (view.placement === 'inline' && slot) slot.append(card);
        else root.append(card);
    }
    root.prepend(start);
}

function paintAll() { SillyTavern.getContext().chat.forEach((_, index) => paint(index)); }
function escape(text) { const span = document.createElement('span'); span.textContent = String(text); return span.innerHTML.replaceAll('"', '&quot;'); }
const validKey = value => /^[a-z][\w-]*$/.test(value);

function sourceOptions() {
    const s = scope();
    const source = s?.bank.chats[$('#mu_source_chat').val()];
    $('#mu_source_note').html((source?.bindings || []).map(ref => `<option value="${escape(ref.key)}">${escape(ref.key)} — ${escape(s.bank.instances[ref.id]?.title || 'Missing')}</option>`).join(''));
}

function renderSettings(force = false) {
    if (!force && document.activeElement?.closest('.mu-card[data-key]') && document.activeElement.matches('input,textarea,select')) return;
    const s = scope();
    $('#mu_enabled').prop('checked', settings().enabled);
    $('#mu_scope').text(s ? `Card: ${s.card.name} · Chat: ${s.record.name}` : 'Open a character chat to manage its notes. Group chats are not supported in this version.');
    $('#mu_position').val(s?.record.position || 'after_user').prop('disabled', !s);
    $('#mu_depth').val(s?.record.depth || 0);
    $('#mu_depth_row').toggle(s?.record.position === 'depth');
    $('#mu_add_note, #mu_attach, #mu_export, #mu_import').prop('disabled', !s);
    const html = s ? [...attached(s)].map(([key, note]) => {
        const shared = Object.values(s.bank.chats).filter(chat => chat.bindings.some(ref => ref.id === note.id)).length;
        return `<details class="mu-card" data-key="${escape(key)}" ${note.visible ? 'open' : ''}>
            <summary>${escape(note.title)} · ${escape(key)} <span class="mu-usage ${note.tokens > note.limit ? 'mu-over' : ''}">${note.tokens} / ${note.limit} tokens</span>${shared > 1 ? ` · shared by ${shared} chats` : ''}</summary>
            <label>Title<input class="mu-title text_pole" value="${escape(note.title)}"></label>
            <div class="mu-row"><label class="checkbox_label"><input class="mu-visible" type="checkbox" ${note.visible ? 'checked' : ''}><span>Visible in RP posts</span></label></div>
            <label>Where it appears in posts<select class="mu-placement text_pole"><option value="start" ${note.placement === 'start' ? 'selected' : ''}>At the start</option><option value="end" ${note.placement === 'end' ? 'selected' : ''}>At the end</option><option value="inline" ${note.placement === 'inline' ? 'selected' : ''}>At the model's here marker (otherwise at the end)</option></select></label>
            <label>Content-token limit<input class="mu-limit text_pole" type="number" min="1" step="1" value="${note.limit}"></label>
            <div class="mu-entries">${note.entries.map(entryHtml).join('')}</div>
            <div class="mu-row"><input class="mu-new-entry text_pole" placeholder="Entry ID, e.g. groceries" aria-label="New entry ID"><button class="mu-add-entry menu_button">Add entry</button></div>
            <div class="mu-row mu-save-row"><button class="mu-detach menu_button">Detach from this chat</button><button class="mu-save menu_button">Save note</button></div>
            <div class="mu-muted">${shared > 1 ? 'This is one shared instance. Saving changes it in every attached chat.' : 'This instance is attached only to this chat.'}</div>
        </details>`;
    }).join('') : '';
    $('#mu_notes').html(html);
    const previous = $('#mu_source_chat').val();
    $('#mu_source_chat').html(s ? Object.entries(s.bank.chats).filter(([id]) => id !== s.chatKey)
        .map(([id, chat]) => `<option value="${escape(id)}">${escape(chat.name)}</option>`).join('') : '');
    if (previous && s?.bank.chats[previous]) $('#mu_source_chat').val(previous);
    sourceOptions();
}

function entryHtml(entry) {
    return `<div class="mu-entry"><div class="mu-row"><input class="mu-entry-id text_pole" value="${escape(entry.id)}" readonly aria-label="Entry ID"><button class="mu-remove-entry menu_button" title="Remove entry, then Save note">Remove</button></div><textarea class="mu-entry-text text_pole" rows="3" aria-label="Entry text">${escape(entry.text)}</textarea></div>`;
}

async function changed(s, message = 'Saved.') {
    await countNotes(s);
    await persist(s);
    await updateInjection();
    renderSettings(true);
    status(message);
}

function bindUI() {
    $('#mu_enabled').on('change', () => run(async () => {
        settings().enabled = $('#mu_enabled').prop('checked');
        installRegex();
        SillyTavern.getContext().saveSettingsDebounced();
        await updateInjection();
        paintAll();
    }));
    $('#mu_position, #mu_depth').on('change', () => run(async () => {
        const s = scope(); if (!s) return;
        s.record.position = $('#mu_position').val();
        s.record.depth = Math.max(0, Math.floor(Number($('#mu_depth').val()) || 0));
        await changed(s);
    }));
    $('#mu_notes').on('click', '.mu-add-entry', function () {
        const card = $(this).closest('[data-key]');
        const id = card.find('.mu-new-entry').val().trim();
        if (!/^[\w-]+$/.test(id)) { status('Use letters, numbers, underscores or hyphens for an entry ID.'); return; }
        if ([...card.find('.mu-entry-id')].some(input => input.value === id)) { status('That entry already exists. Edit its text below.'); return; }
        card.find('.mu-entries').append(entryHtml({ id, text: '' }));
        card.find('.mu-new-entry').val('');
        card.find('.mu-entry-text').last().trigger('focus');
    }).on('click', '.mu-remove-entry', function () { $(this).closest('.mu-entry').remove(); status('Entry removed from the editor. Click Save note to apply.');
    }).on('click', '.mu-save', function () {
        const element = $(this).closest('[data-key]');
        const key = element.data('key');
        const s = scope(); if (!s) return;
        const values = { title: element.find('.mu-title').val().trim() || key,
            visible: element.find('.mu-visible').prop('checked'), placement: element.find('.mu-placement').val(),
            limit: Number(element.find('.mu-limit').val()), entries: [...element.find('.mu-entry')].map(row => ({ id: $(row).find('.mu-entry-id').val(), text: $(row).find('.mu-entry-text').val() })) };
        if (!Number.isSafeInteger(values.limit) || values.limit < 1) { status('Enter a positive whole-number token limit.'); return; }
        run(async () => { const note = attached(s).get(key); if (!note) return; Object.assign(note, values); await changed(s); });
    }).on('click', '.mu-detach', function () {
        const key = $(this).closest('[data-key]').data('key');
        run(async () => { const s = scope(); if (!s) return; s.record.bindings = s.record.bindings.filter(ref => ref.key !== key); await changed(s, 'Detached. Other chats keep their instance.'); });
    });
    $('#mu_add_note').on('click', () => {
        const key = $('#mu_new_key').val().trim().toLowerCase();
        if (!validKey(key)) { status('Start the instance key with a letter; use letters, numbers, _ or -.'); return; }
        run(async () => {
            const s = scope(); if (!s) return;
            if (attached(s).has(key)) { status('That instance key is already attached.'); return; }
            const note = newNote(key);
            s.bank.instances[note.id] = note;
            s.record.bindings.push({ key, id: note.id });
            $('#mu_new_key').val('');
            await changed(s);
        });
    });
    $('#mu_source_chat').on('change', sourceOptions);
    $('#mu_attach').on('click', () => {
        const sourceId = $('#mu_source_chat').val(), key = $('#mu_source_note').val(), copy = $('#mu_attach_mode').val() === 'copy';
        run(async () => {
            const s = scope(); if (!s) return;
            const ref = s.bank.chats[sourceId]?.bindings.find(item => item.key === key);
            if (!ref || !s.bank.instances[ref.id]) { status('Choose a source chat and note.'); return; }
            let id = ref.id;
            if (copy) { const note = structuredClone(s.bank.instances[id]); note.id = newId(); id = note.id; s.bank.instances[id] = note; }
            s.record.bindings = s.record.bindings.filter(item => item.key !== key);
            s.record.bindings.push({ key, id });
            await changed(s, copy ? 'Independent copy attached.' : 'Shared instance attached. Edits now synchronize.');
        });
    });
    $('#mu_export').on('click', () => {
        const s = scope(); if (!s) return;
        const blob = new Blob([exportNotes(s.bank, s.record, $('#mu_export_scope').val() === 'card')], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'MarkUps-notes.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    $('#mu_template').on('click', () => {
        const link = document.createElement('a');
        link.href = new URL('MarkUps-template.md', import.meta.url).href;
        link.download = 'MarkUps-template.md';
        link.click();
    });
    $('#mu_import').on('click', () => {
        const s = scope(); if (!s) return;
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.md,.txt,text/plain,text/markdown';
        input.onchange = () => run(async () => {
            const file = input.files[0]; if (!file) return;
            importNotes(s.bank, s.record, parseNotes(await file.text()));
            await changed(s, 'Markdown notes imported and attached.');
        });
        input.click();
    });
    $('#mu_import_paste').on('click', () => {
        const text = $('#mu_import_text').val();
        const s = scope(); if (!s) return;
        run(async () => { importNotes(s.bank, s.record, parseNotes(text)); await changed(s, 'Pasted notes imported and attached.'); });
    });
}

async function openChat() {
    const s = scope();
    if (s) { await countNotes(s); await persist(s); }
    await updateInjection();
    renderSettings(true);
    paintAll();
}

(async function init() {
    const ctx = SillyTavern.getContext();
    native = await import('/script.js');
    installRegex();
    const html = await ctx.renderExtensionTemplateAsync('third-party/Extension-MarkUps', 'settings', {});
    $('#extensions_settings2').append(html);
    $('#mu_parser_regex').val(COMMAND_PATTERN.toString());
    $('#mu_hide_regex').val(HIDE_PATTERN.toString());
    bindUI();
    ctx.eventSource.on(ctx.eventTypes.CHAT_CHANGED, () => run(openChat));
    ctx.eventSource.on(ctx.eventTypes.APP_READY, () => run(openChat));
    ctx.eventSource.on(ctx.eventTypes.CHAT_COMPLETION_PROMPT_READY, placeBeforeChat);
    ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, (index, type) => {
        if (type === 'first_message') return;
        const s = scope(); const message = s?.ctx.chat[index];
        if (s && message) return run(() => receive(s, index, message));
    });
    for (const type of [ctx.eventTypes.CHARACTER_MESSAGE_RENDERED, ctx.eventTypes.MESSAGE_UPDATED, ctx.eventTypes.MESSAGE_SWIPED].filter(Boolean)) {
        ctx.eventSource.on(type, index => paint(index));
    }
    await run(openChat);
    console.info('[MarkUps] 0.1.0 loaded');
})().catch(error => { console.error('[MarkUps]', error); toastr.error(error.message, 'MarkUps initialization'); });
