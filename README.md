# Notes — MarkUps

A small SillyTavern extension for shopping lists, quests, plans and other notes that the model can maintain while writing its normal RP reply. Version 0.1.0.

## What is a note?

A **note instance** is one named notebook. An **entry** is one item inside it. For example, the `visible` notebook can contain a `groceries` entry and a `meeting` entry. Updating `groceries` leaves `meeting` alone.

Every new empty character chat starts with two notebooks:

| Default key | What it is for | Model receives it | Player sees it |
|---|---|---|---|
| `visible` | Shopping lists, quests, reminders | Yes | In RP posts and the note editor |
| `hidden` | Continuity, plans, future story events | Yes | In the note editor, but not in RP posts |

The keys are just names. You can make `hidden` visible or hide `visible`. Each notebook has its own **512-token budget** by default. You can create additional notebooks and edit everything in **Extensions → Notes — MarkUps**.

## Quick start

1. [Install the extension](#installation-and-updates), reload ST and open a character chat.
2. Open **Extensions → Notes — MarkUps** and leave **Enable MarkUps** checked.
3. Chat normally. For example, ask: **Keep our shopping list in visible notes and remember unresolved story plans in hidden notes.**
4. Open a note in the settings to inspect or correct its entries. Click **Save note** after editing.

You do not need to paste the command instructions into your character card, register a tool, choose another model or configure another API.

## How does the model know what to do?

MarkUps adds a **system message through ST's normal extension-prompt mechanism** before each ordinary chat generation. By default it goes **immediately after the latest included player message**. It contains:

- The available notebook keys and their current entries, including hidden notes.
- Each notebook's visibility, post placement and token usage, such as `180 / 512`.
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

The player sees this, with the shopping list rendered as a note card between the two paragraphs:

> Mira studies the market board.
>
> **Visible notes**
>
> Buy chalk, two ropes, and three candles.
>
> She points toward the stalls.

The guild information is saved in `hidden` and sent to the model on later turns. It is not displayed in this RP post. The command brackets are not displayed either.

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
| `[mu:show visible start]` | Show the whole instance at the start of this and future replies |
| `[mu:show visible end]` | Show it at the end |
| `[mu:show visible here]` | Show it at this point; future replies need their own marker or fall back to the end |
| `[mu:hide hidden]` | Hide the instance from RP posts |
| `[mu:limit hidden 1024]` | Change that instance's budget |

`visible` and `hidden` are default keys, not reserved roles: substitute any instance attached by the player. Instance keys start with a letter and use letters, numbers, `_` or `-`. Entry IDs use letters, numbers, `_` or `-`. Entry text can use any language. Only the player creates/attaches instances; the model edits entries inside them.

### Where visible notes appear

Use `start` or `end` to place a notebook before or after the RP prose. That choice also applies to later replies. Use `here` to place it at a particular point in the current reply, as in the market example above.

For inline placement, the model must include a new `here` command in each reply that needs a specific location. Without a marker, that notebook appears at the end. Hidden or empty notebooks produce no visible card.

## Editing notes yourself

In the extension settings, expand a notebook. You can edit its title, entries, visibility, post placement and token limit. Use **Add entry** to add an item, **Remove** to remove one, then **Save note** to apply the changes. These edits are included in the next model request.

For an additional notebook, enter a key such as `quests` next to **Add instance**. The model will then receive that key automatically and can write:

```text
[mu:set quests courier]Meet the courier at the north gate before dusk.[/mu]
```

## Context and token budgets

**Where the model receives notes** controls their position in the model's input: after the latest player message by default, or at the end, before the conversation, or at a chosen in-chat depth.

**Where it appears in posts** controls where a visible notebook is displayed to the player. These are separate settings. Moving notes to the start of an RP post does not move their system message in the model's context.

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

To use the example, save it as `my-notes.md` and click **Import .md / .txt**. Alternatively, open **Paste or write notes directly**, paste it, and click **Import text**. The imported notes are attached immediately and appear in the editor. You do not need to add them to the prompt yourself.

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

## Technical notes

The built-in command parser and hiding regex are shown under **Commands and built-in regex**. MarkUps automatically installs one ST Regex rule named **MarkUps — hide note commands**, including cleanup of unfinished streaming commands. Keep ST's built-in Regex extension enabled to hide partial commands while streaming. Final command processing and the history interceptor work independently of that rule. Other regex scripts are preserved.

Placement is refreshed through ST's generation interceptor after the new player turn exists and before history token budgeting. MarkUps does not add its state to raw/profile utility requests such as Summaryception's summarizer calls.

Commands are removed from ordinary assistant-message text after processing, so other summarizers receive the RP prose rather than hidden command bodies. The original command-bearing reply and the visible snapshot are retained in that message's MarkUps metadata.

License: MIT, see [LICENSE](LICENSE).
