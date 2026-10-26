# Notes — MarkUps

A small SillyTavern extension for shopping lists, quests, plans and other notes that the model can maintain while writing its normal RP reply. Version 0.2.0.

## What is a note?

A **note instance** is one named notebook. An **entry** is one item inside it. For example, the `visible` notebook can contain a `groceries` entry and a `meeting` entry. Updating `groceries` leaves `meeting` alone.

Every new empty character chat starts with two notebooks:

| Default key | What it is for | Model receives it | Player sees it |
|---|---|---|---|
| `visible` | Shopping lists, quests, reminders | Yes | In the live Notes panel and the note editor |
| `hidden` | Continuity, plans, future story events | Yes | In the note editor only |

The keys are just names. You can make `hidden` visible or hide `visible`. Each notebook has its own **512-token budget** by default. You can create additional notebooks and edit everything in **Extensions → Notes — MarkUps**.

## Quick start

1. [Install the extension](#installation-and-updates), reload ST and open a character chat.
2. Open **Extensions → Notes — MarkUps** and leave **Enable MarkUps** checked.
3. Chat normally. For example, ask: **Keep our shopping list in visible notes and remember unresolved story plans in hidden notes.**
4. Find the collapsible **Notes** panel **between the latest player and AI messages inside the chat**. It appears even when the visible notebook is empty. Click **Notes** or a notebook title to fold it.
5. Click **Edit notes** to inspect or correct its entries in settings. Click **Save note** after editing.

You do not need to paste the command instructions into your character card, register a tool, choose another model or configure another API.

## How does the model know what to do?

MarkUps adds a **system message through ST's normal extension-prompt mechanism** before each ordinary chat generation. By default it goes **immediately after the latest included player message**. It contains:

- The available notebook keys and their current entries, including hidden notes.
- Each notebook's visibility and token usage, such as `180 / 512`, and the selected display mode.
- Instructions and examples for adding, replacing and deleting entries.

The model writes normal RP prose and any note commands in **the same response**. MarkUps processes those commands and removes them from the displayed post and ordinary message history. The next model request receives the updated notes.

This uses a **text command format**, not API function calling. There is no separate AI request for updating notes. The model may omit commands when nothing needs changing; the existing notes remain available.

## One reply, normal prose and note commands

```text
Mira studies the market board.

[mu:set visible groceries]
Buy chalk, two ropes, and three candles.
[/mu]
[mu:set hidden guild]
The shopkeeper secretly works for the rival guild.
[/mu]
[mu:show visible here]

She points toward the stalls.
```

The player sees the normal reply without command brackets:

> Mira studies the market board.
>
> She points toward the stalls.

The live **Notes** panel now contains **Buy chalk, two ropes, and three candles.** By default, the screen order is **your message → Notes panel → AI reply**. When you send the next message, the panel moves between that message and the preceding AI reply. There is one current panel, not a copy under every post.

The guild information is saved in `hidden` and sent to the model on later turns. It stays out of the visible panel and RP post. If you choose **Inside each AI reply** in settings, the `here` command instead displays a note card between the two paragraphs.

### Replace or delete one entry

Later, the model can replace the shopping list with:

```text
[mu:set visible groceries]Only chalk remains to be bought.[/mu]
```

Using the same `groceries` ID replaces that entry. Using a new ID adds another entry. Other entries in the notebook stay intact.

To remove it entirely:

```text
[mu:delete visible groceries]
```

### Command reference

Commands use the attached instance key and a stable entry ID:

| Command | Meaning |
|---|---|
| `[mu:set visible groceries]Milk and bread.[/mu]` | Add or replace one entry |
| `[mu:delete visible groceries]` | Delete one entry |
| `[mu:show visible start]` | Make the whole instance visible; in per-reply mode, put it before the prose |
| `[mu:show visible end]` | Make it visible; in per-reply mode, put it after the prose |
| `[mu:show visible here]` | Make it visible; in per-reply mode, put it at this marker |
| `[mu:hide hidden]` | Hide the instance from the panel and RP posts |
| `[mu:limit hidden 1024]` | Change that instance's budget |

`visible` and `hidden` are default keys, not reserved roles: substitute any instance attached by the player. Instance keys start with a letter and use letters, numbers, `_` or `-`. Entry IDs use letters, numbers, `_` or `-`. Entry text can use any language. Only the player creates/attaches instances; the model edits entries inside them.

### Where visible notes appear

In settings, **Visible lists — on your screen → List position** offers:

- **Between latest player / AI messages** — the default. One live panel inside the conversation moves with the latest pair of messages.
- **Before the latest AI reply** — the live panel directly precedes that reply.
- **After the latest AI reply** — the live panel directly follows that reply.
- **Above the message box** — the live panel sits outside chat messages, above the input field.
- **Inside each AI reply** — the original per-message cards, with a separate start/end/here position for each notebook.

The live panel shows the **current** entries, including an empty-list placeholder. Hidden notebooks stay out of it. You can fold the whole panel or individual notebooks; these choices are remembered for this chat. The model's start/end/here commands do not move the live panel away from the position you selected.

In **Inside each AI reply** mode, `start` and `end` select a position before or after the RP prose. For inline placement, the model includes a new `here` command in each reply that needs a specific location; without it, the notebook falls back to the end. These cards are collapsible snapshots of that reply. Hidden or empty notebooks produce no snapshot card.

## Editing notes yourself

In the extension settings, expand a notebook. You can edit its title, entries, visibility and token limit. In per-reply mode you can also select its position inside the reply. Use **Add entry** to add an item, **Remove** to remove one, then **Save note** to apply the changes. The live panel updates immediately, and the next model request receives the edits.

For an additional notebook, enter a key such as `quests` next to **Add instance**. The model will then receive that key automatically and can write:

```text
[mu:set quests courier]Meet the courier at the north gate before dusk.[/mu]
```

## Context and token budgets

**Notes sent to the AI — context position** controls the system message containing both visible and hidden notes. The settings show the resulting order:

- **After your latest message** — system/setup → earlier chat → your message → notes → AI reply. This is the default.
- **Before chat — after system/setup** — system/setup → notes → chat messages.
- **After all chat messages** — system/setup → chat messages → notes.
- **Inside the chat** — insert at a chosen depth, counted in messages from the end.

**Visible lists — on your screen** independently controls the player-facing panel. Moving it on your screen does not move the notes in the AI's context.

The `180 / 512 tokens` indicator is **per notebook**, not a total shared by all notebooks. It counts entry IDs and text through ST's active tokenizer. The command instructions and notebook headers consume additional context.

The player can change a budget in the editor, or the model can raise it in its reply:

```text
[mu:limit hidden 1024]
```

This changes only the `hidden` notebook's budget. If content exceeds a budget, MarkUps highlights it and reports the overrun. It **keeps the entries** rather than truncating them or blocking the RP response.

## Copy or synchronize across chats

Instances are stored in the character card's `data.extensions.markups` field, not a separate browser database. Chat metadata stores the attachment record ID. A new empty chat gets its own two empty instances.

Open **Attach notes from another chat of this card**, choose the chat and instance, then choose:

- **Copy:** a new independent instance with the same content.
- **Synchronize:** both chats attach the same instance. Model updates and player edits change that single shared instance.

For example, Chat A has a shopping list containing milk and bread. Attach it to Chat B with **Copy**, then add tea: Chat A still has milk and bread. Attach it with **Synchronize** instead, then add tea: both chats now have milk, bread and tea.

Attaching replaces this chat's binding with the same key; other bindings stay attached. Detach removes only this chat's link, preserving the instance and other chats' links. The UI identifies instances shared by multiple chats. The live panel always shows current state. In the optional per-reply display mode, historical RP posts retain the snapshot shown with that reply.

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

To use the example, save it as `my-notes.md` and click **Import .md / .txt**. Alternatively, open **Paste or write notes directly**, paste it, and click **Import text**. The imported notes are attached immediately and appear in the editor. You do not need to add them to the prompt yourself.

- **Current chat notes** exports only its attached instances. Importing creates independent instances and attaches them by key; unrelated current notes remain attached.
- **All card chats** also exports readable `## Chat:` sections and lines such as `hidden -> hidden`. Repeated references preserve synchronization without exposing internal UUIDs. `Context`, `Depth` and `Display` retain each chat's insertion and panel positions. Import restores these attachment relationships and loads the file's active chat notes into the currently open chat. Imported source chat records are also available in the attach dropdown.

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

## Technical notes

The built-in command parser and hiding regex are shown under **Commands and built-in regex**. MarkUps automatically installs one ST Regex rule named **MarkUps — hide note commands**, including cleanup of unfinished streaming commands. Keep ST's built-in Regex extension enabled to hide partial commands while streaming. Final command processing and the history interceptor work independently of that rule. Other regex scripts are preserved.

Placement is refreshed through ST's generation interceptor after the new player turn exists and before history token budgeting. MarkUps does not add its state to raw/profile utility requests such as Summaryception's summarizer calls.

Commands are removed from ordinary assistant-message text after processing, so other summarizers receive the RP prose rather than hidden command bodies. The original command-bearing reply and the visible snapshot are retained in that message's MarkUps metadata.

License: MIT, see [LICENSE](LICENSE).

## Changes in 0.2.0

- Visible lists now appear by default between the latest player and AI messages, including empty lists.
- One live panel follows the newest message pair; the panel and individual lists can be collapsed.
- Added explicit screen-placement choices and separate, explained AI context positions.
- Existing notebooks, entries and shared attachments are preserved when updating from 0.1.0. Per-reply snapshots remain available as an optional display mode.
