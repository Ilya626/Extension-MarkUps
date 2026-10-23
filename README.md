# Notes — MarkUps

A small SillyTavern extension for notes that the model can maintain while writing its normal RP reply. Version 0.1.0. No separate model request or tool-calling support is needed.

Each character chat starts with two attached instances: `visible` and `hidden`. Each instance starts with a 512-content-token budget. The player can create more instances, edit entries, change visibility and post placement, and adjust limits in Extensions → Notes — MarkUps. The model receives both visible and hidden notes, their keys, current token usage, and the command instructions.

## One reply, normal prose and note commands

```text
Mira studies the market board.

[mu:set visible errands]
Buy chalk, two ropes, and three candles.
[/mu]
[mu:set hidden guild]
The shopkeeper secretly works for the rival guild.
[/mu]
[mu:show visible here]

She points toward the stalls.
```

The visible instance appears at the `here` marker. The hidden instance is received by the model but omitted from the RP post. Commands are removed from ordinary message text after processing, so other summarizers receive the RP prose rather than hidden command bodies. The original command-bearing reply is retained in that message's MarkUps metadata.

Commands use the attached instance key and a stable entry ID:

| Command | Meaning |
|---|---|
| `[mu:set visible groceries]Milk and bread.[/mu]` | Add or replace one entry |
| `[mu:delete visible groceries]` | Delete one entry |
| `[mu:show visible start]` | Show the whole instance at the start of this and future replies |
| `[mu:show visible end]` | Show it at the end |
| `[mu:show visible here]` | Show it at this point; future replies need their own marker or fall back to the end |
| `[mu:hide hidden]` | Hide the instance from RP posts |
| `[mu:limit hidden 1024]` | Change that instance's budget |

`visible` and `hidden` are default keys, not reserved roles: substitute any instance attached by the player. Instance keys start with a letter and use letters, numbers, `_` or `-`. Entry IDs use letters, numbers, `_` or `-`. Entry text can use any language. Only the player creates/attaches instances; the model edits entries inside them.

## Context and token budgets

By default MarkUps goes immediately after the latest included player message, as a system message. The player can instead select the end, before the conversation, or a native in-chat depth. Placement is refreshed through ST's generation interceptor, after the new player turn exists and before history token budgeting. This does not add notes to raw/profile utility requests such as Summaryception's summarizer calls.

Token usage uses ST's active tokenizer, counting the entry IDs and text actually shown in the note-state body. The instructions and instance headers consume additional context. A model can explicitly raise each instance's limit. If content exceeds a limit, MarkUps highlights it and reports the overrun; it keeps the content instead of silently truncating entries or blocking the RP response.

The built-in command parser and hiding regex are shown in the settings. MarkUps automatically installs one ST Regex rule named **MarkUps — hide note commands** for display and prompt cleanup, including unfinished streaming commands. Keep ST's built-in Regex extension enabled for hiding partial commands while streaming. Final command processing and the history interceptor work independently of that rule. Other regex scripts are preserved.

## Copy or synchronize across chats

Instances are stored in the character card's `data.extensions.markups` field, not a separate browser database. Chat metadata stores the attachment record ID. A new empty chat gets its own two empty instances.

Open **Attach notes from another chat of this card**, choose the chat and instance, then choose:

- **Copy:** a new independent instance with the same content.
- **Synchronize:** both chats attach the same instance. Model updates and player edits change that single shared instance.

Attaching replaces this chat's binding with the same key; other bindings stay attached. Detach removes only this chat's link, preserving the instance and other chats' links. The UI identifies instances shared by multiple chats. Historical RP posts retain the visible note snapshot shown with that reply; current note edits apply to future replies.

Commands execute on newly received assistant replies. Reopening a chat or selecting an existing swipe does not replay commands or roll note state back. Regenerated replies may issue new commands. The player can correct state directly in settings.

## Editable import and export

Export uses ordinary **Markdown**, not JSON. Open the `.md` file in any text editor, use `.txt` if preferred, or paste/write the text directly in the extension's import panel. A downloadable [template](MarkUps-template.md) is included. You can write a minimal file from scratch:

```markdown
## Note: visible
Title: Shopping list
Visible: yes
Limit: 512

### Entry: groceries
Milk, bread, a brass key.

## Note: hidden
Visible: no

### Entry: plot
The shopkeeper secretly works for the rival guild.
```

`Title`, `Visible`, `Post`, and `Limit` are optional; omitted values use normal defaults. `Post` accepts `start`, `end` or `inline`. Each entry starts with `### Entry: its_id`; everything below it is plain multiline text until the next entry/note heading.

- **Current chat notes** exports only its attached instances. Importing creates independent instances and attaches them by key; unrelated current notes remain attached.
- **All card chats** also exports readable `## Chat:` sections and lines such as `hidden -> hidden`. Repeated references preserve synchronization without exposing internal UUIDs. Import restores these attachment relationships and loads the file's active chat notes into the currently open chat. Imported source chat records are also available in the attach dropdown.

Exports automatically escape literal entry lines beginning with the reserved `## Note:`, `## Chat:` or `### Entry:` prefixes. When writing such literal lines yourself, put a backslash before the heading. Ordinary quotation marks and backslashes need no JSON escaping.

Card exports and note exports contain hidden notes too. Hidden controls presentation in RP posts; the player can always inspect and edit them in settings.

## Installation and updates

In SillyTavern, open **Extensions → Install extension** and paste:

```text
https://github.com/Ilya626/Extension-MarkUps
```

For later versions, use **Manage extensions → Update**, then reload the page. Manual updates use this repository; unattended updates remain disabled.

### Local ZIP installation

Unpack the `Extension-MarkUps` folder into your ST installation's `public/scripts/extensions/third-party/` directory. Its `manifest.json` must be directly inside `Extension-MarkUps`. Restart ST and reload the page, then open Extensions → Notes — MarkUps.

No API endpoint, connection profile, key or model is configured in this addon: it uses commands from the normal chat response. The first version supports individual character chats; group chats are not enabled.

License: MIT, see [LICENSE](LICENSE).
