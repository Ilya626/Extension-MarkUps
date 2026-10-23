// A deliberately small, inspectable command language. Bodies are plain text.
export const COMMAND_PATTERN = /\[mu:(set)\s+([a-z][\w-]*)\s+([\w-]+)\s*\]([\s\S]*?)\[\/mu\]|\[mu:(delete|limit|show|hide)\s+([a-z][\w-]*)(?:\s+([^\]\r\n]+?))?\s*\]/gi;
// Also conceals an unfinished command while ST streams the answer.
export const HIDE_PATTERN = /\[mu:set\s+[^\]\r\n]+\][\s\S]*?(?:\[\/mu\]|$)|\[mu:(?:delete|limit|show|hide)\s+[^\]\r\n]*\]|\[mu:[^\]]*$/gi;

export function parseCommands(text) {
    return [...text.matchAll(new RegExp(COMMAND_PATTERN))].map(m => ({
        op: (m[1] || m[5]).toLowerCase(),
        note: (m[2] || m[6]).toLowerCase(),
        arg: (m[3] || m[7] || '').trim(),
        text: m[4]?.trim(),
        start: m.index,
        end: m.index + m[0].length,
    }));
}

export const stripCommands = text => text.replace(new RegExp(HIDE_PATTERN), '');
export const contentText = note => note.entries.map(entry => `[${entry.id}] ${entry.text}`).join('\n');
export const newId = () => globalThis.crypto?.randomUUID?.() || `mu-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function newNote(key, visible = true) {
    return { id: newId(), title: key === 'visible' ? 'Visible notes' : key === 'hidden' ? 'Hidden notes' : key,
        visible, placement: 'end', limit: 512, entries: [], tokens: 0 };
}

export function applyCommands(commands, notes) {
    const errors = [];
    for (const command of commands) {
        const note = notes.get(command.note);
        if (!note) { errors.push(`Unknown note: ${command.note}. Only the player can attach instances.`); continue; }
        switch (command.op) {
            case 'set': {
                const existing = note.entries.find(entry => entry.id === command.arg);
                if (existing) existing.text = command.text;
                else note.entries.push({ id: command.arg, text: command.text });
                break;
            }
            case 'delete':
                note.entries = note.entries.filter(entry => entry.id !== command.arg);
                break;
            case 'limit': {
                const limit = Number(command.arg);
                if (!/^\d+$/.test(command.arg) || !Number.isSafeInteger(limit) || limit < 1) errors.push(`Invalid token limit for ${command.note}.`);
                else note.limit = limit;
                break;
            }
            case 'show':
                if (!['start', 'end', 'here'].includes(command.arg)) errors.push(`Use show ${command.note} start, end or here.`);
                else { note.visible = true; note.placement = command.arg === 'here' ? 'inline' : command.arg; }
                break;
            case 'hide': note.visible = false; break;
        }
    }
    return errors;
}

export function markedPost(text, allowedKeys) {
    return text.replace(new RegExp(COMMAND_PATTERN), (...args) => {
        const command = parseCommands(args[0])[0];
        return command.op === 'show' && command.arg === 'here' && allowedKeys.has(command.note)
            ? `\n\n<div class="mu-inline-slot" data-mu-key="${command.note}"></div>\n\n` : '';
    }).replace(new RegExp(HIDE_PATTERN), '');
}
