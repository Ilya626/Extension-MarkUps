import { newId, newNote } from './commands.js';

// Human-editable Markdown, with only three reserved heading prefixes.
const bodyEscape = text => text.replace(/^(?=## (?:Note|Chat):|### Entry:|\\)/gm, '\\');
const bodyUnescape = text => text.replace(/^\\(?=## (?:Note|Chat):|### Entry:|\\)/gm, '');

export function exportNotes(bank, current, allChats = false) {
    const chats = allChats ? Object.values(bank.chats) : [current];
    const aliases = new Map();
    const used = new Set();
    for (const chat of chats) for (const ref of chat.bindings) {
        if (aliases.has(ref.id) || !bank.instances[ref.id]) continue;
        let key = ref.key, count = 2;
        while (used.has(key)) key = `${ref.key}-${count++}`;
        used.add(key); aliases.set(ref.id, key);
    }
    const lines = ['# MarkUps', ''];
    if (allChats) lines.push(`Active chat: chat-${chats.indexOf(current) + 1}`, '');
    for (const [id, key] of aliases) {
        const note = bank.instances[id];
        lines.push(`## Note: ${key}`, `Title: ${note.title}`, `Visible: ${note.visible ? 'yes' : 'no'}`,
            `Post: ${note.placement}`, `Limit: ${note.limit}`, '');
        for (const entry of note.entries) lines.push(`### Entry: ${entry.id}`, bodyEscape(entry.text), '');
    }
    if (allChats) for (const [index, chat] of chats.entries()) {
        lines.push(`## Chat: chat-${index + 1}`, `Name: ${chat.name}`, `Context: ${chat.position}`, `Depth: ${chat.depth || 0}`, `Display: ${chat.uiPlacement || 'between_messages'}`);
        for (const ref of chat.bindings) if (aliases.has(ref.id)) lines.push(`${ref.key} -> ${aliases.get(ref.id)}`);
        lines.push('');
    }
    return lines.join('\n');
}

export function parseNotes(text) {
    const notes = new Map(), chats = [];
    let note, chat, entry, activeChat = '';
    const finishEntry = () => {
        if (entry) { entry.text = bodyUnescape(entry.lines.join('\n').replace(/\n+$/, '')); delete entry.lines; entry = null; }
    };
    const positive = (value, line) => {
        const number = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) throw new Error(`Line ${line}: use a positive whole-number limit.`);
        return number;
    };
    const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    lines.forEach((line, index) => {
        let match;
        if ((match = /^## Note:\s*([a-z][\w-]*)\s*$/i.exec(line))) {
            finishEntry();
            const key = match[1].toLowerCase();
            if (notes.has(key)) throw new Error(`Line ${index + 1}: duplicate note key ${key}.`);
            note = newNote(key, key !== 'hidden'); chat = null; notes.set(key, note); return;
        }
        if ((match = /^## Chat:\s*(.+)$/.exec(line))) {
            finishEntry(); note = null; chat = { label: match[1].trim(), name: match[1].trim(), position: 'after_user', depth: 0, uiPlacement: 'between_messages', bindings: [] }; chats.push(chat); return;
        }
        if ((match = /^### Entry:\s*([\w-]+)\s*$/.exec(line)) && note) {
            finishEntry();
            if (note.entries.some(item => item.id === match[1])) throw new Error(`Line ${index + 1}: duplicate entry ID ${match[1]}.`);
            entry = { id: match[1], lines: [] }; note.entries.push(entry); return;
        }
        if (/^(## Note:|### Entry:)/.test(line)) throw new Error(`Line ${index + 1}: use a note key like visible, then an entry ID like groceries. Escape a literal heading with a backslash.`);
        if (entry) { entry.lines.push(line); return; }
        if ((match = /^Active chat:\s*(.*)$/.exec(line))) { activeChat = match[1].trim(); return; }
        if (note && (match = /^(Title|Visible|Post|Limit):\s*(.*)$/.exec(line))) {
            const [, field, value] = match;
            if (field === 'Title') note.title = value;
            if (field === 'Visible') {
                if (!['yes', 'no'].includes(value)) throw new Error(`Line ${index + 1}: Visible must be yes or no.`);
                note.visible = value === 'yes';
            }
            if (field === 'Post') {
                if (!['start', 'end', 'inline'].includes(value)) throw new Error(`Line ${index + 1}: Post must be start, end or inline.`);
                note.placement = value;
            }
            if (field === 'Limit') note.limit = positive(value, index + 1);
            return;
        }
        if (chat && (match = /^Name:\s*(.+)$/.exec(line))) { chat.name = match[1]; return; }
        if (chat && (match = /^Context:\s*(after_user|end|before|depth)\s*$/.exec(line))) { chat.position = match[1]; return; }
        if (chat && (match = /^Depth:\s*(\d+)\s*$/.exec(line))) { chat.depth = Number(match[1]); return; }
        if (chat && (match = /^Display:\s*(between_messages|before_ai|after_ai|above_input|messages)\s*$/.exec(line))) { chat.uiPlacement = match[1]; return; }
        if (chat && (match = /^([a-z][\w-]*)\s*->\s*([a-z][\w-]*)\s*$/i.exec(line))) {
            chat.bindings.push({ key: match[1].toLowerCase(), noteKey: match[2].toLowerCase() }); return;
        }
        if (line.trim() && !line.startsWith('#')) throw new Error(`Line ${index + 1}: put entry text below a "### Entry: id" heading.`);
    });
    finishEntry();
    if (!notes.size) throw new Error('No notes found. Start a note with "## Note: visible", then add "### Entry: an_id" and its text.');
    for (const chat of chats) for (const ref of chat.bindings) if (!notes.has(ref.noteKey)) throw new Error(`Chat ${chat.name}: note ${ref.noteKey} is not in the file.`);
    return { notes, chats, activeChat };
}

export function importNotes(bank, current, parsed) {
    for (const note of parsed.notes.values()) bank.instances[note.id] = note;
    const refs = chat => chat.bindings.map(ref => ({ key: ref.key, id: parsed.notes.get(ref.noteKey).id }));
    if (parsed.chats.length) {
        const source = parsed.chats.find(chat => chat.label === parsed.activeChat) || parsed.chats[0];
        for (const chat of parsed.chats) {
            if (chat === source) continue;
            const existing = Object.values(bank.chats).find(item => item !== current && item.name === chat.name);
            const record = { name: chat.name, position: chat.position, depth: chat.depth, uiPlacement: chat.uiPlacement, bindings: refs(chat) };
            if (existing) Object.assign(existing, record);
            else bank.chats[newId()] = record;
        }
        Object.assign(current, { position: source.position, depth: source.depth, uiPlacement: source.uiPlacement, bindings: refs(source) });
    } else {
        for (const [key, note] of parsed.notes) {
            current.bindings = current.bindings.filter(ref => ref.key !== key);
            current.bindings.push({ key, id: note.id });
        }
    }
}
