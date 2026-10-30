# Gym manifests

A manifest describes a real gym's equipment so it appears in the app without
manual entry. They're written during development from the owner's photos of
each machine and committed here.

## Workflow

1. The owner shares photos of every piece of equipment.
2. For each photo, record what can be read: brand, model or serial number,
   equipment type, weight stack or plate range, increment, add-on micro
   weights. List which catalogue exercises (`src/seed/data/exercises.json` ids)
   the machine supports.
3. Anything that can't be read from the photo goes in `unverified` (e.g.
   `["max_kg", "increment_kg"]`). The app shows "Please confirm: …" in that
   machine's notes, and the owner fixes it in **My gym**.
4. Add `<gym>.json` to this folder, import it in `index.ts`, and run
   `pnpm test` (the manifest is validated and every exercise id must exist).

## Format

```json
{
  "version": 1760400000000,
  "gym": { "key": "main_gym", "name": "My Gym" },
  "equipment": [
    {
      "key": "chest_press_selection",
      "name": "Technogym Selection Chest Press",
      "type": "selectorized",
      "brand": "Technogym",
      "model": "Selection 700 MB950",
      "min_kg": 5,
      "max_kg": 100,
      "increment_kg": 5,
      "micro_increment_kg": 2.5,
      "notes": null,
      "exercise_ids": ["machine_chest_press"],
      "photos": ["IMG_1234.jpg"],
      "unverified": []
    }
  ]
}
```

Optional `weights_kg` lists the exact weights a rack has (e.g. dumbbells:
`[2, 4, 6, 8, 10, 12.5]`, ascending). When present, loads round down to those
weights instead of `min_kg + k·increment_kg`.

`version` is a millisecond timestamp. Bump it whenever the file changes: ids
are derived from `gym.key` and each equipment `key`, and under last-write-wins
a newer manifest updates the records, while any edit the owner made in the app
afterwards (a newer timestamp) is never overwritten.
