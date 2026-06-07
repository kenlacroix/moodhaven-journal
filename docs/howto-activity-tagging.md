# Activity Tagging — User Guide

> **Applies to:** Desktop app — v1.8.0+

Activity tagging lets you associate journal entries with what you were doing when you wrote them. Over time the Insights view uses this data to surface which activities correlate with better or worse mood — helping you spot patterns in your own life.

---

## What Are Activities?

Activities are short labels that describe what was happening around the time of an entry: Exercise, Social, Work, Reading, and so on.

MoodHaven Journal comes with 15 predefined activities:

| Activity | | Activity | | Activity |
|:---|---|:---|---|:---|
| Exercise | | Social | | Work |
| Reading | | Creative | | Meditation |
| Good Sleep | | Poor Sleep | | Nature |
| Family | | Cooking | | Music |
| Learning | | Travel | | Gaming |

You can also create up to 50 custom activities.

---

## Tagging an Entry

The activity picker appears below the tag chips in the journal editor (it is hidden in distraction-free mode).

1. Open an entry in the **Write** view.
2. Scroll below the text area to the activity row.
3. Click any activity pill to toggle it on or off. Selected activities are highlighted.
4. To add a custom activity, click **+ Add** at the end of the row, type a name (max 30 characters), choose an emoji, and press **Enter**.

Activities are saved automatically when you save the entry — no separate save step is needed.

---

## Viewing Activity Stats in Insights

Once you have tagged several entries, the **Insights** view shows an **Activity Correlation** chart in the Deep Dive section.

The chart displays a diverging bar for each activity that has at least 3 tagged entries:

- **Bars extending right (emerald)** — your average mood on days you logged this activity is *above* your overall average.
- **Bars extending left (rose)** — your average mood is *below* your overall average.

The longer the bar, the stronger the correlation. This is correlation, not causation — but it can surface useful patterns (for example, that your entries tagged "Poor Sleep" consistently score lower, or that "Nature" walks coincide with better moods).

Activities with fewer than 3 entries are excluded to avoid misleading results from too little data.

---

## Managing Custom Activities

To delete a custom activity:

1. Open the entry editor and find the activity in the picker.
2. Hover over the custom activity pill — a small delete icon appears.
3. Click the delete icon and confirm.

Predefined activities cannot be deleted. If you do not use a predefined activity, simply leave it unselected — it will not appear in the correlation chart until it has at least 3 tagged entries.

**Limit:** You can have at most 50 custom activities at one time. If you hit the limit, delete an unused custom activity before adding a new one.

---

## Filtering the Timeline by Activity

In the **All Entries** (Timeline) view, a row of activity chips appears below the search bar. Clicking a chip filters the list to show only entries tagged with that activity. Click the chip again or press **Clear** to remove the filter.

---

## Frequently Asked Questions

**Do activities sync across devices?**

Entry activity links (which activities are attached to which entries) sync via peer sync and cloud backup — so your tagging data is preserved across devices. Custom activity definitions (name and emoji) are not yet synced; each device manages its own custom activity list. This is planned for v1.8.1.

**Can I tag an entry with multiple activities?**

Yes. There is no limit to how many activities you can attach to a single entry.

**Will activities affect my mood score?**

No. Activities are purely descriptive metadata. They do not change or influence the mood score you set for an entry.

**Do activities appear in exports?**

Activity IDs are included in the encrypted `.moodhaven` export alongside the entry data, so they are preserved when you import on another device.

---

## Related

- Architecture (schema): [`docs/architecture.md`](architecture.md) — see Activity Tagging section
- Tauri commands: [`docs/tauri-commands.md`](tauri-commands.md) — see Activity Tagging section
- Source: `src/hooks/useActivities.ts`, `src/components/journal/ActivityPicker.tsx`
