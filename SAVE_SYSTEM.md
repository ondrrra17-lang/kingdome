# Save system

Emberwick Vale keeps one save per browser, as versioned JSON in `localStorage`. A save is a
few kilobytes, so nothing larger is needed.

## For players

- **First visit:** the game starts straight away.
- **Coming back:** the start screen shows what was saved, with **Continue Game** and **New Game**.
- **Saving by hand:** the **Save** button at the top right, or `Ctrl+S`. It shows "Game saved",
  or a message that stays on screen if saving failed.
- **Saving by itself:** every 30 seconds, soon after anything significant, and when the page is
  hidden or closed. It shows "Autosaved".
- **New Game** asks first, in the game and on the start screen, with Cancel selected. It says
  what would be lost. Cancelling changes nothing.

Clearing the browser's site data deletes the save. Saves do not move between browsers or devices.

## What is saved

| Section | Contents |
| --- | --- |
| `version`, `savedAt` | Format version and time written |
| `player` | Position, facing, distance travelled |
| `time` | Time of day, day number |
| `economy` | Coins, wood, wood capacity |
| `economy.food`, `economy.furs` | Food and furs in central storage |
| `kingdom` | Last day charged for food, field stage and growth, merchant visit and schedule, authored event outcomes and request status |
| `village` | Woodcutter limit, watch posts |
| `exploration` | Ids of opened chests and discovered places |
| `construction` | For each site by id: status, progress, builder's id |
| `npcs` | For each villager by id: job, traveler phase, position, facing, indoors, carrying, wood delivered |
| Production fields in `npcs` | Workplace id, partial hunting progress, carried food/furs, completed hunt count |

**Not saved:** Three.js objects, animation, paths, timers, what a villager was doing at that
moment, and the random stream. Views are rebuilt from the loaded state. Villagers decide what to
do again within a moment of loading, and search for a new path from where they stand.
Crop growth and hunting-cycle progress are saved separately from transient AI timers.
Carried food and furs are deposited only when the worker physically reaches storage.

## How a save is loaded

1. **Read** (`readSave`). Text that is not a save at all is refused. A newer version is refused
   too, and left untouched. Every value is then checked, and anything unusable takes its starting
   value and is listed as a repair.
2. **Applied to a new game state** (`applySave`), before any system or view exists, so they come
   up as if it had always been so.
3. **The first simulation step** adds finished buildings to collision and navigation, through
   the same code as during play.

Applying a save enforces the game's rules again rather than trusting the file:

| Rule | How it is held |
| --- | --- |
| No duplicate chest rewards | Opened chests are restored by id, and an opened chest pays nothing |
| No duplicate villagers | Existing villagers are updated by id, and unknown ids are ignored |
| No double payment | Nothing is charged or refunded on load. A funded site stays funded |
| Capacities match what is built | Wood capacity and limits are worked out again from finished buildings. The saved values are not used |
| Wood fits in storage | Clamped to the capacity |
| Woodcutter limit | Extra woodcutters go back to being unemployed |
| Only possible jobs | Alda stays a gatherer, and only someone who began as a traveler can be one |
| One builder per site, one site per builder | Handed out again. A site whose builder cannot return waits for another, keeping its progress |
| Daily income | Not paid again on loading |
| Food consumption | A saved high-water day prevents repeat deductions after reload or clock scrubbing. Forward skips consume for all elapsed days using the current settled population |
| Production professions | One farmer per completed farm and one hunter per completed lodge; invalid or excess assignments return to unemployed |
| Merchant | One visitor is reconstructed from saved phase and position; missed visits are skipped rather than replayed |
| Event rewards | Cache and request completion are saved before another interaction can reward them again |
| Valid positions | A player in a wall or the forest returns to the start. A villager moves to the nearest walkable spot |

## Damaged saves

| Situation | What happens |
| --- | --- |
| Latest save unreadable, earlier one good | It is set aside, and the earlier save is offered with a warning |
| No good save left | It is set aside under `emberwick-vale:save:damaged`, and the start screen explains and offers New Game |
| Part of a save damaged | It loads with what is usable, with a warning. Repairs are logged to the console |
| Save from a newer version | Cannot continue. New Game asks before replacing it |
| Storage full or blocked | The game carries on and shows an error. The last good save is kept |

## Storage keys

| Key | Holds |
| --- | --- |
| `emberwick-vale:save` | Current save |
| `emberwick-vale:save:previous` | The good save before it |
| `emberwick-vale:save:damaged` | The last unreadable save, kept for inspection. New Game leaves it in place |

## Performance

Automatic saves run in `requestIdleCallback`, outside the frame being drawn. A unit test holds
the average to under 1 ms. `localStorage` writes are synchronous, which is acceptable at this size.
The check for progress runs once per second.

## Changing the format

The current format is **version 2**. The `1 → 2` migration preserves all old progress,
adds 9 food and zero furs, starts food accounting on the saved day and leaves the new
buildings unbuilt. It does not charge old games for food consumed before Phase 5 existed.
The test fixture [e2e/fixtures/phase4-save.json](e2e/fixtures/phase4-save.json) was written
by the preserved Phase 4.5 production build, and is loaded through the browser start screen.

1. Raise `SAVE_VERSION` in [src/systems/save/SaveData.ts](src/systems/save/SaveData.ts).
2. Add a step to `MIGRATIONS` that turns the old version's data into the new one. Steps run in order.
3. Add the new values to `createSave`, `checkSave` and `applySave`, with a fallback for a missing value.
4. Add a test that loads a save written in the old format.

## Known limitations

- There is one save slot.
- Position and work are restored, but not the exact moment: a woodcutter partway through chopping
  starts that tree again, and a villager in mid-stride stops and decides again.
- Farmers keep field growth and hunters keep partial hunting progress, but resume by finding
  a fresh route to the workplace. The exact animation pose is not saved.
- A building's collider is added once nobody overlaps it, as during play, so someone saved inside
  a footprint keeps it walkable until they step out.
- Two open tabs share one save, and the last to write wins.
- A save edited by hand with plausible values, such as more coins, is accepted. It is a
  singleplayer game, and the checks are there for consistency rather than cheating.

## Code

| File | Purpose |
| --- | --- |
| [src/systems/save/SaveData.ts](src/systems/save/SaveData.ts) | Format, checking, applying a save. No storage or rendering |
| [src/systems/save/SaveStore.ts](src/systems/save/SaveStore.ts) | Storage, backup and damaged saves. Never throws |
| [src/systems/save/SaveSystem.ts](src/systems/save/SaveSystem.ts) | When to save |
| [src/rendering/SaveView.ts](src/rendering/SaveView.ts) | Start screen, in-game bar, confirmation dialog |

Tests: [src/systems/save/save.test.ts](src/systems/save/save.test.ts) and [e2e/save.spec.ts](e2e/save.spec.ts).
