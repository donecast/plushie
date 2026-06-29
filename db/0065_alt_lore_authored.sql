-- ============================================================
-- 0065 — AUTHORED alt-lore for released plushes that had NO usable
-- Plushie Dreadfuls lore in their live product description.
--
-- ⚠️ EVERY row in this file is ORIGINAL, written from scratch in PD's
-- same-style voice (there was no PD source prose to retell). SPOT-CHECK
-- before trusting. Rows marked [SENSITIVE] cover a health condition and
-- were written for medical accuracy + care — review those especially.
--
-- Excluded on purpose: ~65 unreleased "considered for prototyping" voting
-- placeholders (not for sale) and non-plush merch. We do not fabricate lore
-- for products that don't exist yet — especially the medical/identity ones.
--
-- Idempotent (ON CONFLICT). Requires 0049. ALREADY APPLIED to prod via MCP on 2026-06-29.
-- ============================================================

begin;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-melancholy-rabbit-plush-stuffed-animal', 'Melancholy isn''t quite sadness — it''s softer than that, and stranger. It''s the ache of a grey afternoon you wouldn''t trade for sunshine. A fondness for the rain on the window and the company of your own quiet thoughts. The bittersweet pull toward a feeling you can''t even name.

Melancholy Rabbit knows this territory well. They aren''t here to cheer you up or chase the gloom out the door — they understand that some moods aren''t problems to be solved, just weather to be sat with. The alchemy symbol they carry marks the heavy, contemplative element of this feeling: not despair, but depth.

Pull them close on the low, lingering days. Melancholy is its own kind of beautiful, and you never have to apologize for visiting it a while.') -- [AUTHORED — no PD source]
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-happiness-rabbit', 'Some feelings arrive quietly. Happiness is not one of them. It bursts in sun-yellow and unbothered, convinced that today might just be the good one — and somehow, around this rabbit, it often is.

Happiness Rabbit is the warm patch on the floor where the light lands. The first sip of something hot on a cold morning. The small, ordinary joys that never make headlines but quietly make a life. The alchemy symbol they carry marks the bright, rising element of the feeling: not loud, exactly — just impossible to ignore.

You can''t keep happiness forever; it comes and goes like weather. But when it visits, this little sunbeam of a bun is here to help you notice it while it lasts.') -- [AUTHORED — no PD source]
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-neapolitan-rabbit-plush-stuffed-animal', 'Three flavors. One rabbit. Absolutely no consensus.

The Neapolitan Rabbit cannot pick a favorite — chocolate, strawberry, and vanilla, swirled into a single scoop of bunny that flatly refuses to be separated. Why settle for one when the carton offers all three in tidy stripes? (And be honest: everyone has a favorite stripe, and everyone is a little bit wrong about which one is best.)

Soft-served and sweet straight through, this one''s for the indecisive, the easily delighted, and anyone who''s ever had dessert for dinner purely on principle. Just keep them well out of the sun.') -- [AUTHORED — no PD source]
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-mint-chip-rabbit-plush-stuffed-animal', 'Cool, green, and just a little chaotic — Mint Chip Rabbit is the flavor people have strong opinions about, and frankly does not care.

Some say mint belongs in toothpaste, not dessert. Mint Chip Rabbit gently suggests those people are simply not built for greatness. Refreshingly cold and flecked with little chips of mischief, this bun is the scoop that wakes up your whole mouth and your whole shelf.

Love it or hate it — there is no lukewarm middle with mint chip. Pick a side. (The right side is soft, green, and currently looking right at you.)') -- [AUTHORED — no PD source]
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-mars-bunny-plush-stuffed-animal', 'Fourth rock from the sun, and absolutely tired of the "angry red planet" branding.

Mars showed up rust-red and weather-worn, yes — but ask anyone who''s actually been there (no one has) and the truth is less rage, more rugged. This is a world of dust storms and long-dead volcanoes, with two lumpy little moons, Phobos and Deimos, trailing along behind it like devoted and slightly anxious pets. Its great canyon could swallow a continent whole; its tallest volcano makes Everest look like a speed bump. And that famous red? Just iron oxide. Just rust. Which is, honestly, deeply gothic of it.

Embroidered with the marks of the red world and trailing its tiny moons, Mars Bunny is here for the dreamers who look up and wonder what it would take to go. The transmission window is open. The red planet is waiting. Pack warm — it gets cold out there.') -- [AUTHORED — no PD source]
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-puck-dreadful-rabbit-plush-puppet', 'You already know Puck — the face on the logo, the rabbit who stared into the void and decided to wink back. Now Puck has a mouth that moves, and opinions to match.

The Puck Dread Puppet is the mascot of this whole strange, soft, slightly-haunted family, reimagined as a hand puppet — which means Puck can finally do what Puck was always meant to do: talk. Slip your hand inside and let the most irreverent bun in the Dreadfuls give voice to the things you can''t quite say yourself. Puppets have a way of carrying the hard stuff for us, with a smirk that takes the edge right off.

Left and right, light and dark, broken and whole — Puck holds all of it, and now Puck can heckle the void to its face. Just don''t expect them to be polite about it.') -- [AUTHORED — no PD source]
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-type-i-diabetes-plush-stuffed-animal', 'Type 1 diabetes isn''t something you catch, outgrow, or bring on yourself. It''s an autoimmune condition: the body''s own defenses turn on the cells in the pancreas that make insulin, until those cells can no longer keep up. Without insulin, the body can''t turn food into the energy it needs — so people with T1D supply it themselves, through injections or a pump, every single day, for the rest of their lives. It often arrives in childhood, which is why it was long called juvenile diabetes, though it can appear at any age.

It is a relentless kind of arithmetic: counting carbs, checking blood sugar, chasing the highs and catching the lows, adjusting again and again — all while the world assumes it''s the "lifestyle" kind and offers advice nobody asked for. It''s exhausting in a way that rarely shows on the outside.

This rabbit carries an insulin pump of their own, and a steady, unshakable solidarity for everyone managing T1D — and for the families who count carbs at midnight right alongside them. You aren''t doing this alone, and you aren''t doing it wrong. You''re doing something extraordinarily hard, every single day, and it counts.') -- [AUTHORED · SENSITIVE/health — review closely]
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-cancer-support-rabbit-plush-stuffed-animal', 'Some battles are fought quietly — in waiting rooms and infusion chairs, measured out in scan results and good days and harder ones. The Cancer Warrior Rabbit stands with everyone in the middle of that fight: patients, survivors, and the people who love them and sit beside them through every appointment.

Cancer isn''t one thing; it''s hundreds, each with its own course, its own treatment, its own toll on the body and the spirit. What they share is the courage it takes to keep going — through the exhaustion, the fear, the long uncertain stretches — and the fierce, ordinary heroism of simply showing up for one more day.

Dressed in awareness purple, this bun is a soft thing to hold when everything else feels hard, and a small reminder that no one should face this alone. A portion of proceeds supports St. Jude Children''s Research Hospital — so that more warriors, the smallest ones especially, get the chance to keep fighting.') -- [AUTHORED · SENSITIVE/health — review closely]
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

commit;
