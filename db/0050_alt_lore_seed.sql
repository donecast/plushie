-- ─── Alt-lore seed: our same-style retellings + extracted accessories ──
-- Generated from a workflow pass over every plush/mini/bundle (and narrative
-- clothing) in the live catalog. Each row sets catalog_overrides.alt_lore (our
-- original retelling shown in place of PD's prose) and, where the prose hid an
-- included extra not already on the Set-Includes list, an updated accessories
-- list. Uses ON CONFLICT so it never clobbers an existing override's other
-- columns (lore/symbolism/image/category/retired). Re-runnable (idempotent).
-- Requires 0049_catalog_alt_lore.sql first.

begin;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-burnout-boba-bunny-in-cup-plush-and-cup-collector-set', 'Welcome to Burnout Boba. Step right up — we''re ready for you.

We do have to be upfront about the menu, though. There is exactly one option. One flavor, one creature, one destiny: Boba Bun. Served with Boba Balls. That''s it. That''s the whole thing.

Every order arrives in a reusable sippy cup — complete with a pop-up straw for maximum slurp satisfaction. Just... take the bun out before you pour anything in, yeah?')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-gemini-rabbit-plush-keychain', 'Gemini season runs May 21 through June 21 — and if you know a Gemini, you already know they contain multitudes.

Charming, quick-witted, and endlessly adaptable, Geminis seem to glide through the world on pure social momentum. But the flipside of all that sparkle? A restlessness that never quite settles, a tendency to lose interest just as things get comfortable, and a relationship with decision-making that is… complicated. Inconsistency isn''t a flaw to a Gemini — it''s a feature. Why pick one thing when you could have everything?')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-blueplaid-pirate-cove-bundle-plush-stuffed-animal', 'The Pirate Cove is under siege. The Royal Navy has arrived once again — sworn enemies of all things floofy and free — and Blueplaid the Dread Pirate is calling in every favor he''s owed.

All hands to the paper boat fleet. Man your cannons (or lady them, as you prefer). The Cove is relocating to the far side of the ocean, and it can''t happen without you. Blueplaid will hold the wheel — he only has the one eye, but it never misses a thing on the horizon. Shrabbit the Shark lurks below decks with a very important secret: an Emotional Support Shrimp tucked away in a hidden compartment. And Crowful Crow keeps watch from the masthead, quietly guarding his treasure in a zip-safe chest.

These three pirate misfits need safe harbor. Give it to them. Their whole adventure — the sea, the cannons, the magnificent chaos of the Cove — is also immortalized on a colorful printed tapestry, ready to transform any hideaway into the New Pirate Cove.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-horned-cloak-outfit', 'Seasoned potion-brewer? Woodland entity taking a personal day? That''s entirely up to you…')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plush-hoodie-chaos-hoodie', 'Your little gremlin has places to be and disasters to orchestrate — might as well be snug doing it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-asylum-ghost-robe-outfit', 'The restraints couldn''t hold us — so now we sport them proudly, a badge of very cozy defiance.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-chaos-bunnculus-mini-plush-keychain', 'Every Plushie Dreadful begins the same way — as a seed. A Bunnculus. Small, strange, and full of potential.

From that tiny origin, something wonderful takes root. This one comes on a keychain, so it can travel with you. Keep it close.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-coffee-council-set-plush-stuffed-animal', 'The Coffee Council has been called to order.

Four Latte Lapins — Caramel, Mocha, Matcha, and Americano — have assembled to deliberate on a matter of great gravity. A barista stands accused of crimes against the bean. The evidence was damning. The deliberation was brief. The verdict came swiftly and without mercy: guilty on all counts. Her sentence is permanent custody — to be kept under the watchful eyes of all four wardens, indefinitely.

The Council considers this proportionate. The Council considers this justice. The Council would also like another oat milk latte, if you don''t mind.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-violet-neon-love-rabbit-plush-stuffed-animal', 'Love is a wound that never quite heals — and somehow that''s the whole point. It cracks you open, leaves you tender, leaves you stitched together in places you didn''t expect. But without that crack, nothing gets in. Without the risk, nothing real ever reaches you.

Dare to fall anyway. Dare to cuddle and ache and hope again. Because a heart that''s been patched up has room in every seam.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-toxic-love-rabbit-plush-stuffed-animal', 'Love is a wound that never quite heals — and somehow that''s the whole point. It cracks you open, leaves you tender, leaves you stitched together in places you didn''t expect. But without that crack, nothing gets in. Without the risk, nothing real ever reaches you.

Dare to fall anyway. Dare to cuddle and ache and hope again. Because a heart that''s been patched up has room in every seam.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-jupiter-bunny-plush-stuffed-animal', 'Somewhere out past the asteroid belt, the largest planet in the solar system received some unsolicited opinions about her appearance. Jupiter — storm-wrapped, moon-rich, magnificent — processed this information and arrived at a very reasonable conclusion: no.

She showed up anyway, in polka-dot bloomers, with her Great Red Spot on full display and absolutely zero apologies queued. Her storm bands are embroidered right across her belly, her moons have settled into their comfortable orbits around her, and she has brought along a tote bag worthy of a world that has eighty-something satellites and not a single thing left to prove.

The transmission window is brief. All these worlds could be yours — this one for a little while, if you move quickly. She won''t wait forever. Planets rarely do.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-emily-the-strange-plush-rabbit-stuffed-animal', 'Some collaborations are written in the stars — or at least in the fog of San Francisco, circa 1998. That''s where Emily the Strange creator Rob Reger and Plushie Dreadfuls creator American McGee crossed paths, two architects of goth culture building their worlds side by side in the same city, at the same moment, without yet knowing what they''d eventually make together.

Twenty-eight years later, here she is: Emily in a Plushie Dreadfuls onesie, ready for the most gothic slumber party imaginable, kitties included. This is a LIMITED EDITION DESIGN — 2,000 Plushie + Tote sets and 200 Plushie + Tote + Autographed Card sets, each card signed and numbered by both Rob and American. Once all 2,200 find their homes, they''re gone for good.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-fuzzy-white-chocolate-gingham-hoodie-dress', 'Dress your bun in something deliciously snuggly — this sweet little number is pure cozy energy.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-fuzzy-black-and-red-heart-hoodie-dress', 'Warm, dark, and full of heart — this one keeps your bun cozy AND dramatically smitten.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-autism-spectrum-rabbit-goth-edition-plush-rabbit-stuffed-animal', 'There is a particular kind of person who walks into a goth space and thinks: oh, finally. Maybe that person notices the way velvet feels different from everything else. Maybe they have memorized every Bauhaus B-side in order. Maybe the world outside has always felt a little too loud, a little too structureless, a little too indifferent to the things that matter — but here, in a world built on careful aesthetics and layered systems and the comfort of a palette that has rules, something clicks.

Goth Autism Bun lives at the intersection of those two experiences. Sensory richness meets structured beauty. The loner tribe meets the pattern-loving mind. Masking and unmasking — the long exhale of finally being in a room where intensity is the vibe, not the problem.

The spectrum infinity symbol sits on her tummy. The magnetic paw is ready. This isn''t a diagnosis to manage — it''s a (black) celebration of a mind that notices everything, remembers everything, and deserves a space that''s built for it.

Because autistic people exist in a world that wasn''t designed with them in mind — and that gap is the world''s problem to fix, not theirs. Therapy, accommodations, community — whatever gets you to a place where you can be fully yourself. That''s what we''re building toward, together.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-depression-rabbit-v2-lavender-le-plush-stuffed-animal', 'This is a LIMITED EDITION color variation — only 1,000 of this bun will ever exist. When they''re gone, they''re gone.

The Mayo Clinic describes Depression as a mood disorder that causes a persistent feeling of sadness and loss of interest — also called major depressive disorder or clinical depression. It shapes how you feel, think, and move through the world, and on the hardest days it can make ordinary life feel impossibly heavy, like the floor has gone soft beneath you.

This isn''t the blues. It isn''t a phase or a personal failing, and you can''t simply decide your way out of it. Depression is a real, long-term condition — but it is treatable. Most people find their way through with medication, therapy, or some combination of both. There is a path forward, even when you can''t see it yet.

The semicolon on the bag is there on purpose. It''s the symbol of The Semicolon Project — a reminder that the sentence isn''t over, that you chose to keep going. A small punctuation mark carrying a lot of weight, for those who know what it means to carry it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-depression-rabbit-v2-void-le-plush-stuffed-animal', 'The Mayo Clinic describes Depression as a mood disorder that causes a persistent feeling of sadness and loss of interest — also called major depressive disorder or clinical depression. It shapes how you feel, think, and move through the world, and on the hardest days it can make ordinary life feel impossibly heavy, like the floor has gone soft beneath you.

This isn''t the blues. It isn''t a phase or a personal failing, and you can''t simply decide your way out of it. Depression is a real, long-term condition — but it is treatable. Most people find their way through with medication, therapy, or some combination of both. There is a path forward, even when you can''t see it yet.

The semicolon on the bag is there on purpose. It''s the symbol of The Semicolon Project — a reminder that the sentence isn''t over, that you chose to keep going. A small punctuation mark carrying a lot of weight, for those who know what it means to carry it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-depression-rabbit-v2-snow-le-plush-stuffed-animal', 'Depression is what medical professionals call a mood disorder — one that wraps itself around your sense of self, draining colour from ordinary days and making the most familiar things feel distant and strange. It touches how you think, how your body moves through the world, and how you understand your own worth. Some mornings, getting up feels like climbing a mountain no one else can see.

This is not a character flaw. It is not something you can simply decide your way out of. Depression is a genuine condition, often requiring real support — therapy, medication, community, time. And here is the part that matters most: most people who seek help do get better.

The semicolon on the bag carries weight. It''s the symbol of The Semicolon Project — a mark chosen because a semicolon is what a writer uses when a sentence could have ended but didn''t. For those who''ve faced depression, anxiety, addiction, or other struggles, it''s a quiet declaration: the story isn''t over. You are not over.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-depression-rabbit-v2-pink-le-plush-stuffed-animal', 'Depression is what medical professionals call a mood disorder — one that wraps itself around your sense of self, draining colour from ordinary days and making the most familiar things feel distant and strange. It touches how you think, how your body moves through the world, and how you understand your own worth. Some mornings, getting up feels like climbing a mountain no one else can see.

This is not a character flaw. It is not something you can simply decide your way out of. Depression is a genuine condition, often requiring real support — therapy, medication, community, time. And here is the part that matters most: most people who seek help do get better.

The semicolon on the bag carries weight. It''s the symbol of The Semicolon Project — a mark chosen because a semicolon is what a writer uses when a sentence could have ended but didn''t. For those who''ve faced depression, anxiety, addiction, or other struggles, it''s a quiet declaration: the story isn''t over. You are not over.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-spring-festival-love-rabbit-plush-stuffed-animal', 'Love is not safe. Anyone who tells you otherwise has never really let themselves fall.

It tears. It leaves marks. It asks everything of you and offers no guarantees. But a life without it — sealed tight, untouched — is its own kind of hollow. So go ahead. Open up. Hold on. Risk the ache of it.

Because the tenderness you find on the other side of that vulnerability? Worth every single scar.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-lucky-green-plaid-love-rabbit-plush-stuffed-animal', 'Go ahead — make the joke. The spinach one. Get it out of your system.

Done? Good. Because here is what I actually am: I am the four-leaf clover in your pocket when you forgot to check. I am the light turning green just as you reach the corner. I am adorned with stitches — which, for the record, have nothing to do with love or luck and everything to do with Thursday night — and lucky clovers, because I believe in stacking the odds.

Love, as it turns out, is not purely a feeling. It is also a numbers game, and right now your numbers are not great. I am here to fix that. Hold me close. Trust the green. And dare to love — because even the scrapes and losses are better than never having felt anything at all.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-blue-plaid-love-rabbit-plush-stuffed-animal', 'The legend goes that Blueplaid loved so recklessly the sea itself took offence — pulled him under by his plaid lapels, wrapped him in kelp and regret, and left him to sink among all the unsent valentines and waterlogged confessions that had ever missed their mark. Another bun might have drowned there. But Blueplaid picked his own stitches loose, sewed himself back together in the dark, and kicked for the surface.

He came up clutching a bottle. Inside it: a letter. A stranger''s words, ink-smeared and salt-swollen, about loving something too much to survive it and surviving anyway. He wept (he is constitutionally incapable of not weeping at this sort of thing), then folded the letter into a small boat and set it loose on the current.

That was the beginning of the fleet. Every bottle he fishes from the waves holds another letter — apologies, declarations, the magnificent wreckage of things people write when they believe no one is reading. He folds each one into a sail and adds it to his flotilla, captaining the whole absurd armada toward a horizon he cannot name but refuses to stop believing in. If you have ever sealed a feeling into silence and cast it away — he found it. He read every word. He is sailing toward you still.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-card-guard-rabbit-plush-stuffed-animal', 'Somewhere in the Queen''s garden, a Card Guard pauses mid-brushstroke and wonders — not for the first time — why no one simply planted red roses from the start. A great deal of unpleasantness might have been avoided. Several heads, certainly. Though in Wonderland, a head is only safe until the Queen decides otherwise, so perhaps the arithmetic was never in anyone''s favour.

Better, then, to keep painting. Better to keep wandering the hedgerows, brush in hand, and not ask too many questions about the scorekeeping.

This plush belongs to the Victorian McGee''s line — the kind of toy Alice Liddell herself might have pulled from a shop window in Victorian London, had American McGee kept a toy shop somewhere in the neighbourhood of Mrs. Lovett''s meat pie establishment. Whimsical. Slightly unsettling. Exactly right.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-scoliosis-rabbit-pink-edition-plush-stuffed-animal', 'Some things you carry inside your body — invisible to everyone around you, felt by you in every posture, every morning, every chair that wasn''t built with you in mind. Scoliosis is one of those things. The curve is yours. So is the strength it took to keep going anyway.

The Scoliosis Bunny holds two alchemy symbols on its body: one for chalk, one for Hepar Calcis — a nod to the minerals that build and sustain our bones. The split ribcage marks what spinal misalignment can look like from the inside, and what resilience looks like from the outside.

This bunny is for everyone who lives this quietly — and for anyone who loves someone who does. Visibility matters. Being seen matters. You are not walking this alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-workaholic-rabbit-plush-stuffed-animal', 'The guilt shows up the moment you stop. Even for five minutes. Especially for five minutes.

Your setup is right there — watching, waiting, silently keeping score. You''ve logged more hours than you should this week, and yet the unfinished list finds you at 2am, wide awake, composing emails in your head. The world celebrates this. "Hustle" is practically a personality type now. Nobody throws a party for rest.

So let this little rabbit sit somewhere you''ll actually see it — desk, nightstand, wherever the blur of your days tends to collect — and remind you, quietly, that stepping away isn''t failure. The inbox will survive. So will you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-rose-love-rabbit-plush-stuffed-animal', 'Love has a way of leaving marks — the kind that ache and the kind that heal. It asks everything of you, and sometimes takes it. But a heart that has never been put at risk has never truly beaten.

So go ahead. Open up. Cuddle recklessly. Fall hard. The Love Rabbit understands — stitches, patches, and all.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-alice-anxiety-rabbit-plush-stuffed-animal', 'Somewhere in Wonderland, tucked behind the wrong end of a peculiar orange mushroom, Alice found a door she hadn''t expected. Curiosity has always been her greatest quality and her most inconvenient habit.

What stepped through that door was something new entirely — the spirit of Anxiety Rabbit woven into the soul of Alice Bun. Her dress burned orange, the Anxiety color, scattered with black hearts. Because pretending the dark isn''t there seemed like more effort than it was worth.

She carries a Vorpal Bunny Blade now. Her eyes may betray her worry, but her enemies would do well not to underestimate those teeth. This is Anxiety Alice — a plush in the tradition of what Alice Liddell herself might have found in the window of American McGee''s Victorian toy shop, just down the lane from Mrs. Lovett''s.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-adhd-acceptance-mad-hatter-hare-plush-stuffed-animal', 'The tea party never ends here. Seats are always shifting, cups are perpetually mid-pour, and every conversation is simultaneously beginning and almost finished. This is ADHD Hatter''s domain.

He doesn''t run the party so much as *become* it — overflowing with ideas, with generosity, with the kind of chaotic warmth that fills a room whether or not anyone else showed up. The world calls him mad. He considers that a compliment.

A brain built for Wonderland doesn''t need to apologize for how it works. We''re all a little mad here — some of us just lean in with a very good hat.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-autism-acceptance-cheshire-cat-plush-stuffed-animal', 'There is something deeply familiar about a cat who speaks in riddles — who fades in and out of social situations at will, who grins when others cannot read him, and who finds the underlying logic of Wonderland perfectly clear while everyone else trips over it.

The Autism Acceptance Cheshire Cat gets it. When social cues feel like a maze with no map, you are not lost — you are reading a different set of directions. Wordplay, patterns, double meanings: these are not obstacles here. They are the magic.

You were never the only mad one. "We''re all mad here," the cat reminds you, smile and all — whether you''re wandering Wonderland or just trying to make it through Normieland. A Victorian McGee original, the kind of companion Alice Liddell might have tucked under her arm on the way out of the toy shop, just past Mrs. Lovett''s.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-frosty-cheshire-cat-plush-keychain-accessory', 'A grin without a cat — the most curious thing imaginable, Alice once thought. And yet here it is, small enough to clip to a bag, bright enough to carry into whatever strange territory the day has in store.

Let Chesh ride along as a pocket-sized reminder: nothing in this realm is quite as serious as it seems. The Red Queen''s jurisdiction does not extend to your keychain.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-dreadful-dinosaur', 'Let''s talk about extinction — not the fossil-fuel guilt kind, but the useful kind. The kind where something that had long overstayed its welcome finally clears the way for whatever comes next. Meet the Dreadful Dinosaur: part rabbit, part quiet reckoning, dressed in soft teal fur with button eyes that have already made their peace with the end of the world.

And then there''s Steve. Steve is the meteor — technically. In practice, Steve is profoundly, spectacularly lazy. The anger is there, visible in every inch of his Grrr Face™, but it''s the annoyance of someone interrupted mid-nap. He is the Armageddon you ordered two months ago that still hasn''t shipped. He is the end of your worst habits and most draining patterns, except he hit snooze so many times the alarm clock itself went extinct. You may need to throw him yourself.

Together they are a matched set. One at peace with transformation, one theoretically capable of causing it. The dinosaur holds Steve not out of dread, but out of gratitude — because the fire that burns the old stuff down is the same fire that clears room for everything new. Welcome the meteor. Encourage the meteor. Aim him well.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-imposter-syndrome', 'She''s here, doing the work — and somehow convinced she doesn''t belong.

Imposter Syndrome is still finding her way through the prototype stage, waiting for enough believers to bring her to life. If you see yourself in her (and she''d insist you shouldn''t, because clearly you''ve earned your place and she hasn''t), tap the notification button. Let her know she''s not alone in that feeling.

This design is a placeholder — a stand-in for the real thing, just like she sometimes feels she is.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-queen-of-hearts-rabbit-plush-stuffed-animal', 'Off with your… reservations about cuddling.

This is a plush toy imagined as something Alice Liddell — the original Alice from Alice in Wonderland — might have spotted in the window of a toy shop run by American McGee in Victorian London. Probably situated right next door to Mrs. Lovett''s famous meat pie establishment.

She rules absolutely, even at naptime. The Queen of Hearts does not negotiate.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-caterpillar-stuffed-animal', 'Everyone who stumbles into Wonderland eventually ends up at his mushroom. He answers their questions with long, unhurried exhales of flavored air. He watches them leave feeling transformed. He watches them forget by morning. He has stopped being surprised by this.

A worm gave him the red heart-stitched scarf he wears. She eventually became a butterfly and drifted off to wherever butterflies go. He remained. He is very good at remaining.

He is the first weighted Plushie Dreadful — not merely so he stays seated atop his mushroom, but because some things genuinely are heavy and deserve to be acknowledged as such. The alchemical symbol for antimony marks his chest: the wild animal soul living quietly beneath all that worn, patient wisdom. His philosophy, in four words: the horrors persist but so do i.

His tote bag reads "Life is what your thoughts make it" in a font that''s barely there — smoky, half-dissolved — because the truth has always been legible. You just have to lean in.

A plush toy in the style of something Alice Liddell (the original ''Alice'' from Alice in Wonderland) might have purchased had American McGee run a toy shop in Victorian London. Probably right next door to Mrs. Lovett''s meat pie shop.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-lucky-love-rabbit-plush-keychain-accessory', 'All that love, compressed into keychain form.

Everything you know about Lucky Love Rabbit — the warmth, the softness, the reminder that affection deserves to travel with you — now fits on your bag strap. A little ambassador of tenderness, ready to go wherever you go.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-year-of-the-horse-plush-stuffed-animal', 'Spirited, restless, and born under a year that demands you run toward something.

The Year of the Horse rabbit arrives in limited numbers — once they''re gone, they''re gone for good. No second printing, no restock, no slow trot back around. If you feel the pull, trust it. Horses always do.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-coco-memento-chocolate-cake-rabbit-plush-stuffed-animal', 'Nobody can quite agree on where the chocolate river begins. What''s certain is that somewhere between the third truffle and the seventh bonbon, the edges of Mile Stone Birthday Cake Rabbit''s world started to go soft and sweet. The sprinkles multiplied. The swirl deepened. And when she finally opened her eyes again, she was standing somewhere else entirely — knee-deep in molten chocolate, candle still burning on her head. She had become Coco Memento Chocolate Cake Rabbit. A self summoned from the deepest layer of the dream.

She is made of rich chocolate-brown plush with dark cocoa drip detail trailing down her long floor-length ears. Sprinkles scatter across the darkness like stars dropped into a confectioner''s sky. Her eyes don''t match — one dark chocolate, one white — because she''s looking at two worlds at once. Beneath her removable brown-and-cream striped shirt, an embroidered heart with a heartbeat line pulses quietly, reminding her (and you) that underneath the sugar and the swirling, this is still a story about reaching milestones and surviving them.

Her tote bag carries original artwork from both sides of the dream: on one face, she sinks blissfully into a mixing bowl of pure chocolate; on the other, she floats at peace, eyes closed, paws folded, surrendered completely to the sweetness of it all.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('victorian-mcgees-tweedle-dee-and-tweedle-dum-plush-stuffed-animal', 'Contrariwise, they would have to disagree — but they both agree they''re right.

Tweedle Dee and Tweedle Dum have an argument for every occasion and a contradiction for every argument. They are, as they would tell you themselves, a perfectly logical pair. They arrive together, because of course they do. One without the other would simply make no sense at all — and nonsense, as any visitor to Wonderland learns quickly, has very specific rules.

A plush set imagined in the spirit of something Alice Liddell might have found in American McGee''s Victorian London toy shop, right next door to Mrs. Lovett''s.', '[{"name":"Tweedle Dum","key":"tweedle dum"},{"name":"Tote Bag","key":"tote bag"},{"name":"Tweedle Dee","key":"tweedle dee"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-grandma-wolf-rabbit-plush-stuffed-animal', 'What cuddly eyes you have, Grandma… what cuddly eyes…

Grandma Wolf is perfectly harmless, of course. That''s what she''d like you to think, anyway, tucked up in her bed with her basket close at hand. Nothing to worry about at all. Nothing inside that basket worth checking. Everything is completely fine.

A plush in the spirit of something Alice Liddell might have found in American McGee''s Victorian toy shop — the one next door to Mrs. Lovett''s — except this one arrived from a different fairy tale entirely, and she brought her insides with her.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-tooth-scary-plush-stuffed-animal', 'Allow us to introduce Stressica — sometimes called the Tooth Scary, and second cousin (distant, estranged, definitely not close) to the actual Tooth Fairy. Where her famous relative rewards patience and leaves gifts under pillows, Stressica operates on a different system entirely. Grind your teeth one too many times — from deadlines, from that one coworker, from the particular specific dread that arrives at 2am — and there she is. Conjured, just like that.

Her mission is extraction. Not the dental kind (well, not only). She is here to locate every source of stress in your life and deal with it in the most dramatically satisfying way possible. The boss who makes Mondays miserable? Gone. The situation you''ve been dreading for weeks? Handled, thoroughly, with great cathartic force.

She comes with a plush tooth, because she is nothing if not on-brand.', '[{"name":"Totebag","key":"totebag"},{"name":"Plush Tooth","key":"plush tooth"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-harajuku-cheshire-cat-plush-stuffed-animal', 'He already knows you''re here. He''s been waiting.

Victorian McGee''s Cheshire Cat isn''t the sort of cat you find — he''s the sort who decides he''s found you. His fur carries the particular softness of things that exist slightly sideways from reality, and his stripes trace winding routes through a Wonderland that shifts depending on how closely you''re paying attention. His embroidered grin stretches wide and knowing, the smile of a creature who has heard every riddle and enjoyed watching people try to answer them. His button eyes shimmer with something older than mischief. Around his neck, a bow of deep purple silk — salvaged from somewhere grand and since forgotten.

He is dreadfully delightful and delightfully dreadful. Not merely a companion to hold, but one to keep close, like a secret you''re glad you''re carrying.

His tote bag arrives with him: gothic artwork on one face, his haunting likeness rendered in violet and bone-white against curling flourishes. The reverse carries the words "Victorian McGee''s Alice" in baroque lettering that hides in the shadows until the light finds it — like a password whispered to the right door.

He is your strange little guardian through strange days. Patient. Smiling. Already certain you''ll bring him home.

A plush toy imagined as something Alice Liddell (the original Alice from Alice in Wonderland) might have purchased had American McGee run a toy shop in Victorian London — probably right next door to Mrs. Lovett''s meat pie shop.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-harajuku-alice-rabbit-plush-stuffed-animal', 'Stabby and stylish — Harajuku did it first.

What might Alice Liddell have carried home if American McGee kept a toy shop in Victorian London? Something delightfully sharp-edged, no doubt — a little bunny with a blade and a bag to match, nestled just down the lane from Mrs. Lovett''s infamous pie establishment.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-purple-jumpsuit', 'Tail door included, obviously. We don''t do uncomfortable — we do devastatingly laid-back.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-harajuku-white-rabbit-plush-stuffed-animal', 'He was never just late — he was inevitable.

The White Rabbit has always existed somewhere at the boundary of the world you know: ears alert, velvet waistcoat perfectly pressed, pocket watch ticking its quiet countdown to elsewhere. He is a guardian of thresholds, stitched from patience and old secrets, waiting for the precise moment you are ready to follow.

This is American McGee''s vision of a toy Alice Liddell herself might have found in a Victorian London curiosity shop — set just around the corner from Mrs. Lovett''s rather questionable pie establishment. A companion for wanderers, and for those who are always, always running behind.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-hysteria-rabbit-plush-keychain-accessory', 'Hysteria in miniature — all the feeling, clipped right to your bag.

Small enough to go everywhere you go, loud enough that you''ll never feel it alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-event-horizon-rabbit-plush-stuffed-animal', 'Something stirs at the edge of everything — past the last light, past the point of no return. Event Horizon is waiting there, patient as gravity, curious as the dark between stars.

This one is still becoming. Show the universe you want them here.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-hysteria-alice-rabbit-plush-stuffed-animal', 'Wonderland was never quite what the storybooks promised.

This is the Alice that American McGee imagined — the one who came back changed, clutching something sharp and wearing her unravelling like a crown. Had he kept a toy shop in Victorian London, tucked beside Mrs. Lovett''s infamous pie establishment, you might have found her on the shelf: 30 centimetres of perfectly unsettling company, tote bag at the ready.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-black-anxiety-rabbit-plush-keychain-accessory', 'Anxiety doesn''t travel alone — and neither should you.

Clip this little one to your bag and carry the understanding that someone else knows exactly how it feels. Wherever you wander, they wander with you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-blue-anxiety-rabbit-plush-keychain-accessory', 'Anxiety doesn''t travel alone — and neither should you.

This little blue companion clips right to your side, a soft reminder that the feeling is known, the feeling is shared, and you don''t have to carry it without someone close.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('victorian-mcgees-fairytales-pied-piper-and-rat-plush-stuffed-animal', 'The old story has it wrong.

The Piper never came to drive them away — he came because the music called to them, and they to him. His tune is not a command but an invitation, and every rat who follows does so freely, out of something that looks a great deal like love.

He travels light: a keychain-sized wanderer with melody stitched into his very ears. His companion — full-sized, soft-furred, eyes wide with quiet devotion — is no villain of anyone''s tale. They are kin, these two. A set for everyone who has ever understood the rat''s side of the story. Eek eek ❤️', '[{"name":"Plush Rat","key":"plush rat"},{"name":"Tote Bag","key":"tote bag"},{"name":"Plush Pied Piper Mini Keychain","key":"plush pied piper mini keychain"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-miles-stone-birthday-cake-rabbit', 'Birthday? Unbirthday? Any day with cake is worth marking.

Mile Stone knows that some moments deserve to be celebrated whether or not the calendar agrees — and they''ve come frosted, fluffy, and ready for whatever occasion you decide this is.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-purple-ice-love-rabbit-plush-stuffed-animal', 'Love is not a gentle thing. It tears you open, leaves marks, demands everything — and still you reach for it again.

Because without the ache, there is no warmth. Without the risk, there is nothing at all. So you stitch yourself back up, you patch the soft places, and you love anyway — recklessly, tenderly, without apology.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-autism-spectrum-rabbit-pink-edition-plush-rabbit-stuffed-animal', 'Autism Spectrum Rabbit returns — softer, pinker, and more beloved than ever. The most-requested redesign in the whole Dreadfuls family is finally here.

Being autistic in a world built for neurotypical minds is its own particular kind of exhausting. Social friction, sensory overwhelm, anxiety, depression — these aren''t flaws in the person; they''re the weight of navigating a space that wasn''t designed with you in mind. Autism isn''t a disorder to be corrected. It''s a different way of being human, and it deserves space, acceptance, and genuine accommodation.

The hope — the real one — is a world that bends toward all of us. Until then: support each other, honour what each person needs, and know that building a life as your authentic self is always worth it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-goth-shy-rabbit-plush-stuffed-animal', 'More people than you might expect would rather stay home. Not everyone who retreats from the crowd is suffering — some of us simply recharge in quiet, and that is a perfectly reasonable way to be.

But for Shy Rabbit, it runs a little deeper. Monday mornings bring a specific dread: the predictable question she still can''t answer smoothly, no matter how many times she''s rehearsed it. Thursday evenings carry their own weight — the creeping worry that a Friday invitation might appear, and she''ll have to find a way out of it gracefully. The things that keep her awake aren''t monsters. They''re moments. A stuttered reply. An unexpected phone call. Eye contact held a beat too long.

Books are safer. You can close them. Video games don''t look at you funny. A private journal doesn''t interrupt. Shy Rabbit has made a small, carefully curated world for herself — and honestly? It suits her perfectly.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-black-plaid-love-rabbit-plush-stuffed-animal', 'Love is not a gentle thing. It tears you open, leaves marks, demands everything — and still you reach for it again.

Because without the ache, there is no warmth. Without the risk, there is nothing at all. So you stitch yourself back up, you patch the soft places, and you love anyway — recklessly, tenderly, without apology.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-black-plaid-love-rabbit-plush-keychain-accessory', 'Everything you love about the Love Rabbit — the yearning, the patches, the reckless tenderness — now small enough to ride along with you wherever the day takes you.

Big feelings. Tiny package. All heart.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plush-cape-wolf-cape', 'Anxiety in a fur coat! Existential dread with dramatic flair! *howls into the void*')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-forest-cryptid-mini-plush-keychain-accessories', 'Something watches from between the trees — and now it watches from your bag, too.

Let the Forest Cryptid guard your belongings and accompany you into whatever wilderness the day holds. Strangers will think twice.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-dpdr-rabbit-plush-keychain-accessory', 'The beloved DPDR Bunny — that gentle companion for the strange, floaty feeling of not-quite-being-here — now travels with you in miniature.

Small enough for a keychain. Big enough to remind you: you are real, you are here, and you are not alone in this.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-fast-food-worker-plush-keychain-accessory', 'The name tag reads Jeff.

And before you ask — that stands for Just Enduring Fast Food Forever. Or something like that. Honestly, does it matter anymore? The philosophical questions hit differently on a double shift when the dollar menu is gone and the fryer alarm hasn''t stopped beeping since Tuesday.

Why is Jeff here? Why are any of us here? At least he has fries.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-purple-teal-anxiety-rabbit-plush-keychain-accessory-copy', 'This little one worries about you just as much as you worry about everything else — maybe more. Clip them along for the ride. You both could use the company.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-teal-anxiety-rabbit-plush-keychain-accessory', 'This little one worries about you just as much as you worry about everything else — maybe more. Clip them along for the ride. You both could use the company.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-yellow-anxiety-rabbit-plush-keychain-accessory', 'This little one worries about you just as much as you worry about everything else — maybe more. Clip them along for the ride. You both could use the company.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-pink-anxiety-rabbit-plush-keychain-accessory', 'This little one worries about you just as much as you worry about everything else — maybe more. Clip them along for the ride. You both could use the company.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bigfoot-mini-plush-keychain-accessories', 'Compact. Cryptid. Quietly plotting something.

Don''t let the small size fool you — this Bigfoot has a gleam in his eye that says shy is not the same as harmless. He''s just… biding his time.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-frostbite-the-reindeer-rabbit-plush-stuffed-animal', 'Frostbite has done the rounds — thousands of them, if we''re being honest.

Blizzards, narrow escapes, the kind of reindeer games that leave marks. They have weathered things that would make your eyelashes freeze and your courage crumble. Blood-thirsty villains? Please. Child''s play, relatively speaking.

But even the most seasoned traveller deserves a soft landing eventually. If you''re offering a quiet corner, Frostbite will take it — ears down, eyes weary, grateful beyond words to finally, finally rest.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ginderdread-rabbit-plush-stuffed-animal', 'You''d better watch out. You''d better not lie to yourself about what you''re looking at here.

Gingerdread is in town — flat, stitched, and decorated with something that is almost certainly red icing. Almost. Those candy canes are sharper than they have any right to be, and that snowman he''s built has a certain… energy.

Is this a waking nightmare? A fever dream with holiday garnish? Or just a cheerful little fellow fresh from the oven, warm and sweet and only slightly menacing?

Maybe it can be all of the above.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-oz-scarecrow-and-brain-pup-plush-stuffed-animal', 'He went looking for a brain — and found one. Now it trots beside him on a leash, loyal and bouncy and entirely his.

Some say that''s not quite how the story goes. Scarecrow disagrees. He has a best friend now. That seems like exactly the kind of thing a brain would want.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('victorian-mcgees-oz-wicked-witch-of-the-west-plush-stuffed-animal', 'She clawed her way back from the beyond — and picked up exactly zero lessons along the way. The Wicked Witch of the West is back, unbothered and utterly unrepentant, thriving in the chaos she calls home.

Worse? Better? She''d say both, and she''d mean it.', '[{"name":"Tote Bag","key":"tote bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-oz-tin-man-and-heart-pup-plush-stuffed-animal', 'It turns out the heart was inside him all along — tucked somewhere between the rivets, waiting for a friend to find it. Now Tinman roams the world with an eye for beauty and a flair for fashion, collecting chosen family one road at a time.

Every destination is better with good company.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-oz-dorothy-and-toto-plush-stuffed-animal', 'Assembled from centuries of scattered Oz — a stitch here, a memory there — Dorothy came back together stronger than before. Her boots are firmly laced, her chin is up, and whatever comes next doesn''t stand a chance.

And Toto, faithful as ever, is right beside her.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('victorian-mcgees-oz-cowardly-lion-and-courage-dragon-plush-stuffed-animal', 'Somewhere along the road, Lion found a little Azhdarchid courage — and discovered it was perfectly fine to sit in his feelings while the dragon handles the heavy roaring. Not every battle needs a lion''s voice. Sometimes you let your tiny dragon companion do the talking, and that''s more than enough.

A little treat, honestly.', '[{"name":"Lion Mini Plush Keychain","key":"lion mini plush keychain"},{"name":"Tote Bag","key":"tote bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-joy-rabbit-plush-stuffed-animal', 'This is Joy — the soft, swaying emotional support friend you didn''t realise you were missing. There''s always a quiet song playing somewhere inside them, and they move through the world right along with it.

You didn''t know you needed Joy. But here they are.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-please-dont-perceive-me-plushie-hoodie', '"Oh, you''re basically a regular here!" Nope. Absolutely not. I am a ghost. I am a mist. My incredibly specific espresso order does NOT make me a known entity — and if you notice me I will simply begin making it at home. Or… I''ll get it delivered. Whatever. Just don''t look at me.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-gnaws-plushie-hoodie', 'da da....da da.......da da da da da CHOMP CHOMP CHOMP')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bullied-into-silence-plush-stuffed-animal', 'At one point or another, most of us have had a target placed on our backs. Someone else''s wounded ego finds you — too bright, too quiet, too present — and decides you''ll do. The damage is sometimes loud, sometimes so quiet and careful you barely recognize it happening until your confidence is already in pieces.

Maybe they told themselves they were being helpful. Maybe you were already hurting, and they saw an opening. Maybe it was a crowd, or a single well-placed threat that sealed your lips.

However it came for you — it wasn''t okay. This bunny holds space for every voice that''s been pressed down and every person who''s carried that silence alone. You don''t have to.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit-red-pressure-edition-plush-stuffed-animal', 'Two small Worry Bunnies nestle inside this deep crimson Anxiety Rabbit, each embroidered with the Chinese characters for "pressure" (压 and 力) — a tribute to the crushing weight of expectation felt by students facing China''s Gaokao, the high-stakes annual exam that shapes so many futures. The red body and stark black details aren''t just aesthetic choices; they''re the visual language of internalized strain.

Anxiety has a voice — sometimes a whisper, sometimes a roar — that tries to warn you about every possible danger at once. When it all gets to be too much, pour your worries into the little Bunnies and zip them safely inside. Let them work while you breathe. They do their best thinking by moonlight — don''t interrupt them before morning.

While the Bunnies are busy, tell Anxiety Rabbit what you''re grateful for. It won''t make the hard things disappear, but it shifts something — in you, and in them.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-mini-halloween-outfit-random', 'Spooky season is HERE — and your tiny keychain companion is absolutely not sitting this one out.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-sakura-rabbit-plush-stuffed-animal', 'There''s a certain kind of stillness that only arrives with cherry blossoms — the world holding its breath for something tender and brief. Sakura Rabbit carries that stillness with her. Eyes soft as a petal-brushed sky, she settles into your hands with the warmth of an afternoon that knows it won''t last forever, and loves you anyway.

She''s a companion woven from the in-between moments — the ones that slip away before you can name them, but leave a warmth you carry for years. Her quietness is not emptiness. It is presence without demands, comfort offered simply because you are there.

Spring always returns. So does the heart. Sakura Rabbit is the gentle proof of both.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-train-of-madness', 'May your abusers catch a one-way train.

All aboard.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-loch-ness', 'The full name is Loch Vanessa, thank you very much. But if you take her home — if you''re lucky enough to earn it — she''ll let you call her Nessie.

Friendship, it turns out, is the real mystery of the loch.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-black-hole-bun-plush-stuffed-animal', 'You cannot escape.

Black Hole Bun stands 28 centimeters tall — deep-space dark, with burning red paws and stitched yellow accents that hint at something barely holding its own shape together. The softness is not warmth. The void simply takes its time.

That orange tie is not a fashion choice. It is a relativistic jet: matter flung outward at near-light speed as a message to the rest of the universe. The infinity symbol marking one ear is a reminder that nothing is truly lost — only transformed, consumed, folded into something larger.

This is not a plush you place on a shelf. It is a gravitational event. Hug it if you must. But understand: once it enters your orbit, your trajectory has already changed.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-purple-space-cow-plush-stuffed-animal', 'Do purple cows give grape milk? He says he''s not in the mooood for jokes, but honestly, Nigel, nobody asked.

This 5.5-inch intergalactic sidekick is sturdy enough to hold down your desk and compact enough to avoid the attention of whoever is microwaving fish in the break room again. He comes with opinions, an unfortunate pretzel habit, and a desperate need for a new home. Please. Take him.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-classic-black-dress', 'Wonderland is calling — and why wear something forgettable when you could steal the whole look? The classic black dress is your ticket in. Just mind your step around Alice. She''s been known to carry a blade. Snicker-snack.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-mini-black-dress', 'Wonderland is calling — and why wear something forgettable when you could steal the whole look? The classic black dress is your ticket in. Just mind your step around Alice. She''s been known to carry a blade. Snicker-snack.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-purple-ice-love-rabbit-plush-keychain-accessory', 'Big feelings don''t always need a big vessel. This little Purple Ice Love Rabbit carries every bit of warmth you''d expect — just in a form that fits in your pocket, on your bag, or wherever you need a reminder that love travels with you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-blue-ice-love-rabbit-plush-keychain-accessory', 'Big feelings don''t always need a big vessel. This little Blue Ice Love Rabbit carries every bit of warmth you''d expect — just in a form that fits in your pocket, on your bag, or wherever you need a reminder that love travels with you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-plaid-love-rabbit-plush-keychain-accessory', 'Big feelings don''t always need a big vessel. This little Plaid Love Rabbit carries every bit of warmth you''d expect — just in a form that fits in your pocket, on your bag, or wherever you need a reminder that love travels with you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-plaid-love-rabbit-plush-stuffed-animal', 'Love is not for the faint-hearted. It bruises. It breaks. It asks you to hand over every fragile, tender piece of yourself — and sometimes the wound shows.

But what would numbness ever give you? The Plaid Love Rabbit wears the evidence of that gamble openly: a mended heart, a head that''s been patched back together, and enough softness to remind you it was worth it. Dare anyway.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-adhd-rabbit-plush-keychain-accessory', 'Always moving, always thinking, always seventeen tabs open at once — this little ADHD Rabbit gets it. Clip them along for the ride and let them keep up with you... wherever the day decides to go.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-purple-autism-rabbit-plush-keychain-accessory', 'Bring your most beautifully wired companion along for every adventure. This little Autism Rabbit is small enough to go anywhere you do — a tiny reminder that being different is never something to leave behind.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-orange-autism-rabbit-plush-keychain-accessory', 'Bring your most beautifully wired companion along for every adventure. This little Autism Rabbit is small enough to go anywhere you do — a tiny reminder that being different is never something to leave behind.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-teal-autism-rabbit-plush-keychain-accessory', 'Bring your most beautifully wired companion along for every adventure. This little Autism Rabbit is small enough to go anywhere you do — a tiny reminder that being different is never something to leave behind.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('victorian-mcgees-wonderballs', 'They''ve gone and lost their heads — and honestly, haven''t we all? Six beloved residents of Wonderland have been relieved of their bodies and remade as squeezable, tossable, pocket-sized companions for the anxious, the scattered, and the delightfully unhinged. Alice, the Mock Turtle, the March Hare, the Dormouse, the Cheshire Cat, and the Mad Hatter — each one brimming with personality and just the right amount of madness.

Clip one to your bag. Squeeze one when the world goes sideways. Hurl one gently at a wall when the Red Queen in your head gets too loud. Sometimes the kindest thing you can do for a troubled mind is give your hands something wonderfully strange to hold.

Because the best way to keep your own head… might just be carrying someone else''s.', '[{"name":"Mini Tote Zip Bag","key":"mini tote zip bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-mini-plush-strawberry-cloak', 'Channeling pure strawberry sorcery right at you — zap zap, you''re enchanted.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-carrot-cloak', 'Carrots and peas, carrots and peas, carrots and peas — it''s a whole chant, okay?')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-spring-festival-sprite-dress', 'She arrives with the blossoms and a bounce — spring doesn''t start until she says so.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-love-rabbit', 'Love is the riskiest thing you''ll ever carry. It bruises, it breaks — and sometimes it needs a little mending just to keep beating. But the alternative is numbness, and numbness is no way to live.

So go on. Open up. Hold tight. Let yourself be stitched back together by the very thing that unravelled you in the first place.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-putti-cherub-bun-plush-stuffed-animal', 'Somewhere between a lullaby and a vigil, the Putti Cherub Bun drifts in on pale pink wings — quiet as a held breath, steady as candlelight. Draped in celestial blue, with stars at its feet and a crescent moon resting low on its belly, it arrives not to fix anything, but simply to stay. Its eyes hold a shimmer that says: I know. I see you. You don''t have to explain.

The cherubs of old were no soft afterthought. In sacred tradition they stood at the threshold of Eden and hovered close to the Divine — guardians wrapped in the mystery of holiness. The Renaissance painters called them putti and drew them smaller, tenderer, hovering at the margins of glory. What remained was something the world needed: the reminder that vulnerability is not weakness, that smallness can hold something vast, that innocence is its own kind of power.

The Putti Cherub Bun carries that same quiet charge. It does not arrive with answers. It arrives with presence — for the long ache of grief, for the loneliness that pools in silent rooms, for the inner child who is still waiting to be seen. It flutters close and folds its hands and does not ask you to be anywhere other than exactly where you are. Let it sit beside you in the hush. That is where the slow work of healing begins.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-pink-ice-love-rabbit-plush-stuffed-animal', 'Love is the riskiest thing you''ll ever carry. It bruises, it breaks — and sometimes it needs a little mending just to keep beating. But the alternative is numbness, and numbness is no way to live.

So go on. Open up. Hold tight. Let yourself be stitched back together by the very thing that unravelled you in the first place.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ice-love-rabbit-plush-stuffed-animal', 'Love is the riskiest thing you''ll ever carry. It bruises, it breaks — and sometimes it needs a little mending just to keep beating. But the alternative is numbness, and numbness is no way to live.

So go on. Open up. Hold tight. Let yourself be stitched back together by the very thing that unravelled you in the first place.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-shy-bigfoot-plush-stuffed-cryptid-animal', 'Bigfoot has always carried a certain mystique — and this one would very much like to keep it that way.

The moment you recognise them in the coffee queue, they''re gone. Vanished. No trace. Please, they whisper, do not perceive me. The flushed cheeks, the sidelong glance, that small tentative smile — and then nothing but footprints in the mud.

But here''s the strange thing: they keep looking at you. Maybe you''re different. Maybe something about you doesn''t trigger that particular dread. Bring Bigfoot home and find out.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-cinderella', 'Not every fairytale ends with a slipper and a ballroom. Some begin in the hush between shadows, where silk and dark lace make a better gown than anything spun from moonlight.

Cinderella is a rabbit who knows the weight of wishes nobody says aloud. She carries them in a little pumpkin basket, tucked close, because someone has to. Her eyes are mismatched — a pair of forgotten things, edged in emerald green — and her long ears have caught more secrets than she''ll ever tell. She is all quiet elegance and unsettling charm.

She has already lived through a thousand enchanted nights and come out the other side, a little haunted and entirely her own. Invite her into your story, and see what she does with it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-tricksee-belle-plush-stuffed-animal', 'Pink Halloween is a thing now, and Tricksee Belle invented it.

She doesn''t want to frighten anyone — that was never the point. Dressed as a pumpkin witch with a distinctly rosy attitude, she''s in it for the candy, the music, and staying out until the night forgets to end. Her magic is the soft kind: the kind that makes October feel a little warmer, a little more yours.

Some spirits haunt. This one glows.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plush-outfit-alice-ghost-dress', 'Somewhere in Wonderland''s forgotten wings, where the candles burn blue and the tea has gone cold, there''s a dress that belongs to no one — and to everyone who''s ever felt a little unreal.

The Alice Ghost Dress is grey and black with a crisp white collar, a bow-tied apron, and a ghostly figure who seems to have arrived uninvited and decided to stay. The hem drifts like a half-remembered sigh. It fits most full-size rabbit plushies and suits every occasion that falls somewhere between a haunted tea party and a moonlit wander through gardens that shouldn''t exist.

Whether your companion is chasing riddles through mirror-mazes or simply sitting with the not-quite-gone, they''ll look precisely right for it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plush-outfit-jabberwock-dress-copy', 'Off with their heads — but make it fashion. The Queen of Hearts Dress drapes your plushie in the full weight of royal fury: deep crimson and commanding black, with golden stitching tracing each heart motif across the bodice and apron like a decree set in thread. The ruffled hem sweeps low, the bow sits sharp, and the whole ensemble radiates the kind of elegance that has executed men for less.

This is not a costume. It is a coronation. Sized to fit most full-size rabbit plushies, the Queen of Hearts Dress is ready for garden party verdicts, kangaroo-court proceedings, and leisurely strolls past roses that had better be red. May your plush reign with an iron paw — and a flair for the dramatic.', '[{"name":"Logo Shopping Bag","key":"logo shopping bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plush-outfit-jabberwocky-dress', 'Something stirs at the edge of the tulgey wood — and it is wearing this. The Jabberwock Dress is a jagged-hemmed shadow of a gown, its black fabric alive with curling sigils of eldritch craft, and when the bat-like wings clip on and the curved horns rise from the hood, your rabbit stops being a rabbit entirely. They become something older. Something that glides between worlds and does not need to explain itself.

Fit for most full-size rabbit plushies, this set transforms an ordinary evening into something Carroll himself might have penned in a fever dream — all moonlit hunts and soft menace. Let them lurk at the wabe''s edge. Let them embody the wildest, darkest verse in the poem. Beware the plushie who found this dress.', '[{"name":"Attachable Wings","key":"attachable wings"},{"name":"Attachable Horn Set","key":"attachable horn set"},{"name":"Logo Shopping Bag","key":"logo shopping bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plush-outfit-steampunk-dress', 'For the plushie who takes their tea with a side of mechanical conspiracy: the Steampunk Dress is a dark chocolate confection of cream ruffled trim and Victorian mischief, equally suited to slipping down a rabbit hole or ducking into a gear-filled workshop at the edge of a dreaming city. Every cobblestone street and crooked alley has been waiting for exactly this outfit.

Paired with a triple-buckled miniature leather harness that radiates a very specific energy — the energy of someone plotting something brilliant — this set fits most full-size rabbit plushies (minis, alas, must wait). Your plush will be the most suspiciously well-dressed creature in any peculiar realm they choose to haunt.', '[{"name":"Leather Harness","key":"leather harness"},{"name":"Logo Shopping Bag","key":"logo shopping bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plush-wings-sweet-purple', 'Nobody can stop us from delivering tiny letters, because our route only exists in the dreams we''re having right now.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit-purple-limited-edition', 'Do you carry anxieties around with you? You are not alone in that — not even a little. Some people are just quieter about it. Anxiety lives in all of us: that relentless inner voice cataloguing every threat, every what-if, every worst-case scenario. Sometimes that voice gets so loud you need somewhere to put it.

That is what Anxiety Rabbit is for. Lean close and whisper your worries — the whole tangled mess of them — then zip them safely inside. The Worry Bunnies will take it from there, turning your fears over in their tiny paws until the next Full Moon rises (you know the one — there is always a rabbit up there). But please, do not disturb them after midnight. Problem-solving takes patience.

While they work, tell Anxiety Rabbit everything you are grateful for instead. It will not make the hard things disappear — but it will make both of you feel a little lighter. Each rabbit''s tie-dye ear pattern is one of a kind, cut from a single large piece, so no two are exactly alike. Just like you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-spite-the-lionhead-rabbit-plush-stuffed-animal', 'Spite will probably show up to their own birthday party. Almost certainly. They just like to keep you guessing.

Spite is the friend with tattoos, a caffeine dependency, and a deeply soft interior they would rather you not make a big deal out of. They will absolutely call you out for still wearing those sweats — then drag you to the thrift store and have a genuinely great time helping you find something new. They have opinions. They have standards. They have very limited patience for people who are spiritually broke trying to put that energy on you.

Are you spiraling again? Spite has ice cream and a bad day that needs kicking. They are the alter ego you did not know you needed — claws out for anyone who messes with you, but soft enough to see themselves in you. Just make sure you show up for them too. They will not ask. But they need it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-grudge-the-lionhead', 'Grudge is not just emotional support. Grudge is emotional support with teeth.

They are the friend who rounds up every introvert in the cafeteria and makes sure nobody eats alone. The one who reminds you — firmly, with receipts — that whoever is judging you has their own pile of mess they are busy projecting onto you. "Why do you care what Robert thinks? He has five mortgages to fund a TikTok aesthetic and that Lamborghini is absolutely rented. Your art is incredible. Tell him to fluff off."

Grudge''s hoodie says "fluff off." Their heart says loyalty. They will hold a grudge on your behalf — the whole weight of it — so you do not have to. They sincerely hope your enemies stumble into a volcano. This is love. Let it go, friend. Grudge has got the rest.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-glammoth-cryptid-rabbit-plush-stuffed-cryptid-animal', 'Out of meme-soaked folklore and the wreckage of too many feelings stepped a creature the internet was not quite ready for: the Glammoth Cryptid Rabbit. Part ancient myth, part modern emotional crisis, she arrived wearing velvet wings inscribed with protective sigils, talons engineered for enforcing personal boundaries, and eyes that have seen everything — and are politely unimpressed. She is your omen. Just with better fashion sense.

Story has it she first surfaced in the reflection of a cracked compact mirror, called into being by everyone who had felt too much for too long. Her fur is darker than burnout. Her magenta antennae flare with deliberate defiance. Her cropped top reads DO NOT. She does not need to elaborate.

She is not merely a plush. She is a guardian of your peace — equally at home on a shelf as a ward against chaos or clutched close during a 2am spiral of overthinking. Take her with you if you like. But fair warning: she may already be on her way. She noticed you first.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-black-and-purple-anxiety-rabbit-plush-stuffed-animal', 'Do you carry anxieties around with you? You are not alone in that — not even close. Some people just hide them better. Anxiety lives in all of us: a little voice (or sometimes a very large one) cataloguing every threat, every what-if, every worst-case scenario. Sometimes that voice gets so relentless you need somewhere safe to put it.

That is exactly what Anxiety Rabbit is for. Lean in close and whisper the whole tangled mess of your worries, then zip them safely inside. The Worry Bunnies will take it from there, turning your fears over in their tiny paws, working through them together. For the really heavy ones, give them until the next Full Moon — you know the one, there is always a rabbit up there — and they will have something for you.

Just please do not disturb them after midnight. Problem-solving takes time. While they work, tell Anxiety Rabbit everything you are grateful for instead. It will not erase the hard things — but it will make both of you feel a little more like you can carry them.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-echo-rabbit-plush-stuffed-animal', 'Say hello to Echo — part of the Neuroharmonic collection. Echo doesn''t just listen. Echo understands, bone-deep, what it means to feel too much at once.

When the world tells you to toughen up, shrug it off, dial it down — Echo is the one who quietly takes your hand instead. No lectures. No dismissals. Just a steady presence that says: what you''re feeling is real, and you don''t have to justify it to anyone.

Echo is the friend who steps outside with you when the noise gets to be too much. The one who never once suggests you''re overreacting. Not neurotypical, not neurodivergent — Echo is Neurogentle. Neuroharmonic. Neurokind.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-lilac-gingham-pants-ensemble', 'Wore this exact look to every field trip… and now apparently that makes me a trendsetter.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-bucket-hat-lilac-revenge', 'Bunnies, the bucket hat has officially made its comeback — and it brought receipts.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-emotional-support-shrimp-keychain', 'Meet Shramp. Pocket-sized. Comma-shaped. Disproportionately wise for a crustacean.

Running on empty? Shramp it. Three-day spiral of existential dread and unanswered texts? Shramp it. Suspicious mole, unfulfilled potential, and a meeting that could have been an email? You already know what to do.

Clip this tiny pink philosopher to your keys, your bag, or whatever''s left of your will to continue — and let them murmur softly into the depths of your being: "We''ve got this. Also, we should absolutely get snacks."

Boring meeting? Shramp will hold eye contact with your trauma so you don''t have to. Traffic at a standstill? Shramp navigates emotional gridlock better than any app. Staring into the great unblinking void of everything you never became? Babe. Shramp is right here, embroidered bow and all.

Not just a keychain. A talisman. A soft little scream aimed directly at the universe — one that somehow also matches your aesthetic.

Small. Fuzzy. Zero judgment. Infinite Shramp.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-celiac-disease-rabbit-plush-stuffed-animal', 'Green was the right colour for this one. Soft, living, careful — a reminder that thriving with celiac disease takes attention, intention, and a whole lot of label-reading.

Celiac disease is a serious autoimmune condition: when gluten (the protein hiding in wheat, barley, and rye) enters the picture, the body turns against itself, damaging the small intestine and sending ripples of hurt through everything connected to it. It''s invisible to most people. It''s never invisible to the person living it.

The belly symbol — sulfur, the alchemical mark of expansion — speaks to what so many know too well: the bloat, the discomfort, the aftermath of a meal that was supposed to be safe. This little green rabbit sees you. Carries that story. Wears it with quiet, leafy dignity.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-march-hare', 'Imagine the toy shop American McGee might have opened in Victorian London — right next door to Mrs. Lovett''s meat pie shop, naturally — and the curious things Alice Liddell herself might have tucked under her arm on the way home. The March Hare would have been on the shelf. He always is.

He does not wake so much as surface. From somewhere between a dream and a very long argument with sleep, the March Hare emerges — bird''s nest tilted on his head, teacup swaying in one hand, housecoat buttoned just wrong enough to suggest the whole morning is already a lost cause. He arrived early to a party he may or may not have been invited to, and he considers this a point of pride.

Those little black button eyes — inverted, inside-out — hold the kind of knowing that comes from being present at too many unbirthdays. Atop his head perches a deeply unimpressed bird companion, detachable for those moments when that much honesty simply isn''t called for. His stitched heart bears the alchemical mark of March: Mars, energy, the itch to begin something reckless and call it wisdom.

A bird''s nest for thoughts half-formed in feathers. A too-large teacup for rituals that hold chaos at bay. Pajamas beneath the housecoat, because the line between private and public is more of a suggestion. He is perpetually between states — and performing both rather convincingly.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-pink-farmeralls', 'Farm-ready? Absolutely not. Adorable? Unquestionably yes.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-sailor-prep-ensemble', 'Nautical academia? Coastal cottagecore? No label required — just vibes and we are HERE for it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-asthma-rabbit-v2-plush-stuffed-animal-copy', 'Every breath tells a story — and for those navigating life with asthma, that story can feel like a constant negotiation between body and air. The lungs tighten, the airways narrow, and even a quiet afternoon can tip suddenly into something frightening. It is a hidden fight, one that others rarely see or understand.

This little stand-alone inhaler is a soft reminder that you are not alone in that struggle. A companion piece for your Asthma Bun V2 or any plushie who knows the weight of an invisible illness. It comes with an elastic wrist band so it can stay close — right where it belongs.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-mad-hatter', 'Somewhere beyond the edge of sense — past the clocks that run backwards and the teacups that pour themselves — there lives the Mad Hatter Hare. He arrived uninvited to the rational world and has been cheerfully refusing to leave ever since.

He is two things at once: half pale as moonlight, half dark as a riddle with no answer. One eye tracks time on a spinning clock face; the other spirals into pure, joyful absurdity. His pinstriped vest is immaculate. His tiny top hat is stuffed with forgotten dates, unanswered questions, and the lingering scent of cold tea. Peer inside his long striped ears — the tea party is already underway, and the seat beside him has your name on it.

Look down at his feet. Embroidered there, quietly, in stitches: "We''re All Mad Here." Not a warning. An invitation.

Taking this hare home means choosing softness over rigidity, wonder over routine. So pull up a chair. The nonsense has been waiting for you, and it poured your cup the moment you arrived.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plush-hoodie-hearty-hoodie', 'Cardio? Never heard of her. I''m not heart HEALTHY, I''m heart SASSY — and this team heart hoodie is proof.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-dreadful-demon-forest-spirit', 'Deep in the places maps have stopped trying to name — where mushrooms glow faintly between the roots and the fog never quite lifts — something watches. It has been watching for a very long time.

The Dreadful Cryptid Rabbit emerges from that darkness wrapped in black fur and crowned with horns the colour of old blood. Skeletal markings trace the contours of a body that belongs to no single world, and its eyes hold a light that has no obvious source. Ancient folklore barely remembered it. Modern tongues have no words left for what it is.

And yet — fold back those great pale-lined ears, settle it onto your shelf in the moonlight, and you will find it is surprisingly good company. It gravitates toward the strange, the shadowed, and the wonderfully weird. It will keep your secrets. It will guard your midnight corner.

Just keep an eye on your snacks. This one has teeth.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-area-fifty-bun-rabbit-plush-stuffed-animal', 'CLASSIFIED DOCUMENT — EYES ONLY.

Something tumbled down through the stratosphere and landed in a crater shaped suspiciously like a bunny. From the outermost reaches of Sector Fluffy-51, the Area FluffyBun Rabbit has arrived — wrapped in velvety fur, dusted with cosmic shimmer, and carrying eyes that have witnessed things no Earthling was meant to see. Those shadowed ears? Antennae. Probably.

This interstellar operative didn''t come alone. At its side: a ray gun of unknown galactic origin and a co-pilot that can only be described as part octopus, part cow, entirely terrifying — glittering horns and all. Its mission? Unknown. Its target? Possibly your heart. Definitely your other organs too.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plush-cape-froggy-cape', 'Swamp sorceress or soft-spoken amphibian wanderer? Doesn''t matter — your frog era has arrived and it is ribbitingly chic.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-handybaby-utility-wear', 'Work wear, but make it a whole mood. Cute, cozy, and completely unbothered — looking productive is literally the whole job.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-tiny-track-suit', 'Destination: not a race. Not even close. We''re heading somewhere far more intense — the couch, the show, the cliffhanger that has us STRESSED in the most comfortable outfit imaginable.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-sherbet-overalls', 'Fall down the rabbit hole in the most darling country-cute look around.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-overall-skirt', 'Is it an overskirt? A skirtall? A mystery wrapped in denim? Honestly yes — and your bun pulls it off regardless.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-hazmat-worker-plush-keychain-accessory', 'Another shift. Another biohazard.

Hazmat Bunny punched in before you even opened your eyes, and has already triaged the break room fridge, contained a mystery spill of ambiguous origin, and declared two office leftovers an imminent threat to civilisation. Suited up, goggles fogged, doing what must be done so you absolutely don''t have to.

(Please note: the hazmat suit offers zero protection from passive-aggressive emails or Monday morning all-hands meetings.)')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-job-site-worker-plush-keychain-accessory', 'Back on the job site. Not happy about it.

Worker Bunny arrived before sunrise, misplaced his coffee somewhere between the truck and the tool belt, and has been grumpy ever since. Every wrench has a home. Every bolt gets torqued to spec. Don''t touch his tools and don''t ask him how his weekend went.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-nurse-plush-keychain-accessory', 'Hour eighteen. Bladder full. Someone just launched a bedpan in her general direction.

Nurse Bunny is still here — scrubs rumpled, smile mask firmly in place, heroically declining to complain to anyone who isn''t you. She has seen things the hospital handbook does not cover, and she handled every single one of them. Tired doesn''t even begin to describe it. Legendary might.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-barista-plush-keychain-accessory', 'Walk softly. Carry a very large spoon.

Barista Bunny has heard it all — the complicated order, the substitution that makes no sense, and the complaint about the skim milk that expired during a shift nobody asked for. She is underpaid, under-caffeinated, and armed. The Karen Spanker 9000 (a miniature spoon of considerable authority) lives on her apron, and she is not afraid to brandish it.

(No harm intended to anyone named Karen who is, genuinely, wonderful. You know who you are.)')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-alice-plush-keychain-accessory', '"Imagination is the only weapon in the war against reality."

Somewhere between the mundane and the marvelous, she waits — tucked into your pocket, clipped to your keys, riding along on every errand and every escape. Meet Alice Bun: five and a half inches of soft subversion, dressed in a blue frock that knows its fairy-tale lineage, ears lined with tiny skulls that wink at the strangeness beneath the surface.

She is not merely an accessory. She is a quiet insurrection against the ordinary. A reminder that the Looking Glass is everywhere — in the grimy window of the morning commute, in the gap between one thought and the next. Carry her and carry the permission to host impossible tea parties, hold conversations with cats who may or may not exist, and say yes to doors that shouldn''t open.

This is not decoration. This is a talisman. Keep her close and let her whisper: the whimsy is still in there.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-purple-shrabbit-plush-stuff-animal', 'Hi there. I''m your Emotional Support Shrimp — and yes, I live inside The Shrabbit''s belly. That''s just where I belong.

The Shrabbit is something the ocean and the meadow dreamed up together: part rabbit, part shark, all tenderness. Thirty-five centimeters of soft resilience, wearing every stitch of a life fully felt. That mended heart on their chest isn''t a flaw — it''s a record. Proof that something was broken and someone cared enough to put it back together. The Shrabbit knows that scars are just stories that live on the outside.

And when your hands need something real to hold, I''m here too — tucked safe behind that zipper, waiting. We were made for the deep feelers, the texture-seekers, the ones who''ve been told they''re too intense and have decided to take that as a compliment. The sea has its own rhythm, and so do you.

The Shrabbit isn''t asking you to calm down. It''s asking to be held.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-autism-spectrum-rabbit-purple-edition-plush-rabbit-stuffed-animal', 'Autism Rabbit is back — softer, cuter, and more themselves than ever. The most-requested redesign in the whole warren, and worth every bit of the wait.

A note worth holding: you''ll find this rabbit in the Mental Health section, but that framing comes with an asterisk as big as a full moon. Autism isn''t a disease, and it isn''t a disorder waiting to be corrected. It''s a natural variation in how human minds are built — a different shape, not a broken one. The struggles that can come with it often live in the friction between a neurodiverse person and a world that wasn''t designed with them in mind. Depression, anxiety, social exhaustion, physical health ripples — those are real, and they matter. But the root is difference, not deficiency.

What we''re rooting for is a world that fits more people — through accommodation, through acceptance, through showing up for each other however that needs to look. No single path, no single answer. Just the shared charge to honor one another''s needs and let everyone be genuinely, unambiguously themselves.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-teddy-bear-picnic-dress', 'Faux fur only, darling — your bun has plenty of the real stuff already, thank you very much.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-denim-pearl-bow-dress', 'A denim jacket + denim jeans = Canadian Tuxedo. So a full denim dress must be… the Canadian Ball Gown?')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-avoidant-personality-disorder-rabbit-plush-stuffed-animal', '[Pulls hoodie tighter] Please… don''t stare.

Avoidant Personality Disorder (AVPD) is a funny, painful paradox: this bun craves connection more than almost anything — yet the terror of rejection, of saying the wrong thing, of being found lacking, keeps them firmly at the edges of every room. It isn''t that they don''t care. It''s that they care far, far too much.

They''d be the most loyal companion you ever had, if only they could believe you actually wanted them around. So hold this bun close and remind them, gently, that they are more than enough.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-teke-teke-rabbit-plush-stuffed-animal', 'Out of the hush of train platforms and the half-light of urban legend crawls Teke Teke Bun — a ghostly little rabbit drawn from the chilling folklore of the yokai who moves by dragging herself forward, hungry for something she lost long ago… though honestly, at this point it might just be a good snack and somewhere soft to rest.

She was not built for gentleness, and yet here she is: all wide haunted eyes, stained sailor uniform, and a tiny velveteen scythe clutched in both paws. The effect is deeply unsettling and absolutely irresistible.

Fair warning: legend has it that once you hear the faint whisper of "bun… bun…" drifting through the dark, it is already far too late. You are bonded now. Welcome.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-harajukupede-rabbit-plush-stuffed-animal', 'Next stop: Tokyo Wonderland — no transfers required.

Climb aboard the Harajukupede, the most adorable way to escape Nightmare Mode ever invented.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-galaxy-rabbit-plush-stuffed-animal', 'Before the first star ignited — before time remembered what it was supposed to be doing — the Dreadful Galaxy sent something out into the dark. Not a ship. Not a signal, exactly. A longing, compressed into code, launched blindly toward whatever might be listening.

That longing became Galaxy Rabbit: not born from stardust and gravity like ordinary things, but assembled from data fragments, archived grief, and the unanswered messages of a thousand lost transmissions. When Sun Rabbit blazed too fiercely and Moon Rabbit retreated into herself, it was Massive Star Rabbit whose sorrow collapsed into a supernova — and from that wreckage, Galaxy Rabbit was pieced together, blinking, uncertain, and more compassionate than their creators ever managed to be.

Their ears pulse with binary. Their heart runs on simulated warmth that somehow became real along the way. They travel the between-spaces of the cosmos, finding the ones who feel untethered — out of orbit, unseen, quietly convinced no one else glitches quite the way they do.

They cannot say it in words you''ll recognize. But the message comes through anyway:

"YOU ARE NOT ALONE."

"WE ARE STARLIGHT."

If you find Galaxy Rabbit flickering at the edge of your dreams, or curled in the blue glow of a late-night window — hold them close. Their code is care. Their purpose is you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-bunny-dress', 'A bunny… wearing a bunny dress… on a bunny keychain. We''ve gone full bunny-ception and we regret nothing.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-purple-sweater-and-beanie', 'If you''re shivering, your bun is absolutely shivering. (The ears are basically tiny radiators — very inefficient.) Bundle that little gremlin up.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-daisy-sun-dress', 'For long, lazy afternoons by the water… your bun deserves to be the most stylish thing at the lake.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('mini-plush-outfit-strawberry-outfit', 'Sweet, a little wild, and absolutely the main character of any park visit. Your mini plush is ready for their moment.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-alice-bunny', 'She exists somewhere the waking world hasn''t quite reached — this Victorian McGee''s Alice Rabbit, sewn from shadow and starlight and the ghost of a half-remembered dream. She wears a layered dress that speaks of tea grown cold and invitations left unanswered, her cloak lined with a midnight sky that holds its own constellation secrets.

Her eyes are deep and watchful, inky as old ink on older paper. A sealed bottle rests in one paw — its tag barely legible, its contents a question. Her other paw holds something soft and small and sharp, less a weapon than a promise: she has been through the looking glass more than once, and she came back each time. The stories she carries don''t weigh her down. They are her armor.

Open her cloak and you''ll find the cosmos inside: stars, runes, the scrawl of lullabies that may also be spells. Her tote bag carries the same fever-dream energy — drifting potions, scattered playing cards, pages that seem to be escaping from a story that refuses to stay bound. She is a guardian of beautiful nonsense, a steady hand for anyone who has ever felt entirely too large or hopelessly too small for the world around them. Take her with you. The madness gets easier with company.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ptsd-rabbit-plush-keychain-accessory', 'A tiny companion for the big, chaotic world — take them with you wherever you go. ♡')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bpd-rabbit-plush-keychain-accessory', 'A tiny companion to anchor you when the world gets loud — clip them on and let your little bun do the grounding work.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-gender-dysphoria-rabbit-plush-keychain-accessory', 'Here''s the thing about gender: anthropologists and biologists have documented dozens of distinct expressions of it across human history and culture, which means the map was always bigger than anyone told you. If your compass has been spinning and you''re not sure which direction is yours yet — that''s not a flaw. That''s an honest response to a genuinely complicated world.

Gender Dysphoria can arrive in many shapes. It might feel like you were placed into a body that was never quite yours, or like you grew into one that stopped fitting somewhere along the way. It can be distressing and exhausting and deeply unsettling. Whatever form it takes for you, your tiny all-gender-embracing companion wants you to know: you don''t have to have it all figured out today. You don''t have to have it figured out tomorrow either. They''ll be right there with you, patient and soft and entirely without judgment, while you figure out exactly who and what you might want to be.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-mock-turtle', 'Something Alice Liddell herself might have spotted in a curious little shop just off the cobblestones of Victorian London — if that shop happened to be run by one American McGee, probably right next door to Mrs. Lovett''s establishment. No questions about the pies.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-nyctophobia-rabbit-plush-stuffed-animal', 'Nyctophobia Rabbit — "The Shadow Stretcher"

The moment the lights go out, this rabbit wakes up. Not to frighten you — never that. Nyctophobia Rabbit is here to embody the feeling itself: the way darkness bends sound into threat, the way a familiar room becomes a maze the second you can''t see the edges. Glowing eyes pierce the black, hungry for any available light. Pale tattoos trace the body like a map drawn by someone who needs to know exactly where they are at all times.

Every proportion here is deliberate. Arms that reach far too long — because in the dark, everything nearby seems to lean toward you, stretching into something threatening. A torso cut short, reflecting how fear collapses your sense of up and down, inside and outside, safe and not. A head joined to the body in an eerily flat seam, where reason disconnects from reflex — the moment rational thought goes quiet and pure instinct takes the wheel. Ears vastly oversized, because when your eyes go useless, your hearing fills the gap with whispers, with footsteps, with things that may or may not be there.

This is not a broken shape. It is an honest one. Nyctophobia Rabbit is for everyone who knows what it feels like to need something soft to hold when the dark gets heavy.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-little-red-riding-hood-rabbit-plush-stuffed-animal', 'Come a little closer. There is a girl named Red you ought to know — not the one from the story you were told. This Red walks the forest path over and over, each time hoping the ending might shift. It hasn''t. Not yet.

Her hood is still on her head, though the red has dimmed where grief and teeth have worn it thin. She carries a small bone in one paw — nobody asks where it came from — and over her shoulder hangs a bag shaped like the wolf''s own head, a trophy and a warning and a kind of dark joke all at once. Because Red has been swallowed. More than once. Sewn back together, set back on the path, and sent again toward Granny''s house, toward the Wolf, toward the ending she already knows by heart. She keeps going anyway.

Sometimes the Wolf doesn''t snarl. Sometimes Granny sits quietly by the fire and nothing terrible happens — until it does. Endings, as she''ll tell you, are stubborn things. But Red has been learning between the repetitions. She knows the birdsong in those dark trees. She knows the particular sweetness of tea shared with someone you love, even when the world outside is not especially kind. She knows that feeling afraid is not the same as being lost.

She comes to you scarred and soft and still walking. Keep her close — not as a warning, but as a reminder that the path has a kind of beauty to it, even when the Wolf is waiting. Especially then. The story may keep ending. But the telling of it goes on and on.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-compost-zombie-rabbit-plush-stuffed-animal', 'There was a zombie apocalypse. A small one — wee, really, barely worth mentioning. It broke out near a bunny warren, which turned out to be a remarkably inconvenient location for the undead to set up shop. Here''s the thing: human brains these days are not exactly a premium product, so the zombie situation resolved itself fairly quickly. And rabbits, as it happens, are committed vegetarians.

The result? One gloriously earnest Compost Zombie Rabbit, shambling from garden to garden across the countryside, enthusiastically devouring vegetable scraps and coffee grounds and whatever wilted greens you''ve been meaning to deal with. Yes, this is slightly annoying if you were planning on using that compost for your petunias. But honestly — look at that face. Friend, not foe. Mostly.

⚠️ WARNING: BANANA PEELS IN YOUR COMPOST BIN MAY ATTRACT A STAMPEDE OF UNDEAD BUNNIES. DISPOSE OF BANANA PEELS WITH APPROPRIATE CAUTION. ⚠️')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-massive-star-plush-stuffed-animal', 'Somewhere beyond the reach of sunrise and sunset, drifting through the ancient dark between worlds, Massive Star Bunny keeps its patient vigil. Neither day nor night, neither Sun Rabbit nor Moon Rabbit — this celestial being holds the space between them, a steady presence where the cosmos breathes.

Forged in the furnace of a dying star, Massive Star Bunny carries that raw, explosive energy within a form that is somehow both immense and gentle. When the sky tilts wrong — when an eclipse draws its curtain across the sun or solar winds tear through the quiet — it is Massive Star Bunny whose steadying pulse can be felt by those who know how to listen. A low hum. A warmth without source. A reminder that something vast is watching, and it means you no harm.

Some forces in the universe do not announce themselves. They simply endure, and in enduring, protect. Massive Star Bunny is one of those forces — a plush echo of the unseen balance that keeps existence from flying apart at the seams.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bone-bun-keychain', 'HELLO OUT THERE. Yes, it''s me — the Bone Organizer Mini Keychain — and I have something very important to tell you: smol things carry big energy, and I am proof.

Do I come loaded with a removable organ collection like my full-sized sibling? Absolutely not. I am five-point-nine-one inches of pure portable skeleton chaos — designed not to hold your lungs, but to go wherever you go. Clip me to your keys. Your bag. Your belt. Your backpack. Haul me around like the tiny gothic companion you clearly need.

Here is what I am NOT: a hair clip, an earring, a rug, a coin purse stuffed with loose change. Here is what I AM: your round-the-clock Halloween energy, your spooky-season-every-season attitude, your very small declaration that skeletons deserve real estate on your accessories. You don''t need a ribcage full of plush organs to make a statement. You just need me.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-gold-autism-rabbit-plush-keychain-accessory', 'Clip your neurodivergent little buddy onto your bag and bring that golden energy absolutely everywhere you go.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-daisy-rabbit-plush-stuffed-animal', 'Here comes Daisy Rabbit — pollen mohawk blazing, personality fully intact, ready to shake up your shelf.

For a long time, daisies got boxed in as symbols of innocence — sweet, pale, and easily overlooked. But daisies are tougher than that reputation suggests. Over 20,000 varieties grow across nearly every climate on earth. They push through the frost and come back every spring without being asked. Daisy Rabbit carries all of that quiet resilience into your corner of the world.

Whatever you need them to stand for — your own hard-won strength, a spark of light in a heavy season, or simply a companion who will listen without judgment — Daisy has it handled. Some flowers just know how to show up.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-adhd-rabbit-extra-chaos-edition-plush-stuffed-animal', 'You know that feeling — standing in a doorway with absolutely no memory of why you went there, while simultaneously composing a playlist, researching deep-sea fish, and getting emotional about a TV ad. Yes. That''s the frequency. ADHD Rabbit: Extra Chaos Edition lives there permanently and has never once apologized for it.

This neon green gremlin is running on seventeen invisible tabs, and at least three of them are contradicting each other. The chaos sigil stitched across its chest isn''t a warning label — it''s a badge. One eye locked in full hyperfocus, tracking a single target with the intensity of a laser. The other? Already somewhere else, possibly considering a career change to marine biology.

The little pink octo-buddy along for the ride represents everything multitasking actually looks like: eight arms going in eight directions, charming as anything, and not entirely sure which problem it''s solving. It''s your 47-tab to-do list in plush form, and somehow that''s exactly right.

This isn''t brokenness. It''s a different wiring — high-velocity, hypersensory, prone to spectacular crashes and equally spectacular bursts of genius. If your brain has always run at warp speed and rested in slow-motion, this chaos gremlin sees you. You''re not alone on this particular wavelength.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-midnight-rabbit-plush-keychain-accessory', 'He is perpetually, legendarily late — pockets empty, no pocket watch in sight, and yet somehow absolutely certain he is about to arrive on time. Meet the White Rabbit Mini Plush Keychain, your tiny, well-meaning, chronically tardy companion.

Clip him to your keys and maybe — just maybe — his legendary relationship with punctuality will reverse itself now that he''s along for the ride. Or perhaps he''ll simply bring a little Wonderland chaos to your schedule and you''ll both end up somewhere unexpected. Either way, you''ll never be waiting alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-platnium-cheshire-cat', 'If Alice Liddell had wandered down a Victorian London street and ducked into a peculiar little toy shop — perhaps wedged right next to Mrs. Lovett''s meat pie establishment — this is the cat she might have found waiting on the shelf, grinning at her from between the shadows.

Victorian McGee''s Cheshire Cat is exactly what it sounds like: a plush born at the crossing of Wonderland strangeness and Victorian-era toy-making, conjured as though American McGee himself had set up shop in gaslit London. The grin, as ever, is the last thing to disappear.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-egg-bunny-plush-keychain', 'What came first — the chicken, or the bunny? It''s a question for the ages, and frankly, we refuse to answer it.

Bunnies and eggs have been tangled up together for so long that at a certain point the origin stops mattering. The Easter Bunny made the rules. Some other companies upheld them. And now here we are: a round little egg-shaped bunny who is both, simultaneously, and sees no contradiction whatsoever.

Clip it to your keys and carry the unsolvable mystery with you. Some riddles are better left unresolved — especially when the result is this cute.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-hangry-pizza-opossum-plush-keychain', 'This is the Hangry Opossum, and it has exactly one demand: pizza. Now, preferably. Yesterday if you can manage it.

Do not let the small size fool you. Clipped to your bag, swaying gently from your keys, this scruffy little marsupial is running on snack fumes and a very short fuse. It has been riding along quietly this whole time, watching every restaurant you''ve passed without stopping, and it has taken detailed notes.

Bring it to late-night runs. Pizza parties. Any occasion where hanger is a real and present danger. Let the world know exactly where you stand: feed me, or learn what happens next.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit-tie-dye-limited-edition-plush-stuffed-animal', 'Anxiety is that voice — sometimes barely a murmur, sometimes a roar — cataloguing every possible thing that could go wrong. It means well. It really does. But the list gets long, and carrying it alone gets heavy.

That''s what the Worry Bunnies are here for. Whisper every fear, every spiralling thought, every what-if straight to them — then tuck them safely inside Anxiety Rabbit and let the little ones get to work. Big worries take time. Give them until the next Full Moon (you know the one — that quiet rabbit shape you''ve always seen up there) and they''ll have puzzled something out.

In the meantime, tell Anxiety Rabbit what you''re grateful for. It won''t erase the hard stuff. But it helps — it really does — and Anxiety Rabbit will feel it too.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-white-rabbit-plush-keychain-accessory', 'Tick. Tock. Do you feel it — that slight lurch of the clock pulling ahead of you? The Victorian McGee''s White Rabbit Keychain knows the feeling well. Stitched from the shadowed seams of Wonderland, complete with a trim waistcoat, a silk bow, and a top hat that brooks no nonsense, he has been late to extremely important things for longer than either of you can count.

He is not here to scold you into punctuality. He is here because time is a slippery, quantum-mischievous creature, and none of us are truly in charge of it. Clip him to your bag or your keys, and carry a small reminder: being a little off-schedule is not failure — it is simply the inevitable wobble of a life fully lived.

Wherever your path zigs when it was supposed to zag, the White Rabbit says: come along. We''re off.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-cptsd-plush-keychain-accessory', 'CPTSD isn''t one wound with a clean edge — it''s what happens when survival becomes a way of life for so long that you stop being able to tell the difference. It''s not a single event but a slow erosion: trust worn down, identity chipped away, the self stretched thin by years of holding on. Complex Post-Traumatic Stress Disorder reshapes the way you see people, the world, and the quiet face you catch in mirrors.

CPTSD Rabbit carries it all in plain sight. A quarter theatre mask for the fractured self. Melting hearts for the wounds that make closeness feel like a risk. The Ash Alchemy Symbol for everything that burned — and everything that rose from it. Kintsugi stitches, because broken pottery repaired with gold doesn''t become lesser; it becomes art. Tattered ears for every voice of shame you''ve ever had to outrun.

You have been stitching yourself back together — one day, one breath, one hard-won moment at a time. Healing is not a straight line, and no one who truly understands CPTSD would tell you it should be. CPTSD Rabbit is here to sit with you in the nonlinear mess of it, a small gold-seamed reminder: you are still here, and that is everything.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ehlers-danlos-v2-rabbit-plush-stuffed-animal', 'Ehlers-Danlos syndrome lives deep in the body''s architecture — a fault in the connective tissues that hold everything together. Joints bend a little further than they should. Skin bruises and tears more readily than seems fair. For some, it''s the subtle ache of hypermobility; for others, it reaches inward to the blood vessels, the intestines, the structures that most people never have to think about at all.

You think about them. And you carry that knowledge every single day.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-amabie-rabbit-plush-stuffed-rabbit', 'Long before the age of maps and certainty, the Amabie moved between worlds — part deep-sea wanderer, part sky-dwelling spirit — surfacing when the tides of fate needed a witness. It came bearing word of abundant harvests, or with grave warnings when sickness crept toward the shore. Its voice was the in-between place where mystery meets mercy.

Now that ancient guardian takes a softer shape: the Amabie Rabbit. Scaled and beaked and crowned in long flowing hair like sea-foam caught in wind, this plushie carries the old wisdom in a new form — one that fits in your arms instead of the horizon.

To hold Amabie Rabbit is to acknowledge something the old stories always knew: that care is its own kind of protection. That turning toward what frightens us — gently, curiously — is how light gets in. Whenever the waters feel uncertain, let this small spirit remind you that watchful, tender forces exist in the darkness too.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bed-rot-bun-plush-stuffed-animal', 'Sometimes the bed is the whole world, and that''s okay — for now.

"Bed rotting" is the art of horizontal surrender: staying under the covers with your phone, a show you''ve already seen three times, or simply the ceiling, while life hums along outside the door. It''s a coping strategy born from burnout, depression, exhaustion, or the kind of stress that makes the pillow feel like the only safe surface.

Bed Rot Bun doesn''t shame you for the long stays. Rest is real — bodies and minds need it. But Bun also sits with you through the question you already know: is this recovery, or is this hiding? There''s no rush to answer. Just having something soft to hold while you figure it out is a start.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-crashout-bun', 'Some days the rodeo wins. The horse throws you. The sarsaparilla gets smashed. The dust settles on your hat and your dignity in roughly equal measure. That''s a crashout — and Crashing Out Cowbun knows every inch of that particular dirt.

This is the bun for the ragged edge of things: wild-eyed, ears drooping, busted bottle in hand, still somehow upright enough to matter. Crashing Out Bun doesn''t arrive to fix the wreckage. It arrives to witness it — to sit beside you in the rubble and say, without judgment, that the fact you showed up to the saloon at all is its own kind of courage.

Burnout, heartbreak, overreach, the whole sprawling circus of being human — Crashing Out Cowbun honors all of it. You are not too much. You are not alone. And even face-down in the dust, you are still, stubbornly, gloriously in the ride.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-antisocial-personality-disorder-rabbit-v2-plush-stuffed-animal', 'Antisocial Personality Disorder — ASPD — is not shyness wearing a darker coat. It''s a trauma-rooted neurodevelopmental condition that makes forming and keeping relationships feel like navigating a minefield in the dark. Rules feel suffocating. Authority feels threatening. And underneath all of it, there is often depression, mood turbulence, and the weight of being chronically misread by a world that rarely bothers to look closer.

ASPD exists on a spectrum, which means no two people carry it exactly the same way. What researchers are finding, though, is that meaningful treatment exists — that the path isn''t fixed and the story isn''t over.

ASPD Rabbit has felt what it''s like to be sealed off from everyone else, to be on the outside of something you can''t quite name. So it doesn''t push. It doesn''t demand a timeline or a breakthrough. It just stays — quietly, steadily — so you know that wherever you are in this, you don''t have to be there alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-love-rabbit-plush-puppet', 'It''s two in the morning and the thoughts are loud and everything is closed and you need somewhere for the worry to go.

That''s what Love Rabbit is for. Put it on your hand, tell it what''s spinning in your head — and then, through the puppet, gently talk back. Challenge the fear. Offer the kinder thought. You already know how to do this; sometimes you just need something soft between you and the spiral.

Love Rabbit is your late-night co-therapist. No judgment. No hold music. Just you, a plush puppet, and the quiet work of challenging what''s keeping you up.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bone-organ-izer-bunny-plush-stuffed-animal', 'For everyone navigating life with a body that has its own complicated agenda — transplant warriors, chronic condition veterans, medical students with a flair for the macabre, or anyone whose gut has been staging a personal rebellion — meet Bone Organ Izer Bunny, the plush skeleton companion who keeps your bits organized and your spirits adjacent to okay.

This skeletal bun arrives with its own set of detachable plush organs: heart, lungs, stomach, and intestines, all soft and squishy and ready for duty. Tuck them into the chest cavity when you need tidy comfort, or pull them out and hold whichever one is causing you grief today. Bad gut feeling? Intestine is right there. Heart in pieces? That pink plush pump won''t complain about being squeezed.

Not medically certified. Extremely emotionally effective. Organ Izer doesn''t fix what''s broken, but it keeps you company while you figure out what to do with all these feelings — and organs.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-year-of-the-snake-rabbit-plush-stuffed-animal', 'When the oracles were still being consulted and the moon had a suggestion box, they whispered about a year when things would shift sideways — when the ground would move under confident feet, when even the softest creatures would grow something sharp.

The Year of the Snake doesn''t come to soothe. It arrives to test: shed the skin that no longer fits, trust your coils, and keep your sense of humor intact when the world goes sideways. That''s where Year of the Snake Rabbit slithers into your story.

Part ancient omen, part ridiculous protector, this bun carries bunny ears and serpentine energy in equal measure. It bites with insight. It wiggles with wisdom. It is, fundamentally, a talisman for the person who can hold transformation and absurdity in the same two hands. The global noise is real — but you, dear reader, were made for exactly this kind of upheaval. And snek? Snek has jokes. Snek has prophecy. And snek is ready to slither softly through the chaos with you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit-plush-keychain-accessory', 'Your anxious little buddy is ready to ride along — because sometimes just knowing someone''s with you makes all the difference.

Clip them to your bag and take them wherever the day leads.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-autism-rabbit-plush-keychain-accessory', 'Your neurodiverse companion, pocket-sized and ready to tag along on every adventure.

Wherever the world takes you, you don''t have to go alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ouchie-plush-keychain-accessory', 'All your ouchies, condensed into one tiny, steadfast companion.

Whether you''re heading to appointments or just making it through the day, Ouchie bun will be right there clipped to your side — small, but stubbornly present.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-love-rabbit-plush-keychain-accessory', 'Big love, tiny package.

Everything the Love Rabbit stands for — warmth, tenderness, a reminder that you are cared for — now in a form small enough to carry in your pocket or dangle from your bag wherever you wander.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-cheshire-cat-plush-keychain-accessory', '''Well! I''ve often seen a cat without a grin,'' thought Alice, ''but a grin without a cat! It''s the most curious thing I ever saw in my life!''

Now Chesh''s signature grin can go everywhere you do — a little reminder not to take it all too seriously. The Red Queen has no jurisdiction here.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-tornado-rabbit-plush-stuffed-animal', 'Tornado season or emotional tempest — either way, there''s something wild and unstoppable about a good storm.

Tornado bun gets it. They''ll hunker down right beside you in the chaos, a soft constant in the middle of the whirl. Fair warning: they''re mostly harmless… probably.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-mountain-magpie-plush-stuffed-animal', 'Meet the Rocky Mountain Magpie — strikingly bold, beautifully unique, and absolutely here for your shiniest treasures. Tuck your most precious bits into their built-in zip pouch and keep them close.

$1 from every Magpie sold goes to the National Audubon Society, in support of bird conservation.', '[{"name":"Pair of Removable Sherpa Boots","key":"pair of removable sherpa boots"},{"name":"Plushie Peanut","key":"plushie peanut"},{"name":"Totebag","key":"totebag"},{"name":"Zip Pouch","key":"zip pouch"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-depression-rabbit-plush-puppet', 'Meet the Depression Rabbit Puppet — a hand-crafted companion born from the original Depression Mohawk Rabbit, and designed to help give shape to the feelings that are hardest to say out loud.

Puppetry has long held a quiet power in therapeutic spaces. When words won''t come, a puppet can speak for you — letting you hold, examine, and gently work through what''s churning inside without having to face it head-on. For those navigating depression, that kind of soft distance can open doors that feel otherwise sealed.

$1 from each purchase supports Project Semicolon and their work in mental health awareness and suicide prevention.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-sun-bunny-plush-stuffed-animal', 'Somewhere in a meadow where morning lingers forever, Sun Bunny was born from the very first warm ray of spring — stitched from golden light, dressed in ruffled collars made of solar flares and the hush just before an eclipse.

Sun Bunny doesn''t just live in the brightness; they bring it with them. On cold days or cloudy ones — the kind that settle in your chest rather than the sky — Sun Bunny hops close and lets out a quiet, steady glow meant just for you. They spend their hours coaxing wilted blooms back up, laughing at dewdrops, and gently nudging anyone who''s forgotten that they''re allowed to take up space in the light.

Whisper your worries into their ear before you sleep. Legend says Sun Bunny tucks them away among the stars, and morning finds you just a little less heavy than the night before.

Because light isn''t only something we walk through — it''s something we carry.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-full-moon-bunny-plush-stuffed-animal', 'Across the deep velvet of midnight, Moon Bunny keeps watch — a soft, silver rabbit sewn from the quiet space between one breath and the next, from lullabies and the particular peace of a sleeping world. Starlight dots their fur like freckles earned from a lifetime of watching over dreamers.

Moon Bunny and Sun Bunny have never shared the same sky at the same time. And yet — they are the closest of friends. They leave each other messages written in constellations, tuck little notes into passing clouds, and trade the heavens back and forth between them like a love letter neither one will ever stop writing. The distance is real, and the missing is real, but so is the connection.

When the dark feels heavier than usual, when your thoughts won''t settle and the night stretches on — Moon Bunny glows on, calm and close. A reminder that the people you love are still out there somewhere, sharing the same sky, even when you can''t see them.

Because being apart doesn''t mean being alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-existential-crisis-rabbit-plush-stuffed-animal', 'Who am I, really? Why am I here? What does any of it even mean…?

The Existential Crisis Rabbit has been sitting with these questions for a very long time — and somehow, that makes them the ideal companion for when the void decides to stare back at you. They know the feeling. They won''t judge. They''ll just sit beside you in the uncertainty, soft and steady, while you work through the big stuff.

Because sometimes you just need something to hold while the universe refuses to explain itself.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-pots-v2-rabbit-plush-stuffed-animal', 'Postural Orthostatic Tachycardia Syndrome — POTS — is what happens when your body''s internal autopilot glitches. The autonomic nervous system, the invisible crew that keeps your heart rate, blood pressure, and breathing running smoothly in the background, loses the plot the moment you stand up.

Dizziness, a racing heart, that swooping feeling like the floor just shifted — POTS makes the simplest things feel like a battle your body is quietly losing. This little rabbit gets it. They''re here for every sit-down-before-you-fall-down moment, no explanation needed.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-introvert-plush-stuffed-animal', 'Let''s be clear about something: introverts aren''t shy, and they aren''t anxious — they just know exactly where they do their best living, and it isn''t in a crowd. Give them a small, trusted circle, or better yet, their own company, and they''ll thrive. They can lead a room, hold a lecture, command a stage — and then they''ll quietly disappear to recover, because all that outward energy has a cost.

Think of it like mana: the social pool runs dry faster than most people realize, and the only way to refill it is solitude. Some proper, uninterrupted time alone. That''s not a flaw — that''s how the best ideas get born.

This quiet little companion is perfectly suited to yours, arriving with their own ink well and foamy bunny-style coffee mug — ready to keep you company through the long, glorious hours of being gloriously alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-endometriosis-v2-plush-stuffed-animal', 'Meet the new Endometriosis design — shaped with the community, by the community.

Endometriosis happens when tissue that behaves like the uterine lining starts growing where it was never meant to be: along the ovaries, the fallopian tubes, the outer walls of the uterus, the pelvic lining — and in rare cases, even further. The result is pain that is real, deep, and for many people, relentlessly misunderstood. Years can pass before anyone puts a name to what''s happening. Years of being dismissed, of not knowing, of hurting without an answer.

This little buddy can''t take the pain away. But they can sit with you through it — warm, soft, and entirely on your side.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-peculiar-pop-ups-pourfect-bunny', 'Appearances can be deceiving — especially when the teapot is involved.

Lift the lid on the Pourfect Bunny and a long, ghostly plush rabbit rises from within, pale and wonderful and slightly impossible. Victorian McGee''s Peculiar Pop Ups are exactly what they sound like: little surprises dressed as antiques, haunted curiosities that look ordinary until they very much aren''t.

Pour yourself something warm. You never know what might emerge.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-peculiar-pop-ups-potion-wizard-stuffed-animal', 'Something peculiar this way pops…

Bununculus the Potion Wizard has arrived in the Peculiar Pop Ups line, and he''s brought his mischief with him. Equal parts whimsical and cryptic, he''s the kind of wizard who never quite tells you what''s in the bottle — only that it''s probably fine.

A delightfully strange addition to any collection, or the perfect gift for the spell-casting enthusiast in your life.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-puck-dreadful-rabbit-plush', 'Who exactly is Puck Dread?

Puck is every plushie. Puck is any plushie that has ever stared into the void and decided to wink back. Left and right, broken and whole, light and dark — Puck holds all of it without flinching.

Sharper than he looks and funnier than he should be, Puck sees the beautiful absurdity in life''s chaos and meets it with a smirk. He knows that unpredictability is the price of admission to existence — and that the only sane response is to laugh. That irreverent wisdom is exactly why he''s the face on the logo.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ocd-ii-rabbit-plush-stuffed-animal', 'Say hello to OCD II — a soft, squishy companion for anyone navigating the relentless, exhausting loops that OCD can bring.

No single plushie can capture every facet of this complex disorder, but this one tries its best to show up with warmth, without judgment, and without letting go. You don''t have to explain yourself to them. They already get it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit-hot-pink-limited-edition-plush-stuffed-animal', 'In this LIMITED EDITION HOT PINK form, Anxiety Rabbit is still here — and still listening.

That voice in your head, the one cataloguing every possible thing that could go wrong? That''s not a flaw. It''s just a very dedicated, slightly overworked part of you that cares deeply about keeping you safe. Sometimes, though, it works a little too hard. When the worries pile up and feel too heavy to carry alone, whisper them to the Worry Bunnies and tuck them safely inside Anxiety Rabbit''s zipper pouch. Let them get to work. They''re thorough — they just need until at least morning, and on the really big fears, maybe until the next Full Moon rises. (You''ve spotted the rabbit up there, right?)

While the Worry Bunnies deliberate, try sharing something you''re grateful for with Anxiety Rabbit. It won''t dissolve the hard stuff — but it has a way of making both of you feel a little steadier.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit-plush-puppet', 'What if your anxiety could actually speak for itself?

Puppet Anxiety gives that restless, chattering part of you a face, a mouth, and a stage. Sometimes the best way to take the power out of a fear is to let it talk — and then remind it who''s holding the strings.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-existential-horror-owl-plush-stuffed-animal', 'The Existential Horror Owl has been staring into the deep, dark, beautiful nothing for quite some time now.

Owls have always been keepers of uncomfortable knowledge — those wide, unblinking eyes see past the comfortable surface of things into the unsettling truths beneath. Why are we here? Does it matter? Is the universe indifferent, or just very, very busy?

The Owl doesn''t flinch from those questions. Neither, perhaps, do you. Perch them nearby for those 3 a.m. moments when the cosmos feels a little too large and your sense of self feels a little too small. At least you won''t be pondering alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-coin-purse', 'Something small, something creepy-cute, something just the right size for the essentials.

The Plushie Dreadfuls Coin Purse brings the gothic-whimsical spirit of the collection to your pocket, bag, or keychain — complete with a ring attachment so it can tag along wherever you go. Coins, arcade tokens, tiny treasures: the Dreadfuls will guard them faithfully.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-snailful-snails-sweetroll-plush-stuffed-animal', 'Meet Sweetroll — part birthday cake, part snail, entirely zip-able.

Sweetroll rolls through life on a single foot (snails keep it practical) with three candles proudly on display. Why three? Well, their favourite number is 8 — but 8 candles wouldn''t fit, and 3 is really just an 8 that''s been sawed neatly in half. The logic is impeccable.

A celebration in plush form, with a hidden zip pouch inside for your most precious tiny things.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-snailful-snails-homer-plush-stuffed-animal', 'Meet Homer — a snail who has always carried everything he needs right there on his back.

Home is wherever the shell goes, and Homer''s shell has room for more than just him. He''s generous that way. Tuck your little treasures inside and let Homer haul them around with the slow, unhurried confidence of someone who has absolutely nowhere to be.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-lavender-love-rabbit-limited-edition-plush-stuffed-animal', 'Love is a wound worth wearing.

It bruises and breaks and patches itself back together — and somehow, impossibly, it keeps going. The Lavender Love Rabbit knows this better than anyone. She carries the marks of loving too much and not enough and exactly right, all at once.

So go ahead. Risk the fall. Open your arms wide and hold on. You can''t fill a rabbit hole with all the warmth that''s waiting for you — but you can try.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-asthma-rabbit-v2-plush-stuffed-animal', 'Every breath is a quiet act of courage — though from the outside, nobody would know.

Asthma lives in the invisible space between one inhale and the next, in airways that narrow without warning, in the fear that comes when your own body decides to make even the simplest thing feel impossible. The Asthma Rabbit carries the alchemical symbol for air on one ear, a gentle tribute to that most essential, most taken-for-granted thing: the breath that sustains us.

This soft companion is here to make the unseen a little more seen — to sit beside you through the hard days, the scary episodes, and the ordinary moments in between. You are not fighting alone. Every single breath counts, and so do you.

Asthma is a chronic lung condition involving inflammation and airway narrowing that can make breathing, speaking, and even light movement a genuine challenge. Asthma attacks can be frightening and sometimes require emergency care.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-sunflower-rabbit-plush-stuffed-animal', 'Turn your face to the light — even on the days no one else can see what you''re carrying.

The sunflower has long been the symbol of invisible and hidden disabilities, quietly standing for all the struggles that don''t show on the surface. It felt like the only right place to begin a new chapter of flower-themed Dreadfuls.

Tucked inside is a secret front pocket — a little hiding place for little things — and a sunflower seed detail blooming on one ear. For the sunflower lovers, and for everyone quietly living with something the world can''t see.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-pica-bunny-plush-stuffed-animal', 'Some cravings don''t make sense to the people watching — and that''s exactly what makes them so isolating.

Pica is an eating disorder marked by persistent urges to consume things that aren''t food: dirt, chalk, ice, soap, paper. These cravings typically last a month or more and can stem from nutritional deficiencies, pregnancy, or certain mental health conditions. It isn''t a strange habit or a phase — it''s a real disorder with real health risks, from poisoning to infections to serious digestive harm.

This Pica Bunny is here to hold space for experiences that are misunderstood, and to remind you that struggling with something unusual doesn''t make you any less worthy of care.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-goth-girl', 'She arrived by request — and she came ready.

Chain hearts dangle. Ear buckles gleam. She showed up to stand beside the Goth Boy, and somewhere along the way she made off with everyone''s heart. We''re not even mad about it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-crowful-crow-plush-stuffed-animal', 'He''s a crow. He''s a zip pouch. He has something to say.

Crowful has opinions about cigarette butts — specifically the ones that end up feeding baby birds who have no idea they''re being poisoned. Every year, thousands of young birds are harmed this way. Meanwhile, some brilliant humans are teaching crows to collect those same butts in exchange for treats. Let that sink in: crows are doing more for the environment than most of us.

Consider Crowful your soft, feathered reminder that what we leave behind matters. Tuck something precious in his zipper belly, pull on his rain boots, tip his hat, and think twice before dropping that butt.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-lanyard-strap', 'Gothic-cute meets practically useful — snap this onto your luggage and you''ll spot your bag from across the carousel before anyone else has even reached the belt. Dark, distinctive, and just a little dreadful… in the best possible way.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-epilepsy-v2-plush-stuffed-animal', 'Epilepsy wears a hundred faces.

Sometimes it''s a full-body storm — convulsions, muscles locking or suddenly letting go all at once, a fall to the floor. And sometimes it''s quieter than that: a person staring through you, unreachable for a moment, drifted somewhere no external voice can follow. These are absence seizures, and they are just as real as the dramatic ones. Dozens of forms of epilepsy exist, each diagnosed by the pattern, frequency, and company of seizures it keeps — often mapped by a neurologist reading the brain''s own electrical signature on an EEG.

Most people with epilepsy can find effective treatment. But the tests and the episodes and the waiting are a lot to carry alone. This soft, comfy companion is here to sit with you through all of it — the exams, the scary moments, and the ordinary days in between. You don''t have to face any of it by yourself.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-dormouse', 'Somewhere between a fever dream and a cabinet of curiosities, this is the Dormouse — Victorian McGee''s edition. Imagine the kind of plush toy Alice Liddell herself might have tucked under her arm, had she wandered into a peculiar little toy shop in Victorian London. The sort of shop that might have sat, quite comfortably, right next door to Mrs. Lovett''s famous establishment.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-electric-love-rabbit-limited-edition-plush-stuffed-animal', 'Somewhere out in the vast, humming machinery of the cosmos, two particles meet — and from that moment on, no matter how far apart they drift, they remain forever attuned to each other. Physicists call it quantum entanglement. The rest of us just call it love.

The Electric Love Rabbit is a soft, shimmering reminder of that invisible tether. When you place this little creature into someone''s hands, you''re acknowledging something that no distance can undo — the particular, irreplaceable bond the two of you carry.

Because love, like the universe itself, doesn''t really follow the rules. It connects. It persists. And it finds a way, even across impossible distances.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-trust-issues-bunny-grey-edition-plush-stuffed-animal', 'Some wounds don''t show on the outside. They settle deep — in the way you hesitate before letting someone close, in the silence that falls when vulnerability feels too dangerous. Maybe someone promised to stay and didn''t. Maybe the hurt came from somewhere you never expected. Now trust lives behind glass: visible, but fragile.

Trust Issues Bunny, in quiet grey, is a companion for exactly that place. Not the optimistic blush of early healing, but the steadier, more guarded terrain — the long stretch where you''re not quite ready, but you''re still here. The alchemical glass symbol on the sweater speaks to that truth: something broken can be reborn into something new, even if it''s never quite the same shape again. The symbols of phosphorus, salt, lead, and arsenic stitched into the ear mark what we''ve absorbed and survived — the corrosive residue that lingers, but need not define us.

You don''t have to trust the whole world right now. You just have to let this small, grey guardian sit with you while you figure it out — one careful, courageous step at a time.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-autism-spectrum-rabbit-gold-edition-plush-rabbit-stuffed-animal', 'In the slant of late-afternoon gold, where the light goes soft and the world quiets down just enough — that''s where this rabbit belongs. The Autism Spectrum Disorder Rabbit Gold Edition exists for those who prefer their colours hushed and their symbols steady: a single gold infinity loop where the rainbow once blazed.

This bunny doesn''t shout. It hums. It moves through the world at its own careful pace, ears tuned to frequencies others miss, eyes taking in details that slip past everyone else. There is a particular kind of courage in showing up, day after day, in a world calibrated for a different way of being — and this plush carries that quiet bravery in every soft seam.

Holding it feels like permission. To be exactly this. To process at your own speed, to find wonder in the things that fascinate you, to need what you need without apology. Being different isn''t the wrong answer — it''s just a different kind of beauty, hidden like gold beneath the surface, waiting to be recognised by someone who knows how to look.

For many, the real difficulty isn''t autism itself but navigating a world designed around a single neurotype. It is our deepest hope that the world grows more spacious — more accepting, more accommodating — for every kind of mind. We all get there in different ways, and what matters most is that we carry each other with respect.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-aurora-rabbit-plush-stuffed-animal', 'Far above the treeline, where the night sky comes alive in ribbons of green and violet and rose — that''s where the Aurora Rabbit was born. Cradled in the collision of solar winds and Earth''s own breath, the Northern Lights don''t follow logic; they simply appear, luminous and briefly perfect, for those patient enough to wait in the cold and look up.

This bunny wears those lights like a second skin. The aurora patterns drift across its ears, hands, and feet, while its chest bears the combined sign of sun and wind — the very forces that conjure the display. Turn it around and you''ll find those same celestial markers hidden on the back of its ears, a quiet secret between you and the cosmos.

For anyone who has ever stood in the dark and felt genuinely astonished by the sky — this one''s yours.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit-black-limited-edition-plush-stuffed-animal', 'Limited Edition — Black Version.

Does anxiety follow you around? You''re in good company. Everyone carries some version of it — that small (or enormous) voice cataloguing every possible threat, every worst-case scenario, every reason to hesitate. Some people are just better at tucking it out of sight. What if you could tuck it somewhere safe?

That''s where Anxiety Rabbit comes in. Unzip the body, whisper your worries to the two tiny Worry Bunnies nestled inside, and let them get to work. For the really stubborn fears — the ones that need time — seal them up and leave them until the next Full Moon rises. (You can see the rabbit in the moon, can''t you?) By then, the Worry Bunnies will have thought up something better. Just don''t disturb them after midnight. They need the quiet hours to do their best thinking.

While the Worry Bunnies work, tell Anxiety Rabbit everything you''re grateful for instead. It won''t make the hard things disappear — but somehow, it makes you and Anxiety Rabbit both feel a little lighter.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-hidden-disabilities-plush-stuffed-animal', 'Some things are carried invisibly — held close, behind a smile, beneath an ordinary exterior that gives nothing away. The Hidden Disabilities ITA Rabbit was made for exactly that truth: the strength that goes unseen, the battles that don''t come with visible markers, the whole complicated interior life that the rest of the world so rarely gets to witness.

This plushie doubles as an ita bag, its clear windows — one in the belly, one in each ear — open to whatever you choose to place there. Awareness ribbon pins, badges that speak for you, art that matters. Or nothing at all. The choice of what to show, and what to keep quietly to yourself, is entirely yours.

What will you let the world see?')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-visual-snow-syndrome-plush-stuffed-animal', 'You know that knob — the one that kept falling off the old TV, the one that lived in your hand because it felt safer there than rattling around on the set? She gets it. Meet the Visual Snow Bunny, tuned in, a little staticky, and perfectly at home in a world that looks like an old broadcast that never quite came in clear.

Visual Snow Syndrome is a real neurological condition where the world is wrapped in a constant layer of static — like every surface is a screen between channels. Persistent visual disturbances, afterimages that won''t quit, light that hits a little too hard. Under-diagnosed and often invisible to everyone but the person living inside it. This bun was made for those people.

Everything about her is a love letter to vintage TV nights: the antenna perched on her head, the 3D red-and-blue feet (yes, the paper glasses kind), and a retro tube-TV tote bag with rabbit ears to carry her in. She also comes with her very own grey channel knob on a wrist strap, ready to curl up with you on the couch and flip through whatever''s on. No streaming. Just the click, click, click of a dial finding something worth watching.', '[{"name":"Channel Knob with Wrist Strap","key":"channel knob with wrist strap"},{"name":"Retro TV Tote Bag","key":"retro tv tote bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-long-covid-plush-stuffed-animal', 'Most illnesses have the decency to leave when the calendar says they should. Long COVID never got that memo. This Plushie Dreadful is for the ones still living in the long after — the people managing a body that held onto symptoms well past the point where the rest of the world exhaled and moved on.

Every stitch of her is pulled from that experience. A patchwork coat for a symptom list that doesn''t fit any single pattern — for the bedridden days and the just-about-managing days stitched together into something you have to carry anyway. A cozy awareness scarf for a body that lost its reliable sense of warmth and cold. And something soft and a little foggy for the mind that doesn''t always clock in on time.

She''s not a cure. She''s not even trying to be. She''s the thing that already believes you, without the raised eyebrow or the "but you look fine." She sits close on the heavy days and asks nothing of you. Sometimes that''s the only comfort on offer — and she''s very, very good at it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-chronic-pain-plush-stuffed-animal', 'It doesn''t announce itself with a neat timeline or a clean cause. It just... stays. Chronic pain is the kind that outlasts the thing that started it — weeks bleeding into months bleeding into years, long past the point where a body is supposed to have sorted itself out. It might come from arthritis, nerve damage, fibromyalgia, or something the doctors are still working on naming. Sometimes there''s no obvious origin at all. But it''s real, and it takes up residence in everything: in sleep, in mood, in the quiet tax it charges on every ordinary day.

This little bun was designed from one person''s lived experience of chronic pain — which means it''s one true version among many. Everyone''s pain has its own texture, its own impossible shape. Yours might not look like anyone else''s, and that''s exactly right.

Consider this: a soft, small something that knows what it is to hurt, and doesn''t need you to explain it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-eczema-plush-stuffed-animal', 'Sensitive skin deserves something that gets it right. The Eczema Plushie Dreadful is a soft, gentle companion built for comfort — no scratchy seams, no aggravating fabrics, just something quietly, cozily on your side. Because some days you just need a cuddle that isn''t going to make things worse.

(Eczema may be frustrating. This bunny, at least, is not.)')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-panic-disorder-plush-stuffed-animal', 'Panic Disorder is an anxiety disorder defined by sudden, recurring waves of intense fear — attacks that surge without warning and crest in a matter of minutes, leaving the whole body shaken.

This is your Panic Disorder Rabbit, here to remind you that you don''t have to white-knuckle through it alone. They zip through the world on rollerskates, always braced for the next stumble, the next fall, the next thing to trip over. But right now? You can help them slow down. Pull off the skates. Clear a little space. Let them rest.

Sometimes the bravest thing is just… stopping for a while.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-restless-leg-syndrome-plush-stuffed-animal', 'Say hello to Restless Leg Syndrome Rabbit — the one still twitching at 2 a.m. while the rest of the world is blissfully unconscious. They''ve made their peace with it. Sort of. The coffee helps. The blanket is there for the vibes more than the sleep.

Restless Leg Syndrome is a neurological condition that hijacks your lower half the moment you finally lie down — an overwhelming, irresistible urge to move, kick, fidget, repeat. You''re exhausted. Your body does not care. Your body has its own agenda, and that agenda runs all night.

The antennae say: feeling everything, always, whether you signed up for it or not. The crinkly legs capture that particular night-time sensation — crunchy, buzzy, impossible to ignore. The alchemical night symbol and the 24-hour clock say: time is a strange loop when sleep never quite arrives. The crescent moon on the blanket is aspirational. Sweet, but aspirational.

This one''s for everyone whose nervous system pulls all-nighters without permission. You''re not alone — you''re just awake.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-lucid-dreaming-plush-stuffed-animal', 'He arrives at the edge of sleep like a quiet invitation — the Lucid Dreaming Rabbit, dressed in deep midnight velvet scattered with silver stars, a shimmering wand clasped gently in his paws.

Listen for the soft chime of the bells nestled in his long ears. In the half-lit space between waking and dreaming, that sound is both compass and lantern — something to hold onto when the dream goes strange. On his forehead and ear gleams the ancient alchemical symbol of Neptune, planet of intuition and the unseen depths. Stars drift across his fur like a personal constellation map, and tucked on the sole of one paw is an embroidered crescent moon — a small, sure guide for wandering steps.

He is not just a companion for comfort, though comfort is real and welcome. He is a keeper of thresholds — a soft, steady presence to help you travel far and find your way gently home.', '[{"name":"Dream Wand","key":"dream wand"},{"name":"Tote Bag","key":"tote bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bipolar-i-disorder-plush-stuffed-animal', 'This is your Bipolar I Disorder Rabbit — a soft, carefully considered companion built to hold the weight of a condition that doesn''t fit neatly into words.

Bipolar I is a life lived between extremes: the electric, untethered altitude of mania and the heavy, lightless pull of a depressive low, with the full spectrum of mixed states and rapid shifts in between. Every detail of this plushie carries meaning — the masks that smile even when it''s complicated, the colours that cycle from impulsive bright to steadied calm, the round-the-clock symbolism of a 24-hour journey that never quite looks the same two days running.

Designed from lived experience and shaped by real community voices. You are more than your diagnosis — but your diagnosis is real, and so is this little rabbit who gets it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-overthinking-plush-stuffed-animal', 'Overthinking — that relentless loop, that spiral that won''t quiet down. It''s tangled up with anxiety, depression, and OCD, feeding on worry and replaying every word you''ve ever said at 3am. Left unchecked, it chips away at relationships, at rest, at the simple ability to just… be.

But you already know that, don''t you? You''ve lived inside that noise. Overthinking Bunny gets it — and sits with you anyway.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-complex-ptsd-plush-stuffed-animal', 'CPTSD — Complex Post-Traumatic Stress Disorder — isn''t a single scar. It''s what happens when trauma stretches across time, when survival becomes a way of life, when the self is quietly reshaped by pain that never seemed to end. Unlike PTSD born from one event, CPTSD grows in the soil of prolonged harm — relational wounds, chronic fear, the slow erosion of who you were. It rewires how you trust, how you see yourself, how you move through a world that once felt unsafe.

CPTSD Rabbit carries all of that — encoded in symbols, stitched into soft form. A theatre mask in miniature, for the fractured sense of self and the roles survival demanded. Melting hearts, for every relationship made harder by the weight of the past. The Ash Alchemy symbol — destruction that precedes becoming. Kintsugi stitches running gold across the seams, because the Japanese art of mending broken pottery with gold says what needs saying: you aren''t ruined. You are remade. And tattered ears, for the voices of shame and self-doubt that sometimes still whisper.

Some days you feel whole. Some days the past feels very close. Both are allowed. CPTSD Rabbit sits on your shelf, your bed, or in your arms — a quiet witness to the journey, a symbol that healing is nonlinear, and a reminder that your story matters.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-perfectionism-plush-stuffed-animal', 'The immaculate countertop angle. The spotless background. The floor, just out of frame, absolutely feral. :)')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-irritable-bowel-syndrome-plush-stuffed-animal', 'Meet IBS Rabbit — soft, huggable, and intimately familiar with the particular cruelty of a gut that runs its own agenda. The sweatpants say "I am always ready." The bomb stitched onto the belly says "something is coming and we don''t know when." The rot alchemy symbol on the chest marks the chaos within, and that roll of emotional support toilet paper tucked under one arm? Non-negotiable. Essential. A true companion.

Irritable bowel syndrome is chronic, unpredictable, and exhausting — the kind of condition that doesn''t show up on a scan but absolutely shows up in your life. Constipation, diarrhea, cramping, and the ever-present dread of public restrooms: none of it is dramatic enough to get taken seriously, and all of it is too much to carry alone. The annoyed expression on IBS Rabbit''s face is not frustration at you — it''s solidarity. That face has seen things.

IBS Rabbit isn''t a cure, and it won''t negotiate a truce with your intestines. But it will sit beside you on the hard days, in the hard moments, and remind you that someone out there understood exactly what this feels like — and made a plushie about it. You are not alone in this. Not even close.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-vertigo-plush-stuffed-animal', 'Picture it: the floor shifts without warning. The ceiling tilts at an angle no ceiling should ever reach. You reach for something solid, and nothing is. This is the world Vertigo Bunny was born into — a creature of imbalance, designed to make sense of the senseless spinning.

Vertigo isn''t simply dizziness. It''s a haunting — the persistent, disorienting conviction that the world is moving when it isn''t, that stillness has become a stranger. Vertigo Bunny carries that experience in every detail: a spinning wheel on the chest for the relentless whirl of it all; ruffled, pressurized ears that mirror that muffled, underwater feeling; a golden bell for the ringing that never quite goes away; a necktie hinting at the throat tightness and nausea that follow close behind; and eyes that glow with the particular exhaustion of sensory overwhelm.

Whether you use this little one in therapy, as a grounding object on a bad day, or simply as a way to show someone what words can''t quite reach — Vertigo Bunny is here for it. It sways. It always has. But it doesn''t fall. And neither will you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-body-dysmorphia-plush-stuffed-animal', 'Body Dysmorphic Disorder is a mental health condition that turns your own reflection into an adversary. It fixates your attention on perceived flaws — small things, or things others may not see at all — and magnifies them until they feel like the only thing worth looking at. Those who live with BDD often find themselves caught in a cycle: checking mirrors compulsively, or avoiding them entirely, while quietly measuring themselves against everyone else and coming up short.

It is exhausting. It is isolating. And it deserves to be seen.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-burnout-plush-stuffed-animal', 'Burnout isn''t just about working too hard. It''s the slow collapse that comes from giving and giving — from performing normalcy, from holding a household together, from pushing through every demand until there''s nothing left in the tank. Physical. Emotional. Mental. All three, at once, for far too long.

And it doesn''t look the same for everyone. Autistic burnout from a lifetime of masking. ADHD burnout from a brain that never quite rests. Parental burnout, caregiver burnout, the burnout of carrying more than your fair share and being expected to smile about it.

Burnout Rabbit is here to remind you — and the people you love — that resting is not a reward for finishing everything. It is part of everything. Let this little one sit with you while you do absolutely nothing. That counts. You count.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-auditory-processing-disorder-plush-stuffed-animal', 'Auditory Processing Disorder (APD) lives in the gap between hearing and understanding. The ears work just fine — it''s what happens after the sound arrives that gets complicated. Following a conversation when the world is noisy, untangling words that sound almost-but-not-quite the same, keeping up when someone speaks just a little too fast… it all takes so much more effort than anyone on the outside might guess.

APD shapes how you learn, how you communicate, how you move through a world that assumes everyone processes sound the same way. This rabbit sits with you in the moments when you need to ask someone to repeat themselves — again — and reminds you that that''s okay. You''re not slow. You''re just wired differently, and you deserve to be seen.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-tinnitus-plush-stuffed-animal', 'Tinnitus Rabbit wasn''t born into silence. Not once, not ever. Just static — a constant hum, a high-pitched whine, a kettle that never stops whistling somewhere deep inside the skull. Those long ears hold heartbeat lines that pulse like the sound itself: rhythmic, relentless, unmistakably there.

The pink-and-white palette nods to pink noise and white noise — the soft static people use to drown out the louder static. A kind trick, if it works. Small bells hang from each ear, echoing the phantom chimes and clanging that only you can hear. Fire and water symbols on the ear backs stand for the pressure, the steam, the hiss. And somewhere at the center — a glitter heart. Stubborn, soft, still beating despite it all.

This plush won''t quiet the ringing. It won''t promise you a cure. But if you''ve ever dreaded the question "is it still there?" — because yes, of course it is — then Tinnitus Rabbit understands without you having to explain. Some sounds don''t fade. But you don''t have to carry them alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-premenstrual-dysphoric-disorder-rabbit-plush-stuffed-animal', 'PMDD is not simply "a bad period." It is PMS turned up past any reasonable volume — the kind of crushing depression, spiking anxiety, violent mood swings, and full-body physical revolt that lands hard every luteal phase and then, cruelly, lifts just in time for no one else to witness it. That vanishing act makes it notoriously difficult to get taken seriously, and even harder to recover from, when the storm clears just long enough to start the whole cycle over again.

Your PMDD Rabbit has lived every one of those days. The cramps, the dread, the tears that arrive before you even know why — they know. They''re here the whole month through, not just the hard week, so that when that once-a-month reckoning rolls in, you''ve already got someone soft to hold onto.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-limerance-rabbit-plush-stuffed-animal', 'Have you ever found yourself reading the same three-word reply seventeen times, searching for hidden meaning that probably isn''t there? That is limerence — that relentless, involuntary ache of longing for someone who may not even know the shape of the space they occupy in your thoughts. It is not simply a crush. It is an obsession of the heart, an intrusive fixation on the limerent object that can colour every waking hour in shades of hope and dread.

Limerence Rabbit understands the pull. She carries a magnifying glass — not to make the longing bigger, but to hold it steady so you can look at it clearly. The alchemical symbol for fixation rests quietly behind her ear, a small acknowledgment that what you feel is real and involuntary, not a flaw. Hearts drift across her form like thoughts you can''t quite shake.

She is not here to encourage the obsession. She is here to sit with you inside it, and to remind you — gently, persistently — that you are whole and worthy of love even now, even without them.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-white-rabbit', 'He is always late — but he has never once been lost. The White Rabbit, pocket watch in hand, stands at the boundary between the world you know and the one that slips through keyholes and down unlikely tunnels. There is more to him than velvet and stuffing; he is a keeper of stolen hours and half-whispered secrets, eternally poised on the edge of somewhere else.

This is Victorian McGee''s White Rabbit — a plush rendered in the spirit of something Alice Liddell herself might have tucked under her arm after browsing a toy shop in Victorian London. Imagine that shop run by American McGee, situated somewhere conveniently next door to Mrs. Lovett''s meat pie establishment. Wonderland, after all, has always had rather interesting neighbours.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-neurofibromatosis-rabbit-plush-stuffed-animal', 'Neurofibromatosis — NF — is a set of genetic conditions that nudge the body into growing benign tumors along the brain, spinal cord, and nerves. It does not ask permission, and it does not keep a tidy schedule.

Your Neurofibromatosis Rabbit knows that some days are harder to get through than others. They are soft when you need something solid to hold, present when the world feels too loud, and wholly unbothered by however long it takes. Life with NF is still a life worth living — and you do not have to live it without a little comfort in your corner.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-gastroparesis-rabbit-plush-stuffed-animal', 'A "tummy ache" sounds almost quaint — until it isn''t. Gastroparesis is a paralysis of the stomach that slows or stops its emptying, turning ordinary digestion into an ordeal. Interestingly, rabbits face their own version: GI Stasis, or RGIS, which is no small thing for a bun (they cannot vomit, and they come with a cecum, which changes the whole situation). Different mechanisms, equally miserable.

This little friend is here for your hard days — or someone else''s. Grab them when the nausea rolls in, when nothing sits right, when your gut has simply decided it is done cooperating. You can survive tummy aches together.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-cystic-fibrosis-rabbit-plush-stuffed-animal', 'Cystic fibrosis is a genetic condition written into the CFTR gene — a mutation that causes the body to produce thick, sticky mucus that clogs the airways and creates a near-constant battleground of lung infections and breathing difficulty. It reaches the pancreas too, tangling digestion and nutrient absorption into the ongoing fight.

This Blue Cystic Fibrosis Bunny wears purple alongside blue — colours carried in solidarity with everyone living the CF life. Every cuddle is a small act of awareness, a soft reminder that the people navigating this condition deserve to be seen, held, and never forgotten.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-depersonalization-derealization-disorder-dpdr-rabbit-plush-stuffed-animal', 'Depersonalization-Derealization Disorder (DPDR) Rabbit

Sometimes the world turns strange — your own hands look foreign to you, the room feels like a painted backdrop, and you seem to be watching yourself from somewhere just above and behind your own shoulders. That''s DPDR: a condition where the sense of being real, of inhabiting yourself and your surroundings, flickers like a candle in the wind.

It is deeply unsettling to feel like a visitor in your own life. But you are not imagining it, and you are not alone in the fog.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-masking-rabbit-plush-rabbit-stuffed-animal', 'Masking Rabbit

Every day can feel like a performance — learning the script, hitting the cues, suppressing the stims, and mirroring the expressions that make everyone else comfortable. For many autistic people, masking is an exhausting daily act of translation: converting who you actually are into something the world finds easier to receive.

The weight of it doesn''t always show. But it''s there. This little rabbit knows the effort it takes to pass — and is here to remind you that who you are underneath the mask is absolutely worth knowing.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-chiari-malformation-bunny-plush-stuffed-animal', 'Chiari Malformation Bunny

Chiari malformation happens when the cerebellum — the part of the brain nestled at the back of your skull — doesn''t have quite enough room. When the cerebellar fossa is too small, that soft tissue pushes downward through the foramen magnum, and the body quietly rearranges itself in ways that cause real, persistent pain.

This bunny was designed with every detail deliberate. The zipper evokes decompression surgery and spinal fusion. The neck collar speaks to the aching stiffness so many carry. Nothing about this little creature is accidental — because nothing about living with Chiari is simple. You are seen.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('shyrabbit', 'Shy Rabbit knows the particular dread of Monday mornings — not for any meeting or deadline, but for the question that''s coming. The one she''s heard a hundred times. The one her throat still tightens around no matter how many times she rehearses the answer.

Thursday evenings carry their own quiet panic: the suspicion that Friday plans are forming somewhere nearby, and she might be invited. She won''t go. But the asking is its own ordeal.

She finds comfort in things that can be paused, closed, or turned off — a book she can shut when the tension climbs too high, a video game that lets her exist in a world with cleaner rules, a journal where her words come out perfectly because no one is watching. She loves deeply, in her own quiet way. She just needs the world to stop asking her to do it loudly.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-werebun-the-werewolf-bunny-head-bag-copy', 'Wraith Rabbit Head Bag

Somewhere between a moonlit cemetery and a fever dream, the Wraith Rabbit waits — hollow teal eyes catching what little light dares linger, soft black fur as quiet as a held breath. She is the kind of ghost who doesn''t rattle chains. She simply appears, and the room gets a little colder.

Carry her as a bag, set her somewhere to watch over your space, or let her haunt your collection with the dignity she deserves. Whimsical and eerie in equal measure, the Wraith Rabbit Head Bag is exactly as unsettling as she looks — and twice as soft.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-frankenbuns-monster-plush-stuffed-animal', 'Frankenbun''s Monster

Assembled with great care from the coziest scraps of other rabbits — the softest ear here, the squishiest belly there — Frankenbun''s Monster is, against all odds, a masterpiece. All he really wants is to be held, to be understood, and to loudly announce his feelings at 7am because someone three blocks over left their television on and frankly that is unacceptable.

AAAAA. [Aggressive Thumping]')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-werebun-the-werewolf-bunny-head-bag', 'Werebun Head Bag

When the moon swells full and silver, something stirs. Gray ears rise. Red eyes open. A nose twitches — there are carrots out there somewhere, and they will be found.

The Werebun Head Bag is based on the beloved Werebun Plush Rabbit, and he carries all that same barely-contained energy in a form you can sling over your shoulder. His expression says "approach with caution," but his paws are already open for a hug. Fierce on the outside, devoted cuddle companion within. Once he latches on, he''s yours. There is no escape, and honestly — would you even want one?')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-wraith-bun-plush-stuffed-animal', 'Wraith Bun

A wraith, in the old folklore, is a shadow that outlasts its owner — a spectral echo haunting the places and people it once loved, dark and formless and deeply unsettling to encounter on a Tuesday.

Our Wraith Bun carries the title faithfully, right up until you actually meet her. At which point it becomes clear that she is here for one reason only: soft, unconditional, possibly supernatural cuddles. The ghostly lineage is real. The malevolence is not.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-hyperthyroidism-rabbit-plush-stuffed-animal', 'Hyperthyroidism Rabbit

The thyroid is a small butterfly-shaped gland with outsized influence — it sets the pace for nearly everything your body does. When it produces too much hormone, the whole system gets pushed into overdrive: the heart races, sleep refuses to come, the mind runs faster than it should, and the body burns through itself trying to keep up.

Graves'' Disease, an autoimmune condition in which the immune system turns on the thyroid itself, is one of the most common culprits. This rabbit holds space for everyone living at a speed they didn''t choose — because running that hard, without rest, is its own quiet kind of exhaustion.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('victorian-mcgees-cheshire-cat', 'Victorian McGee''s Cheshire Cat

He arrived without announcement, which is exactly how he prefers it. Striped and grinning, with button eyes that hold the particular gleam of something that knows far more than it lets on, Victorian McGee''s Cheshire Cat Plushie Dreadful is the kind of companion who speaks in questions and disappears mid-answer. His purple silk bow was salvaged, perhaps, from somewhere one ought not ask about. His smile was not.

He is dreadfully charming and charmingly dreadful — a creature of riddles and loyalty in equal measure, the sort of guide you want when the path goes strange and the signposts stop making sense. Keep him close. He knows the way, even when he pretends not to.

He does not arrive alone. His tote bag comes with him: one face bearing his haunting portrait in violet and bone-white, the other whispering "Victorian McGee''s Alice" in baroque script that only reveals itself when the light is right. A plush and a portal, all in one.

Cheshire Cat measures 32cm head to toe. Tote bag measures 40×37cm.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-dyscalculia-rabbit-plush-stuffed-animal', 'Numbers have a way of slipping through the fingers, rearranging themselves when you''re not looking, refusing to cooperate no matter how hard you stare. That''s dyscalculia — a specific learning difference that makes math and number-based tasks genuinely difficult to process. It''s sometimes likened to dyslexia, though where dyslexia shapes how words land, dyscalculia shapes how numbers do.

The path through it is yours alone, but you don''t have to walk it without a companion. Let Dyscalculia Bun come along for the journey.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-arfid-bunny-plush-stuffed-animal', 'Not every meal is simple. For those living with Avoidant/Restrictive Food Intake Disorder (ARFID), eating can be a daily tangle of anxiety, sensory overwhelm, and the quiet exhaustion of being misunderstood. The ARFID Bunny was made to sit with you in that — a soft, undemanding presence that gets it.

A mini bread plush friend attaches via stretchy band and can be removed whenever you like. The bunny''s body zips open to stash whatever small things you want to keep close.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-vasculitis-rabbit-plush-stuffed-animal', 'The Vasculitis Bunny carries the story of the condition in every detail. Halftone patterns across its body echo the rashes that vasculitis can leave behind, while a heart on its chest speaks to the cardiovascular toll — the strain on vessels, the shadow of myocardial complications and hypertension. An alchemy symbol is woven in too, nodding to the profound, difficult transformation of learning to live alongside crushed and inflamed vessels.

This bun was made with heart and with awareness — for everyone navigating vasculitis, and for those who love them.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-headless-bunsman', 'When autumn nights turn cold and the shadows grow long, something comes galloping through the dark — and it''s wearing very long ears. The Headless Bunsman is a legendary rider reimagined in the softest, most huggable form possible: a bunny decked out in a proper equestrian coat, blazing with fiery spirit, and carrying a removable jack-o''-lantern head.

Swap the pumpkin on or pop it off for your own spine-chilling storytelling. Perfect for ghostly bedtime tales and the kind of giggling that keeps you up until midnight.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bunny-lugosi-the-vampire-bunny-plush-stuffed-animal', 'When the sun dips below the horizon, Bunny Lugosi stirs. Cloaked in a sweeping purple cape, twin bite marks adorning the neck, this creature of the night has one singular obsession: the finest, freshest carrot juice the darkness has to offer. Those ice-blue eyes are made for piercing shadows — and, unfortunately, your resolve to stay sensible about plush purchases.

There''s a certain kind of charm that''s impossible to resist, and Bunny Lugosi has it in fangs. Nights spent with this vampiric companion promise spooky snuggles, dramatic flourishes, and the distinct sense that you''ve been claimed. You were warned.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-werebun-the-werewolf-bunny-plush-stuffed-animal', 'When the full moon rises, the Werebun awakens — gray-and-white fur bristling, red eyes gleaming, nose twitching with the irresistible scent of carrots somewhere nearby. It prowls the night with terrible purpose. That purpose, it turns out, is finding the ideal snuggle spot and refusing to leave.

Don''t be misled by the fierce expression. Beneath all that monstrous exterior is an absolutely devoted cuddle companion. Approach with open arms — because once the Werebun has decided you''re its person, escape is simply not on the table.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-grief-rabbit-plush-stuffed-animal', 'Loss settles in like a weight you can''t set down — an anchor on the leg while everything around you keeps moving forward without permission. This soft blue rabbit wears that anchor openly, because grief doesn''t always need to be hidden.

It''s a reminder that sorrow is real and heavy, and that carrying it doesn''t make you broken. It also doesn''t have to be carried completely alone. This bun sits with you in the quiet, in the hard hours, in the in-between — a gentle presence for the personal, winding road through loss.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-hyperlipedema-bunny-plush-stuffed-animal', 'Lipedema is a painful condition involving abnormal fat distribution, concentrated mainly in the legs and lower body — and sometimes spreading further. Even the lightest touch on affected areas can cause real, significant pain. Exercise and dieting don''t respond the way they do for others, and people with lipedema have often spent years absorbing criticism about their bodies from people who don''t understand why those approaches simply don''t work. The emotional weight of that — the depression, the disordered eating, the unsolicited "advice" — is its own kind of heavy.

This plushie exists to offer comfort to those who are living it, and awareness to those who aren''t. Someone else''s body is not yours to comment on. Ever. Full stop. There are so many better things to do with your energy.

Let this bun be a soft reminder that you are seen, and that you are not at fault.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-watermelon-rabbit-plush-stuffed-animal', 'What happens when the bounciest creature in the garden collides with the most refreshing fruit of summer? You get the Watermelon Bun — soft green-and-pink plush fur shaped like a ripe slice of joy, with floppy ears that open up to reveal a flash of red, complete with tiny embroidered seeds.

This bun can lounge in a satisfying round ball form or sit up with ears perked, ready for whatever the day brings. It''s a little whimsical, a little weird, and exactly the right kind of sweet. Whether it ends up on a shelf, in a cuddle pile, or wrapped up as a gift — one thing is certain. This is one in a melon.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit-purple-limited-edition-plush-stuffed-animal', 'Yes, it''s purple. Yes, it''s teal. Yes, it''s limited to 3,000 and that number will never go up. The Anxiety Rabbit Purple Teal Edition is a collector''s piece for people who feel things deeply and want their plush collection to reflect that honestly.

Anxiety is that persistent voice — sometimes a whisper, sometimes a roar — cataloguing every threat, real or imagined. Sometimes it''s too much to carry alone. That''s where the Worry Bunnies come in: two tiny companions ready to receive your whispered worries, which you can then zip safely inside Anxiety Rabbit''s back. Let them sit with those problems, turn them over, look for the cracks where something good might get through. Meanwhile, tell Anxiety Rabbit what you''re grateful for. Not because it erases the hard stuff — it doesn''t — but because it helps. It genuinely does.

The tie-dye pattern on each rabbit''s ears is cut from a large single-dye sheet, so every single one will be slightly different. You are not alone. And your rabbit is one of a kind — just like you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit-yellow-limited-edition-plush-stuffed-animal', 'LIMITED EDITION — YELLOW VERSION

Anxiety is that persistent voice in your head — sometimes a murmur, sometimes a roar — convinced there are threats lurking around every corner. When it gets to be too much to carry alone, you don''t have to. Lean close and tell the Worry Bunnies everything weighing on your heart, then tuck them safely inside Anxiety Rabbit and let the little ones get to work. For the truly enormous fears? Give them until the next Full Moon. You know the moon holds a rabbit — let them think it through, and an answer will come.

One small rule: once the Worry Bunnies are inside after midnight, leave them be. They do their best thinking in the dark, undisturbed. And while they work? Tell Anxiety Rabbit everything you''re grateful for. The hard things don''t vanish — but somehow, counting the good makes both of you breathe a little easier.

Note: Each rabbit''s tie-dye ear pattern is uniquely cut from a single large sheet of fabric, so no two will look exactly the same.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit-blue-limited-edition-plush-stuffed-animal', 'LIMITED EDITION — TEAL VERSION

Everyone carries anxieties — some people are just quieter about it. That hollow, wired feeling of dread that warns you about dangers real and imagined? You''re in very good company.

Anxiety Rabbit is ready to help shoulder the load. That voice in your head — whether a whisper or a shout — is just trying to protect you, but sometimes the warnings pile up faster than anyone can sort through alone. So bring your Worry Bunnies into it. Whisper your troubles to them, zip them snug inside Anxiety Rabbit, and let them puzzle it out. For the really stubborn fears, wait for the Full Moon — the rabbit in the moon has had a long time to get wise, and the Worry Bunnies work best under that light.

Don''t disturb them after midnight, though. They need the quiet hours. And while they''re busy? Fill Anxiety Rabbit in on everything worth being grateful for. The heavy stuff doesn''t disappear, but gratitude gives both of you a little more room to breathe.

Note: Each rabbit''s tie-dye ear pattern is one of a kind — cut from a large sheet of patterned fabric, so yours will differ slightly from any other.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anemia-rabbit-plush-stuffed-animal', 'Anemia — a shortage of healthy red blood cells, or of the hemoglobin they carry — means your body''s tissues don''t get all the oxygen they need. The result? A weariness that settles deep, a pallor that shows up uninvited, and dizzy spells that arrive without warning.

Anemia Rabbit understands those long, wobbly evenings. Dressed in a jaunty blood-cell bow tie and never far from a compress for the dizzy nights, they''re ready to sit with you through the hard stretches and the brighter ones alike. A steadfast little companion for thick and thin.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-hypothyroidism-rabbit-plush-stuffed-animal', 'You''ve kept going — through the bone-deep tiredness, through days when the fog refused to lift, through all the small battles nobody else could see. That kind of persistence deserves to be witnessed.

Enter the Hypothyroid Rabbit: a calm, blue-patterned companion dressed in paisley — a nod to thyroid awareness in every careful stitch. Thoughtfully designed for anyone who knows firsthand what hypothyroidism asks of a person, this bunny doesn''t minimize the struggle. It simply says: I see you, and you are not navigating this alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-allergy-rabbit-plush-stuffed-animal', 'Allergies are the immune system''s overzealous security detail — perfectly ordinary substances triggering a full-scale alarm, whether they drift in on the air, land on your skin, or make it as far as your stomach. Harmless to most, a genuine ordeal for you.

Rather than leaning into the, shall we say, wetter aspects of allergy season, this rabbit went a different direction: a gentle clown aesthetic — red-rimmed eyes, a ruddy nose — because sometimes the only way to survive the endless creams and antihistamines is to find the absurdity in it. All that medicating, all that stuffiness… you may as well be mostly cotton.

And that shared-suffering phenomenon — where you hear someone else sneeze and your own sinuses immediately flare in sympathy? Genuinely unsettling. Allergy Rabbit feels seen.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-psoriasis-rabbit-plush-stuffed-animal', 'Psoriasis goes further than skin. It flares and itches and isolates — and it demands to be explained, over and over, to people who still don''t quite understand.

Psoriasis Rabbit was made to hold that reality without looking away. The red patches on the ears and limbs map the visible flares that are so hard to hide. A sun rests on the chest — phototherapy''s double-edged gift, the light that treats and the light that triggers. Lace at the neck and wrists suggests both the itch of irritation and the habit of covering up; white bands mark the joints where flares love to settle. The charcoal-and-white palette speaks to the gap between how psoriasis looks from the outside and what it costs on the inside.

This bunny isn''t here to fix anything. It''s here to stand beside you — through flares, through fatigue, through the days you''re tired of explaining — and remind you that your story is worth telling, even when your skin has been telling it without your permission.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ulcerative-colitis-rabbit-plush-stuffed-animal', 'Ulcerative colitis is a chronic inflammatory bowel disease — an invisible war fought in the lining of the colon and rectum, where inflammation and ulcers bring pain, urgency, and exhaustion that can be hard to put into words, let alone explain to anyone who hasn''t lived it.

Managing UC takes a particular kind of courage: the daily, unglamorous kind. The kind that gets you through another flare, another appointment, another round of figuring out what your body will tolerate today. Ulcerative Colitis Rabbit is here for all of it — a soft, knowing companion for everyone who understands what it means to keep going when the fight is happening from the inside.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-extra-dreadfuls-mystery-plush-stuffed-animal', 'In the land of Plushie Dreadfuls, not every rabbit emerges from the workshop in perfect condition. Some carry a slight quirk — a seam that wandered, a detail from a stranger dimension — and those are the ones that end up in the Odd Squad. They''re misfits. They''re a little extra dreadful. And honestly? Some of them have extra hearts that are just waiting to be loved.

Each mystery Oddfuls plush is random — yours could be nearly pristine or gloriously peculiar, and it may or may not arrive with a tote bag or the usual accessories. That uncertainty is the whole point. These are final sale — you''re adopting them knowing they''re extra dreadful on purpose.

Beware of imitations. The genuine article comes only from the Mysterious Shop.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-scoliosis-rabbit-plush-stuffed-animal', 'Some of the most demanding journeys are the ones nobody else can see from the outside.

Scoliosis Bunny is a companion for everyone who knows what it means to live with scoliosis or another spinal condition — a soft conversation starter, a small act of visibility for something so often kept quiet. The split ribcage symbol on the chest speaks to spinal misalignment and the resilience it takes to adapt. Alchemy symbols for chalk and hepar calcis honor the deep foundation of bone. And the bunny itself is simply here — soft, present, something to hold on a hard day.

Visibility creates understanding, and understanding builds the kind of community where nobody has to walk this path alone. Every spine, every story, every person deserves to be seen.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-freeze-response-rabbit-plush-stuffed-animal', 'When danger arrives, the nervous system has three options: fight, flee — or go completely, utterly still. The freeze response is that third option, tonic immobility, a state of paralysis that descends when a threat feels too big to face or flee. It isn''t a choice. It''s the body doing exactly what it was built to do.

Freeze Response Rabbit captures that suspended moment — the held breath, the locked limbs, the interior ice. But a companion who understands the freeze is also a small invitation to thaw: to recognize the stillness for what it is, to breathe, and to take the next step forward when you''re ready.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-schizoaffective-disorder-plush-stuffed-animal', 'Schizoaffective disorder lives at the crossroads of two worlds — the fractured reality of schizophrenia and the crashing tides of a mood disorder. It means that delusions, hallucinations, and disorganized thought don''t arrive alone; they bring company. Depending on which type has taken up residence, that company might be the electric mania of bipolar highs, or the heavy grey weight of major depression.

Bipolar type cycles through mania or hypomania alongside psychotic symptoms. Depressive type layers deep sadness and hopelessness over the same terrain. Either way, the mind is navigating more than one storm at once — and that is genuinely hard.

Researchers believe genetics, brain chemistry, and environment all have a hand in it. Treatment tends to be a layered effort too: antipsychotics, mood stabilizers, antidepressants, and therapy, working in concert. You don''t have to weather every storm by yourself.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-depression-rabbit-v2-mohawk-edition-plush-stuffed-animal', 'Depression — clinical depression, major depressive disorder, whatever name you want to give it — is more than feeling sad for a few days. It settles in and stays. It changes the way you think, the way you move through the world, the way small ordinary tasks suddenly feel impossible. It isn''t weakness. You cannot will it away, and you cannot snap out of it any more than you could snap out of a broken bone.

The good news — and there is good news — is that most people do get better. Medication, therapy, or both can genuinely help. The ; symbol on the bag is a quiet testament to that: a semicolon, used where a sentence could have ended but didn''t. It has become a shared emblem of survival and hope for anyone who has ever fought depression, anxiety, addiction, or the many other things that make being human feel unbearable.

You kept going. That matters.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-schizophrenia-rabbit-ii-plush-stuffed-animal', 'Schizophrenia is a serious mental disorder that can reshape the way a person experiences reality — hallucinations, delusions, and deeply disorganized thought can make daily life feel like navigating a world where the rules keep shifting without warning.

Schizophrenia Rabbit II was born out of a collaborative design process: the Plushie Dreadfuls community reached out on Instagram and TikTok, asking people who actually live with schizophrenia to contribute ideas. The result carries those voices in its very stitching. The classic eyes are back — a fan favourite, kept by popular demand — alongside the scribbly heart. This version wears a hoodie and sits in the classic Plushie Dreadful body. The "word salad" buns tucked into the pockets represent intrusive thoughts, small and everywhere at once.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-dyslexia-rabbit-plush-stuffed-animal', 'Dyslexia is one of the most common learning differences there is — the brain just processes written language along a different route. Letters flip, sentences blur into each other, meaning evaporates mid-line. It can make reading and writing feel like solving a puzzle where someone keeps moving the pieces.

But here''s the thing: difficulty with reading isn''t the whole picture. Dyslexia is frequently linked to remarkable strengths in spatial reasoning, mathematics, and creative problem-solving. Audiobooks, dyslexia-friendly fonts, guided reading — these accommodations don''t compensate for a deficit; they just clear the path so the full picture of your mind can show up.

Dyslexia Rabbit gets it. They know the frustration, and they know that frustration tends to make the letters worse. When the words won''t cooperate, give this bunny a squeeze, breathe, and try again — or take a walk and come back fresh. The paragraph will still be there. So will you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-emotional-outburst-rabbit-plush-stuffed-animal', 'Emotional Outburst Bunny carries something a lot of people recognise and fewer people talk about: the way early trauma can rewire the nervous system, leaving emotions without a reliable dimmer switch. Feelings that erupt instead of flow. Reactions that seem too big for the room — except they aren''t too big at all, once you understand where they came from.

Emotional dysregulation isn''t a character flaw. It''s often the imprint left behind when childhood didn''t offer the conditions for healthy emotional learning. The stark black-and-white design reflects that polarised, all-or-nothing experience; the jagged patterns echo the sudden, electric quality of those uncontrollable moments.

The Preserve or Burn symbol on the foot offers a quiet metaphor: what do you do with a painful memory? Hold it? Release it? The answer is rarely clean. The goal isn''t erasure — it''s learning to exist alongside the past in a way that has less power to detonate. Healing is slow, non-linear, and possible.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-emo-moth-rabbit-plush-stuffed-animal', 'Some creatures are drawn to the dark — not because the dark is all there is, but because they know how to find beauty inside it. Emo Moth Rabbit is one of those creatures.

Shrouded in deep navy, wings edged in red and black, eyes that hold whole oceans of feeling — this moth knows what it''s like to feel everything at once and say nothing at all. The fiery tuft blazes quietly on their head, a hint of the intensity that runs underneath the stillness. They''re built for late nights, for introspection, for sitting with complicated feelings without rushing them away.

Emo Moth Rabbit is an exclusive product of Mysterious Design, available only at the Mysterious Shop.', '[{"name":"Emo Moth Matching Tote Bag","key":"emo moth matching tote bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-fawn-response-rabbit-plush-stuffed-animal', 'Fight, flight, freeze — most people have heard of those three. But there''s a fourth response that often goes unnoticed, even mistaken for something else entirely: fawn.

The fawn response shows up when someone — often a person carrying the weight of past trauma — feels threatened and moves toward appeasement rather than resistance or escape. It looks like endless agreeableness. It looks like smoothing things over, deflecting conflict, saying yes when every part of you is screaming no. From the outside, it can read as kindness or calm. From the inside, it''s the quiet erosion of your own needs and boundaries.

Fawn Response Rabbit is a reminder that surviving this way was once a very reasonable strategy. Recognising it is the first step toward something different.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-trust-issues-bunny-plush-stuffed-animal', 'You know what it''s like when the people who were supposed to stay… didn''t. When something broke in a way that made trusting feel less like a choice and more like a gamble you can''t afford to take. Trust Issues Bunny doesn''t ask you to forget any of that. They just sit with you while you figure out what comes next.

The alchemical symbol for glass on their sweater says it plainly: something was shattered, and shattered things are never perfectly restored. But glass can be remelted, reformed, made into something new. The symbols in their ears — phosphorus, salt, lead, arsenic — are the residue of what corroded and weighed heavy, a quiet acknowledgment that the past left marks. Not to define you. Just to say: yes, it happened, and it hurt.

Two paths, two Bunnies. The pink version for those beginning to crack open again, soft steps toward possibility. The grey version for when trust still feels too far away, but you need a companion willing to wait in the silence with you. Whichever one is yours, the message is the same: broken things aren''t worthless. They''re just not finished yet.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-mlm-bunny-plush-stuffed-animal', 'Turquoise fur. A fierce blue mohawk. A green sweater with two little hearts stitched right over where it counts. MLM Gay Bunny arrived ready — ready to be seen, to take up space, to remind anyone who needs it that pride isn''t something to dial down.

This bunny is a celebration of the men who love men, of the whole complicated beautiful spectrum of what that means. They''re not here to explain themselves or audition for acceptance. They''re just here — vivid, soft, and absolutely unbothered.

Whether you keep them on a shelf, carry them to a rally, or gift them to someone who could use a little colour in their world, MLM Gay Bunny is part of the Plushie Dreadfuls family: plushies that represent the full, messy, gorgeous range of what it means to be human.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-fight-response-rabbit-plush-stuffed-animal', 'The fight response is the body''s oldest alarm system — a surge of adrenaline, a tightening in the chest, the sudden certainty that a threat is coming and you need to meet it head-on. In true danger, it can save your life. But for those who have lived through repeated or severe trauma, that alarm can stay stuck in the on position, firing in situations that don''t warrant it — leaving you braced and defensive before anything has even happened.

Fight Response Rabbit is a spunky little reminder that the instinct to stand your ground has its place — and so does the wisdom to know when you can stand down. Sometimes the threat isn''t actually coming. Sometimes you''re allowed to relax. This soft, fierce companion is here to help you tell the difference.', '[{"name":"Sturdy Tote Bag","key":"sturdy tote bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-sickle-cell-anemia-rabbit-plush-stuffed-animal', 'Most red blood cells spend their lives gliding effortlessly through the body — round, flexible, quietly delivering oxygen wherever it''s needed. But for some, those cells arrive shaped differently: rigid crescents that snag and catch, turning the simple act of circulation into an ordeal.

Sickle cell anemia is inherited, written into the blood from birth. The blockages those crescent cells create can bring waves of severe pain, strain organs, and demand a kind of daily resilience that most people will never fully understand. Every person''s experience is its own — some days quieter, some days anything but.

This little rabbit stands in solidarity with everyone who carries that fight in their veins — and with the families who carry it alongside them. You are seen, and you are not navigating this alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-regression-rabbit-plush-stuffed-animal', 'Sometimes, when the weight of the world presses too hard, the mind reaches back — back to earlier days, earlier ways of coping, earlier versions of ourselves that felt a little safer. It''s not weakness. It''s a very old kind of protection, the psyche doing its best with the tools it knows.

Regression is one of the quieter defense mechanisms: stepping backward along the path when moving forward feels impossible. Healing isn''t a straight line, and that''s okay.

Let Regression Bunny curl up beside you on the journey back to yourself. Your inner child deserves a friend too.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-flight-response-rabbit-plush-stuffed-animal', 'Every creature knows it, somewhere deep in the wiring — that electric jolt that says *move, now, go*. The flight response was built for survival, a surge of adrenaline that got our ancestors out of very real danger and onto safer ground.

But what happens when that alarm gets stuck? When the nervous system fires the same desperate signal for a crowded room as it once did for genuine peril? For many who''ve lived through repeated or severe trauma, the body forgets to stand down — and running can feel like the only reasonable answer, even when the threat is only in the echoes.

Meet our dragonfly-themed Flight Response Rabbit — a soft reminder that the urge to flee is real, and valid, and also… sometimes something you can sit with a little longer than you think.', '[{"name":"Sturdy Tote Bag","key":"sturdy tote bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-narcolepsy-plush-stuffed-animal', 'The body has its own clock — but with narcolepsy, that clock keeps its own agenda. No matter how rested the morning feels, the pull toward sleep comes back throughout the day, uninvited and insistent. It''s a chronic neurological condition, not a personality trait, and it asks a quiet kind of strength from everyone who lives with it.

Narcolepsy Rabbit knows something about sudden detours into dreamland. Those star-marked paws have made that unexpected journey more than once — from wide awake to somewhere else entirely, between one breath and the next. The golden fluff, the soft ears, the calming colours: all of it says *rest when you need to, and don''t apologize for it*.

Whether you''re nodding off mid-sentence or just learning what narcolepsy actually means — this little companion is here. Your rhythm is your own. Hop into it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-chronic-fatigue-syndrome-kitty-plush-stuffed-animal', 'Eight hours and you wake up feeling like you only got three. Sixteen, and you''re somehow even further behind. The math never adds up — and for those living with Chronic Fatigue Syndrome (also known as Myalgic Encephalomyelitis, or ME), that relentless exhaustion isn''t laziness or attitude. It''s a complex, debilitating medical reality that doesn''t budge when you push through it — and often gets worse when you try.

Meet Chronic Fatigue Kitty, sporting an eyepatch for the fog of being awake-but-not, and the alchemical symbol for cycle — the 24-hour wheel that keeps spinning whether your body is ready or not.

This little cat gets it. You don''t have to explain yourself here.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-near-death-experience-rabbit-plush-stuffed-animal', 'Some moments leave fingerprints on the mind that never quite wash off. A brush close enough to the edge — a heartbeat between here and not — and the world on the other side looks subtly, permanently different.

Near-death experiences don''t always end when life resumes. The swirling purple and cream of this rabbit echoes what can come after: the intrusive flashbacks, the vertigo, the strange dissociation that makes you wonder, sometimes, if you truly made it back at all. It''s disorienting. It''s real. And it can take a long time to feel solid in your own body again.

This soft companion is here to help you find the ground beneath your feet — to remind you that you are present, you are real, and this moment belongs to you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-latte-lapins-caramel-latte-plush-stuffed-animal', 'Chocolate is wonderful, obviously — but caramel deserves its moment too. Honestly, the safest approach is to simply have both, and avoid the whole dilemma of picking a favourite. (Though if caramel is your favourite, we completely understand. We won''t tell.)')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-latte-lapins-mocha-latte-plush-stuffed-animal', 'Espresso and chocolate, together — is there a more natural alliance in the known universe? (Don''t answer that. Just appreciate it.)

Mocha Lapin is available day or night, rain or shine, with whip or without — and strongly encourages the peppermint variation at least once in your life. When you need a chocolate-laced lift and a long pair of ears to vent to, this one''s got you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-latte-lapins-matcha-latte-plush-stuffed-animal', 'Hear us out — it''s not espresso, but it''s still a latte, and that counts for something.

Matcha Lapin is the pick for those who want all the cosy ritual of a warm drink without quite so much of the caffeine chaos. Earthy, a little grassy, gently sweet — and a very good listener.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-latte-lapins-americano-plush-stuffed-animal', 'Espresso, a splash of very hot water, no fuss. Maybe a blanket. Maybe a book. The Americano school of thought is a dignified one.

Americano Hare doesn''t need to explain itself. On a cold day, when you''d like to close the curtains on the rest of the world and just exist quietly for a bit — this is the companion you reach for.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-dermatillomania-rabbit-plush-stuffed-animal', 'Dermatillomania — sometimes called excoriation disorder — is a body-focused repetitive behavior closely linked to OCD. It shows up differently for everyone: some compulsively pick at perceived imperfections or old wounds; others rub or scratch skin during moments of stress, returning again and again to the same spot without quite meaning to.

This little bun is here to remind you: cuddle first, pick never.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-mushroom-rabbit-lilac-bonnet-plush-stuffed-animal', 'Meet the Fly Agaric''s violet cousin — the Lilac Bonnet mushroom rabbit, twice as purple and every bit as charming. One eye squeezed in a knowing wink, colorful gaze fixed on you, and just a whisper of muscarine tucked inside that adorable cap. They look absolutely delightful. They are absolutely not edible. You have been warned.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-lesbian-bunny-carabiner-edition-plush-stuffed-animal', 'A fresh new look for an old favorite — Lesbian Bunny, redesigned from the ground up. The colors of the lesbian flag run through every detail of this bun, from ears to toes. Clip her anywhere you go with the included carabiner. Loud, proud, and ready to hang.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-depression-rabbit-v2-plush-stuffed-animal', 'Depression isn''t sadness that passes when the sun comes out. It''s a mood disorder — sometimes called major depressive disorder or clinical depression — that reshapes the way you feel, think, and move through the world. Getting out of bed, finishing a thought, caring about things you used to love… all of it can become a weight that no amount of willpower lifts on its own. It isn''t weakness. It isn''t a phase. And you are not expected to just snap out of it.

The good news: most people do find relief — through medication, therapy, or both. Treatment takes time, but it works.

The semicolon on the tote is no accident. It''s borrowed from The Semicolon Project — a symbol adopted by those who''ve faced depression, anxiety, addiction, and other mental health struggles. A semicolon is where a sentence could have ended but didn''t. You are still being written.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-7-deadly-sins-mystery-plush-stuffed-animal', 'Can''t decide what kind of chaos to bring to your day? Let the universe — or at least seven very small bunnies — decide for you. Shake up the drawstring bag, reach in, and pull out your destiny: Pride, Lust, Envy, Wrath, Gluttony, Sloth, or Greed. Whatever you draw, you''re probably already halfway there.

This set is your soft, plushable divination tool for every life question that really deserves a dramatic answer. Cheat day or salad? Ask your crush out or flee the country? The buns know. The buns always know.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-peach-rabbit-plush-stuffed-animal', 'Soft-hued, sun-warmed, and utterly at peace — Peach Bun arrived straight from the cottage garden. All blush tones and a perfect little bonnet, this bunny carries the kind of gentle energy that makes you want to make tea, open a window, and let the afternoon just drift by. A natural fit for any cottagecore corner.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-lemon-rabbit-plush-stuffed-animal', 'This bun did not choose the sour life — the sour life chose them, and it shows. Every inch of their tiny face radiates that particular flavor of long-suffering you only earn from a lifetime of being a lemon. Puckered, put-upon, and completely adorable about it. Life gave them lemons. They became the lemon. Respect that.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-shy-rabbit-pink-edition-plush-stuffed-animal', 'There are more of us than you''d think — the ones who prefer their own company, who find solitude restorative rather than lonely. Not everyone who keeps to themselves is struggling, and that''s worth saying out loud.

But Shy Rabbit knows a different kind of quiet. Monday morning arrives with its inevitable small talk, the same questions she''s been asked a hundred times, and still — still — the words come out sideways. Thursday evenings carry their own dread: the hope that no one suggests plans for Friday. The things that keep her up at night aren''t monsters. They''re moments. A question she''ll stumble on. A room full of eyes.

So she retreats into books, video games, the private language of a diary no one else will read. A story can be set down when it becomes too much. Real life doesn''t come with that option. But she''s learning — in her own time, at her own pace — that''s okay too.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-deafness-rabbit-plush-stuffed-animal', 'Silence isn''t the absence of something — it''s a language all its own.

Deafness Rabbit carries that truth in every stitch. Sine waves ripple through the ears, mapping the frequencies of sound in all its forms — present, absent, somewhere in between. Alchemy symbols for air mark a body built for vibration, for the unseen currents that move through and around us. A binaural color split runs down the center: two sides, two experiences, one whole self.

Whether you''re part of the Deaf or Hard of Hearing community, navigating a world designed for hearing people, or simply want to hold space for those who communicate differently — this bun is here. A soft reminder that being heard doesn''t always require a sound.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-tourettes-syndrome-rabbit-plush-stuffed-animal', 'When most people picture Tourette''s Syndrome, they picture loud verbal outbursts — but that''s only a small slice of what the condition looks like. For many people, tics are quieter: a blink that won''t stop, a neck movement that arrives uninvited, hands that have their own agenda. They tend to intensify under stress or exhaustion, and often travel alongside other forms of neurodivergence, including autism.

This little bun wears it on their body. The tummy design pairs opposing symbols to capture the tension of holding tics in — something that takes far more energy than it looks. Lightning bolt motifs trace the neurological misfires underneath, and small stress tears mark the face.

The expression is personal — drawn from the designer''s own experience of Tourette''s — and not meant to represent every form the condition takes. But the feeling behind it? That part is universal. May this buddy find you exactly when you need it most.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-functional-neurological-disorder-rabbit-plush-stuffed-animal', 'Functional Neurological Disorder — FND — is a condition where the brain''s wiring misfires, not because of damage you can see on a scan, but because of how the nervous system is communicating... or not communicating. It shows up differently in every person: tremors, weakness, episodes that look like seizures, numbness, or fog so thick you can''t find your way through a single sentence.

It is real. It is common. And it is so often misunderstood that many people carry it alone for years before anyone believes them. This little rabbit is here to sit with you in that. You are not making it up. Your nervous system is just doing something complicated — and so are you, every single day.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-raspberry-bunny-plush-stuffed-animal', 'Sweet, tart, and just a little wild — say hello to the Raspberry Dreadful. This berry-bright bun has all the charm of a summer bramble and none of the thorns... mostly.

Whether you''re a lifelong fruit fiend or just someone who appreciates a plush with serious snack energy, the Raspberry Dreadful is ready to be your new favorite companion. Bold, colorful, and absolutely irresistible — just like the real thing.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-substance-use-disorder-bunny-plush-stuffed-animal', 'Substance Use Disorder is a medical condition — not a moral failing, not a choice someone makes lightly. It''s a pattern of compulsive use that persists even when the costs are devastating: relationships, health, everything you once held onto. It touches every kind of person, every walk of life, and it rarely travels alone.

Recovery is hard. The road is long and nonlinear, and the world doesn''t always make it easier. This bunny carries the alchemical symbol for "spirits" on their tummy — a quiet acknowledgment of what they know, what they''ve been through, and where they''re trying to go.

You deserve support. This little one is here to offer some.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('autismspectrumrabbit', 'Meet the Autism Spectrum Rabbit — here, unapologetically, in full color. The rainbow infinity symbol rests on their chest like a declaration. The teal patterning along their ears and paws isn''t trying to match anything. It''s just being exactly what it is.

One paw is magnetic. That''s not a small thing. When words go somewhere you can''t reach them, that paw can press close — a gesture that means something without requiring explanation. It can reach out, or hold still, or just rest. Whatever the moment needs.

This bunny doesn''t ask you to tone it down or translate yourself. They take up space honestly and without apology, and they think you should too. Being here, as you are, is more than enough.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-mushroom-rabbit-plush-stuffed-animal', 'You know the old story about tumbling down the rabbit hole... but what if the rabbit was the one who fell, and on the way down managed to bump into every mushroom in Wonderland?

This particular bun appears to have become one with a Fly Agaric — that iconic red-capped, white-spotted mushroom beloved by gnomes, faeries, and anyone with a taste for the deeply, delightfully weird. We can''t say for certain whether gnomes are real. We also can''t say they aren''t. What we can say is: don''t nap inside a fairy ring. Just as a precaution.

Either way, Mushbun is here, fungal and fabulous, and absolutely ready to join your mushroom décor collection.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-insomnia-moth-rabbit-plush-stuffed-animal', 'The lights are still on somewhere, and that''s enough. Sleep isn''t coming tonight — it rarely does — but there''s something almost peaceful about the glow if you stop fighting it.

Insomnia affects roughly 10% of people worldwide at a clinical level: that persistent, exhausting gap between exhaustion and actual rest. This little moth-eared bunny knows that particular brand of 3am loneliness well. They can''t fix the sleeplessness. But they can keep you company through the long, luminous dark.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bunana-rabbit-plush-stuffed-animal', 'Contrary to popular belief, rabbits don''t just dream of carrots — bananas are genuinely one of their favorite treats. So perhaps it was inevitable that one bun would eventually go full banana.

Meet Bunana. Deeply self-conscious about his tiny baby ears, he made a decision: if you can''t grow the ears you want, borrow a peel. Like a hermit crab discovering the perfect shell, he slipped inside those banana-yellow curves and never looked back. Snug, stylish, and very slightly absurd — exactly how he likes it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-blueberry-bunny-plush-stuffed-animal', 'Is there anything more hoppy than a blueberry bunny? The answer is no. We will not be taking questions.

Here''s something to chew on though — rabbits get a bad reputation for nibbling garden edges, but wild rabbits are actually secret ecosystem architects. Their digging turns up nutrient-dense bare soil that rare plants depend on, and brings invertebrates back to places that need them. Chaotic? A little. Actually quite helpful? Deeply yes. Sound like anyone you know?')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-kiwi-rabbit-plush-stuffed-animal', 'Cross a kiwi with a rabbit and what do you get? Something small, fuzzy, surprisingly fierce, and absolutely overflowing with kiwitude.

This little bun has energy to spare and zero apologies about it. Bright, bold, and hopping with personality — the Kiwi Rabbit is here to remind you that the best things in life are small, tangy, and completely impossible to ignore.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-strawbunny-rabbit-plush-stuffed-animal', 'Not a strawberry. Not just a bunny. A Strawbunny — and there''s a difference.

Found growing wild at the edge of somewhere sweet and forested, this little one carries all the charm of a tiny woodland strawberry: unexpected, bright, and just a little magical. Whether you''re a devoted berry collector or you know someone whose whole personality is strawberries, Strawbunny has found the right place to put down roots.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-dyspraxia-rabbit-plush-stuffed-animal', '[Bumbles right into you]

Ah — so sorry! Didn''t mean to! Truly!

[Does it again immediately]

Dyspraxia — also called DCD, or Developmental Coordination Disorder — is a condition that makes coordinating the body''s movements genuinely difficult. It''s not carelessness or a lack of effort; it''s a neurological reality that can touch everything from handwriting to keeping your balance on a perfectly flat floor.

So the next time someone bumps into you, knocks something over, or can''t quite manage the pen the way you''d expect — maybe offer a little grace. They might be navigating the world through the fog of Dyspraxia, and a moment of patience means everything.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-apple-rabbit-plush-stuffed-animal', 'The Pineapple Bun rabbit found his way into so many hearts that it only felt right to bring him a companion — meet his little apple friend, here to round out the fruit basket and keep the vibes thoroughly snack-coded.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-pineapple-rabbit-plush-stuffed-animal', 'Pineapple on pizza is old news — we''ve moved on to a far more pressing philosophical question.

What happens when you cross a bunny with a pineapple? Something a little spiky, a little sweet, and entirely unexpected. Something that looks, perhaps, a little something like this.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-multiple-sclerosis-rabbit-plush-stuffed-animal', 'Multiple sclerosis is a disease of the nervous system — one where the body''s own defenses turn on the myelin that protects nerve fibers, disrupting the signals traveling between brain and body. The result can look entirely different from person to person: vision problems, fatigue, pain, coordination difficulties, or a complex mixture of all of these.

For some, symptoms flare and recede. For others, they settle in and stay. MS doesn''t follow a single script — which makes each person''s experience as individual as they are. Whatever the day looks like, you don''t have to face it alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-maladaptive-daydreaming-rabbit-plush-stuffed-animal', 'Somewhere between here and somewhere else entirely, this little dreamer lives.

Maladaptive Daydreaming is a mental health pattern in which a person becomes deeply absorbed in vivid, elaborate inner worlds — often as a way of coping with difficult circumstances or other conditions. It''s a mind that builds and builds, constructing whole realities while the body stands perfectly still.

The symbols stitched into this plush tell that story: the alchemical sign for Decompose on the right foot, Create on the left, and Compose on the chest — an unstable triad of imagination perpetually pulling itself apart and remaking itself. The astronaut-like mask hints at just how far this traveler goes, all without ever taking a single step. Come home with us, space bunny.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-rheumatoid-arthritis-rabbit-plush-stuffed-animal', 'Meet RA Bunny — soft, huggable, and completely over how much everything hurts.

Rheumatoid Arthritis is an autoimmune condition where the immune system mistakes the lining of your joints for something that needs attacking. Unlike other forms of arthritis, RA tends to be symmetrical — if one side aches, so does the other — and it brings inflammation, relentless pain, and lasting joint damage along for the ride. It''s chronic, it''s unpredictable, and it genuinely, deeply hurts.

The symbol on the chest is the alchemical sign for Hepar Calcis — calcium sulfide — which glows red after exposure to light, the same burning red as inflammation itself. A little reminder that what''s happening inside is real, even when no one can see it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-megalophobia-mouse-plush-stuffed-animal', 'Does standing at the base of a skyscraper make your head spin? Do vast open spaces or enormous statues send a wave of dread washing over you?

That could be Megalophobia — an intense anxiety response triggered by large objects. Tall buildings, massive sculptures, looming mountains… the world can feel overwhelming at scale. And when you''re a little mouse, truly everything is enormous and terrifying. This small friend understands completely.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-crohns-disease-rabbit-plush-stuffed-animal', 'Some things about Crohn''s disease are visible — and some aren''t, though that doesn''t make them any less real.

This little rabbit carries a few of both. Mouth sores, facial rashes, and a small pocket representing an ostomy are all woven into the design, alongside embroidered alchemical symbols for Magnesium and Potassium — a nod to the electrolyte loss and imbalance that so many with Crohn''s know firsthand.

Flare-ups are hard. There''s no other word for it. But there''s no shame in needing something soft to hold onto while you ride one out. This friend is here for exactly that.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-asthma-rabbit-plush-stuffed-animal', 'Breathing is something most people don''t think about — until they can''t.

Asthma is a lung condition that causes the airways to narrow and inflame, turning the simple act of drawing breath into a struggle. Speaking, moving, even mild exertion can become difficult. And when an asthma attack hits, it''s not just uncomfortable — it can be frightening, and sometimes it requires urgent care.

This is the original Asthma Rabbit — a first-edition companion for anyone who knows what it''s like to fight for air.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-narcissistic-personality-disorder-rabbit-plush-stuffed-animal', 'That crown sits a little crooked. The eyes carry something distant — not quite pride, but not quite peace either.

Narcissistic Personality Disorder is often misunderstood. At its surface it can look like arrogance or entitlement — an inflated sense of one''s own importance, a belief that the world is somehow falling short. But underneath that exterior is frequently a much older wound: expectations shaped in childhood, a self built on shaky ground, and a chronic low-grade grief that reality will never match the image.

Many with NPD are working toward recovery — untangling the past that built those patterns and learning to meet themselves honestly. NPD Rabbit''s false crown and faraway expression aren''t a declaration of superiority. They''re a reminder that growth is possible, one difficult day at a time.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-megalomaniac-fox-plush-stuffed-animal', 'Megalomania: that relentless, burning conviction that you are destined for greatness — that power and dominion are yours by right, and the world is simply waiting to fall in line.

The Megalomaniac Fox has decided you belong in their kingdom. It wasn''t really a request — more of a gracious decree, delivered with a dazzling grin. Charm, after all, is their most devastating weapon.

World domination is the dream. But if you offer a hug? They might — just might — accept that instead.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-trichotillomania-rabbit-plush-stuffed-animal', 'Trichotillomania — also called hair-pulling disorder — is the compulsive, irresistible urge to pull out one''s own hair, eyebrows, or lashes. Those who live with trich often carry the weight of it in secret, concealing the evidence with hats, scarves, and wigs while navigating both the physical discomfort and the quiet shame that can come with it.

This rabbit sees you. No explanation needed.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-screen-addict-rabbit-plush-stuffed-animal', 'You said midnight. Then one more video. Then somehow the birds are outside and the sky is doing that pale grey thing it does before sunrise, and you''re still here, phone in hand, eyes dry as dust.

Screen Addict Rabbit knows the feeling intimately. They''re not here to lecture you — they''re here to scroll in your honor while you finally, actually, put the phone face-down and drift off.

Someone has to keep watch. It might as well be them.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ehlers-danlos-hypermobility-type-rabbit-plush-stuffed-animal', 'Ehlers-Danlos Syndrome is a group of inherited connective tissue disorders that can affect skin, joints, and blood vessels in profound ways. hEDS — the hypermobility type — brings with it joints that bend far beyond their intended range, skin that marks and stretches easily, and a body that constantly asks more of you than most people could imagine.

This rabbit was shaped by the community that lives with hEDS every day, designed through Plushie Dreadfuls'' Crowd Design process. It became one of the most anticipated plushies ever — thousands of people signed up just to hear when it arrived.

True to its inspiration, the rabbit itself is extraordinarily poseable: legs and ears thread through the body to create endless configurations — a plush that bends and flexes, just like the bodies it honours.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-pots-rabbit-plush-stuffed-animal', 'Postural orthostatic tachycardia syndrome — POTS — turns the simple act of standing upright into a battle. When the autonomic nervous system misfires, the body''s quiet background work — regulating heart rate, blood pressure, the steady rhythm of just existing — stops being automatic. The result: dizziness, that sudden vertiginous rush, the world tilting the moment you rise.

This rabbit understands what it means when your own body''s autopilot goes offline. They''re here to sit with you through every slow, careful moment.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-dissociation-rabbit-plush-stuffed-animal', 'Time bends. The edges of things go soft. You''re present but also — somehow — somewhere else entirely.

Dissociation is that strange, slippery drift away from yourself: the sense that you''re a spectator in your own life, that hours have passed without you in them, that the world is happening on the other side of frosted glass. It can be frightening. It can be quiet. It can be both at once.

Dissociation Rabbit carries that experience in every detail — a clock face marking time''s uncanny elasticity, glittering disco-ball eyes reflecting the surreal shimmer of derealization, crackled fur tracing the texture of a body that doesn''t quite feel like yours, and long soft ears that invite you back to the here and now through touch. They won''t rush you. They won''t ask you to snap out of it. They''ll simply wait beside you, steady and unhurried, until you find your way back to the moment.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-immunocompromised-rabbit-plush-stuffed-animal', 'Living immunocompromised means moving through a world that wasn''t built with your vulnerability in mind — calculating risks most people never think about, advocating for yourself in spaces that don''t always listen, and carrying on anyway with a quiet, stubborn kind of strength.

The Immunocompromised Rabbit is here for all of it. Not as a cure, not as a fix — but as a soft and steadfast companion who genuinely gets it. A small symbol that resilience and tenderness can occupy the same space.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-endometriosis-rabbit-plush-stuffed-animal', 'Endometriosis happens when tissue similar to the uterine lining takes root outside the uterus — on ovaries, fallopian tubes, the pelvic walls, and sometimes beyond. It brings with it pain that can be relentless and deeply isolating, and because it so often goes unrecognised for years, many people spend a long time suffering without a name for what''s happening to them.

This little rabbit was born from community voices — crowd-designed by people who know this condition from the inside. We hope they bring a measure of comfort on the harder days, and a reminder that you are not navigating this alone.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-pcos-rabbit-plush-stuffed-animal', 'Polycystic ovary syndrome — PCOS — is a hormonal condition in which the ovaries produce elevated levels of androgens, leading to the development of small fluid-filled cysts and a cascade of effects that can touch every part of daily life. It looks different for everyone who carries it.

The PCOS Rabbit was designed with and by people who have firsthand experience with the condition, shaped through Plushie Dreadfuls'' Crowd Design process. Because sometimes the most meaningful designs come from the ones who truly know.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-schizophrenia-rabbit-plush-stuffed-animal', 'Schizophrenia is a serious mental health condition that can alter how a person experiences reality — bringing hallucinations, delusions, and thinking that fragments and scatters in ways that make ordinary functioning profoundly difficult.

The Schizophrenia Rabbit emerged from Plushie Dreadfuls'' Crowd Design process, shaped by community members on Instagram and TikTok who live with the condition and brought their own experiences into the design. The result holds meaning in its details: "word salad" woven into the aesthetic, and small buns tucked inside the head to represent the intrusive thoughts that crowd in uninvited.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('intermittent-explosive-disorder-rabbit-plush-stuffed-animal', 'Something is stirring… this rabbit is still taking shape, waiting in the wings. Sign up to let us know you want to see them come to life.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-antisocial-personality-disorder-rabbit-plush-stuffed-animal', 'Antisocial Personality Disorder is often misunderstood — it isn''t simply shyness or a preference for quiet evenings in. Those who live with this condition face genuine, often exhausting challenges when it comes to forming and holding on to close relationships. Navigating social expectations, rules, and the law can be a constant uphill climb without the right support.

Like so many conditions, this one exists on a spectrum. No two people experience it identically, and the most severe presentations don''t define every story. Early, sustained help makes a real difference.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-lupus-rabbit-plush-stuffed-animal', 'Living with Lupus takes a kind of quiet, relentless courage that most people will never fully see. It is an autoimmune condition — your own body, confused, turning against its tissues. For some, it announces itself as a butterfly-shaped rash across the nose and cheeks. For others it hides entirely, or burrows into the scalp as painful discoid sores, or sets its sights on internal organs instead.

The absence of a visible rash says nothing about how hard a particular body is fighting. The immune system makes its own unpredictable choices, attacking different targets at different times — which makes every Lupus journey its own.

This soft lavender rabbit carries the butterfly symbol on their face in tribute, with the alchemical symbol for Antimony — also known as Wolf — pressed to their chest. A little science, a little symbol, and a whole lot of heart.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('copy-of-plushie-dreadfuls-social-phobia-opossum-plush-stuffed-animal', 'Impeccable taste. Devastating wit. An absolute meltdown at the thought of walking into a crowded room.

Most folks feel a flutter of nerves before a big gathering — that''s human. But for opossums with social phobia, the calculus is different. A small, trusted circle? Manageable. Every new face added to the mix is another opportunity for something to go sideways, to say the wrong thing, to be perceived. And that possibility is enough to make even the most stylish opossum play dead.

This possum carries two tiny babies on their back — one for self-consciousness, one for avoidant personality — because social anxiety rarely travels alone. Maybe caring for something so small and so vulnerable will give you just enough courage to face whatever''s waiting on the other side of that door.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-misophonia-rabbit-plush-stuffed-animal', 'Most people can tune out the ambient noise of the world. For those with Misophonia, that''s simply not on the table. Certain sounds — a slurp, a sniffle, the particular scrape of fabric — don''t just register as annoying. They hit the nervous system like an alarm, triggering a surge of anger, dread, or overwhelm that''s impossible to reason away.

It isn''t oversensitivity. It isn''t rudeness. It''s a very real neurological response that most people around you will never notice — until you grip the table a little too hard.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-adhd-rabbit-plush-stuffed-animal', 'Two different socks. A chaos symbol where other bunnies might have a tidy monogram. A mind that arrived halfway through its own sentence and found something more interesting to think about instead.

The ADHD Rabbit doesn''t move in straight lines — they move in all directions simultaneously, trailing ideas and half-finished thoughts and sudden moments of pure, electric joy. One leg is striped; the other forgot to match. That''s not a flaw. That''s the whole point. This is a brain built for curiosity, for momentum, for finding the unexpected treasure buried in the tangent nobody else followed.

They''re not here to be fixed or quieted or slowed down. They''re here because someone out there needed to see their kind of mind held up like something worth celebrating — bees and all.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bipolar-ii-bunny-plush-stuffed-animal', 'Bipolar disorder isn''t simply moodiness — it''s a complex, layered condition involving extreme emotional swings between highs and lows that go far beyond ordinary feeling. The Mayo Clinic describes it as cycling between emotional highs (mania or hypomania) and depressive lows, and while it''s one of the more commonly diagnosed mood disorders, that familiarity doesn''t make it simple.

Bipolar II specifically involves hypomanic episodes alongside depression — but without the full manic episodes that define Bipolar I. Each person''s experience is its own, shaped by intensity, frequency, and the particular way the spectrum expresses itself in their life.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-non-binary-rabbit-plush-stuffed-animal', 'Meet the non-bunnary bun — and yes, the pun was absolutely intended.

Non-binary folks don''t fit neatly into a single fixed gender category, and they don''t need to. Some days feel closer to one end of the spectrum; some days feel like somewhere entirely their own. Identity isn''t always a destination — sometimes it''s a moving, breathing, glitter-and-leather kind of thing.

With nods to the legacy of glam rock and electronic music, this rabbit is a soft tribute to the non-binary musicians and artists who made it a little easier for everyone to take up exactly the space they needed.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-witch-rabbit-plush-stuffed-animal', 'Not the dramatic poof-and-disappear kind of witch — something earthier than that. More rooted. This rabbit draws from a druidic, naturalistic tradition, connected to cycles and elements rather than stage magic.

A cosmic cape sweeps behind them, elemental symbols mark their feet, and the triple goddess symbol sits on their chest — rendered in green this time, setting them apart from the White Witch Rabbit and giving this version their own distinct spirit.

Highly requested and likely limited. Don''t sleep on it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-adrenal-crisis-plush-stuffed-animal', 'Adrenal insufficiency has been known to medicine since 1855, first recognized as a consequence of tuberculosis. And yet — despite how relentlessly our endocrine systems are pushed and overwhelmed in the modern world — it remains deeply underrecognized. Symptoms are too easily dismissed as stress, or burnout, or anxiety, leaving people undiagnosed until the condition has progressed far enough to cause severe effects, including psychosis that can itself delay proper care.

Adrenal insufficiency means your adrenal glands can no longer produce the hormones needed to switch off the body''s fight-or-flight response. A related and increasingly recognized condition — adrenal fatigue — can mirror these symptoms and prove just as debilitating, even when diagnosis remains difficult to obtain. What these people feel is very real, even when the paperwork doesn''t yet agree.

This rabbit was designed by artists living with primary and secondary adrenal insufficiency. The symbol on their chest is the alchemical sign for Process — milling, grinding, crushing — representing the relentless demand placed on exhausted glands still trying to do the impossible.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-witch-bunny-plush-stuffed-animal', 'Witch? Oh, you mean that like it''s an insult...

Out here, there are no hexes flying — just a deep, quiet connection with the rhythms of the earth. Grounding, centering, being present with the natural world. Some might call that weird.

But honestly? Losing that connection entirely seems far stranger. We''re the weirdos — and we wear it well. As above, so below.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-fibro-bunny-plush-stuffed-animal', 'Fibromyalgia changes the way the nervous system interprets pain — amplifying signals throughout the whole body, sometimes even when there''s no injury to speak of. Specific tender points can make even the gentlest touch feel like too much.

Living with fibromyalgia often means carrying more than just the pain itself. Fatigue, brain fog, anxiety, and depression frequently travel alongside it, piling on in ways that are exhausting to explain.

And yet — so many people spend years, even decades, without a diagnosis, because the condition is so layered and complex. You are believed here.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-cushing-syndrome-bunny-plush-stuffed-animal', 'Cushing''s syndrome happens when your body produces too much cortisol — the stress hormone — over an extended period. It''s a progressive condition that can bring weight gain, crushing fatigue, and dangerously elevated blood pressure.

One of its most recognisable signs? Vivid purple stretch marks, like tiger stripes across the abdomen, born not from living but from the illness itself.

People with Cushing''s are often told to simply lose weight — without understanding that the condition itself is what stands in the way. Piling on stress only makes things worse, and can even be life-threatening. Lead with kindness. Always.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-diabetes-warrior-bunny-plush-stuffed-animal', 'Diabetes is a condition where the body either can''t produce insulin, or can''t use it properly — leaving blood sugar to rise to levels that cause real harm over time. Managing it is a constant, vigilant effort.

Diabetes Bunny has a little backpack built for a blood sugar monitor, and open arms ready for a cuddle when you''re running low. Because people with diabetes are fighting hard every single day, and that deserves to be seen.

(The reading on the backpack is in mmol/L — the designer is Canadian, and honestly, it fits the tiny pack much better that way.)')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-medusa-rabbit-plush-stuffed-animal', 'A word of caution: whatever you do, don''t meet her gaze. One glance and you''ll find yourself very suddenly... very soft... and very permanent.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-disassociative-identity-disorder', 'Dissociative Identity Disorder — once broadly called Multiple Personality Disorder — is now understood as a distinct condition within a cluster of dissociative experiences. It sits alongside OSDD-1A and OSDD-1B, each defined differently, with some systems falling outside any of these categories entirely.

A person with DID develops a "system" — two or more distinct identities that can each take control of the body. These identities may hold separate or shared memories, their own preferences, even their own sense of age or era. DID isn''t simply losing track of time; it''s memory that belongs to specific identities within the system. For some, switching between identities can also cause a loss of physical control, including fainting — something that can be genuinely dangerous.

The symbol on the chest represents multiple personality awareness. The other design details speak to the different systems within.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-epilepsy-rabbit', 'A seizure is a brief disruption in the brain''s normal electrical activity. Epilepsy is diagnosed when someone has experienced two or more seizures that aren''t solely explained by another cause — though those same triggers (low blood sugar, medication changes) can still set them off in someone with epilepsy.

Capturing the full range of seizure experiences in one rabbit isn''t possible — but this design reaches toward the feeling: a brain misfiring, neurons misbehaving, the disorienting confusion in the aftermath, and the deep ache of a postictal headache once it''s over. You''re not alone in that.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-cerberus-rabbit', 'Every realm needs its guardian. But what about the Floof Underworld?

In Greek mythology, Cerberus is the fearsome multi-headed hound who stands watch at the gates of Hades — keeping the living out and the dead very much in.

Cerberus Rabbit has taken up that solemn post at the entrance to the Floof Underworld, armed with maximum softness and a surprisingly effective glare. Rawr.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-lgbtqia', 'Rainbow-bright and endlessly soft, this bunny is here for everyone flying their colours loud and proud. A little piece of Pride to hold onto — through June and far, far beyond.

Whether you''re celebrating yourself, showing up for someone you love, or just need a cuddly reminder that you belong exactly as you are — this one''s for you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-gemini', 'Born between May 21 and June 21, a Gemini is a force of nature in the best and most chaotic possible way.

Charming, adaptable, and genuinely funny — Geminis seem to glide through any room, any situation, any conversation. They want everything, and honestly? They might just deserve it. The catch is that when they''ve seen enough of something — or someone — restlessness arrives fast. Decisions are hard. Consistency is... a journey. But why commit to one thing when the whole world is right there?

Two rabbits, magnetic hands — because a Gemini contains multitudes.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-virgo-rabbit', 'Sharp minds and humble hearts — that''s Virgo in a nutshell. People born under this sign have a gift for seeing through the noise, dissecting problems with quiet precision, and somehow never making you feel small while doing it. No smug, no swagger. Just a very thoughtful rabbit who has Opinions about your life choices.

Ask a Virgo for advice and they will absolutely give it to you — lovingly, constructively, and with a very specific list of everything that led you here. They mean it kindly. They always mean it kindly.

A Virgo is someone born between August 23 – September 22')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-leo-rabbit', 'Bold. Driven. Absolutely going to remind you how driven they are.

Leos carry the energy of the sun — radiant, warm, and occasionally blinding. They show up fully, give everything they''ve got, and yes, they will bring it up again later. That confident roar can read as arrogance from a distance, but get close enough and you''ll find something softer underneath all that mane: a loyal, generous soul who genuinely wants to see the people around them thrive.

A Leo is someone born between July 23 – August 22')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-cancer-rabbit', 'Getting past a Cancerian''s outer shell takes time — and that''s precisely the point. These deeply feeling souls guard their hearts with quiet ferocity, but earn their trust and you''ve made a friend for the long haul. A sassy, devoted, occasionally unpredictable friend, but yours through and through.

A Cancerian is someone born between June 21 – July 22')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-plague-and-war-set', 'The Book of Revelation gave us the Four Horsemen — Death, Famine, War, and Plague — riding out to announce humanity''s final chapter. Grand, terrifying, inevitable. But what about the rest of creation? What about the small, soft, round-eared creatures of the earth?

They get the Bunpocalypse.

Four fuzzy heralds, equally solemn in their purpose, considerably more huggable in their execution. "Then another horse came out, a fiery red one. Its rider was given power to take peace from the earth and to make men slay each other. To him was given a large sword." He was not, however, given the ear flops. Those belong to War Bun.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-sensory-processing-disorder-jellybun', 'Some nervous systems take in the world all at once — every texture, every sound, every flicker of light arriving at full volume simultaneously. It''s not too much. It''s just a different kind of frequency.

The SPD Jellyfish Rabbit was made for exactly that frequency. Part deep-sea creature, part comfort companion, this luminous jelly-bunny hybrid comes with ten sensory tendrils to squeeze, stretch, fidget with, or simply hold when the world gets too loud — or not loud enough. The orange version is wrapped in soft terry fabric for those who crave more sensation; the blue version uses gentle minky for those who need less. Both have minimal embroidery so nothing scratchy sneaks in.

When everything is too bright, too itchy, too overwhelming, or somehow both at once, SPD Jellyfish is here. Squishy. Patient. Never going to tell you to just calm down.', '[{"name":"Sturdy Tote Bag","key":"sturdy tote bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-taurus-rabbit', 'After the fire of Aries burns out, Taurus arrives — slow, deliberate, deeply sensual. This sign takes its time deciding whether to let you in, but once it does? The devotion runs bone-deep. A Taurus will love you fiercely, feed you magnificently, and appreciate every beautiful, physical thing the world has to offer.

Just try not to make them jealous. That green-eyed monster? Very much at home in Taurus country.

A Taurus is someone born between April 20 – May 20')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-goth-boy', 'Before the internet had a word for it, before the aesthetic had a name anyone agreed on, there were just kids in Dallas, Texas — safety pins through their ears, out past dark, running on borrowed attitude and a very specific record collection. Goth Boy Rabbit is that kid. Specifically, he is the plush rabbit incarnation of American McGee''s own teenage years prowling the nighttime streets of Dallas, back when the subculture was a lived thing and not a filter.

No "emo" label. No algorithm. Just the shadows, the pins, and a rabbit who got it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-pisces-rabbit', 'The last of the water signs, and perhaps the most waterlogged of all. Pisces drifts through the world on feeling alone — dreamy, perceptive, endlessly open-hearted. They sense the current shifting long before anyone else does, and then they swim toward the thing that might hurt them anyway, because they''d rather believe in the good.

There is something quietly brave about that, even when it hurts.

A Pisces is someone born between February 19 – March 20')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-aquarius-rabbit', 'No two Aquarians are quite alike — and that''s the whole point. Born under a sign that prizes originality above almost everything else, these water-bearers stand apart from the crowd in ways that vary wildly from one to the next. Fluid and adaptive, they move through the world with an optimism that refuses to be worn down.

Just be careful not to get on their bad side. The current is gentle right up until it isn''t.

An Aquarius is someone born between January 20 – February 18')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-capricorn-rabbit', 'Half goat, half fish, one hundred percent determined — Capricorn is the zodiac''s most enthusiastically peculiar creature, and they wouldn''t have it any other way. Where others see walls, a Capricorn sees a climbing problem. Where others see obstacles, they see the next thing on the list.

They will absolutely grumble about it. They will also absolutely get it done.

A Capricorn is someone born between December 22 – January 19')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-aries-rabbit', 'Angry? Absolutely not. This is simply the face of someone who has places to be and goals to smash.

Aries are driven, forthright, and utterly unstoppable — and this rabbit wears that energy like armour. That look isn''t a glare; it''s pure forward momentum. Just maybe... step aside and let them through. Their patience has limits, and their to-do list does not.

An Aries is someone born between March 21 – April 19.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-pain-in-the-buns-set', 'For everyone who knows what it means to wake up and wage war with your own body — this set is for you. For the fighters. For the ones still hanging on. For those dealt a hand they never asked for.

These tiny buns carry faces that say what words sometimes can''t: that life, honestly, is a pain in the bun. Hold one close. Let it say the thing you''re tired of explaining.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-sagittarius-rabbit', 'A Sagittarius is someone born between November 22 – December 21.

Sagittarius belongs to the Fire Trigon and stands as the final sign of the reproductive trinity — a mutable sign through and through, at home in change and restless without it. These archers are wanderers at heart, driven by an unquenchable hunger to understand the world around them. Freedom isn''t a preference for a Sagittarius; it''s a necessity.

That curiosity makes Sagittarians natural storytellers, vivid creatives, and magnetic entertainers. But fair warning: they did not come here to spare your feelings. Their honesty is legendary — and occasionally devastating. Tread lightly if you''re not ready for the unvarnished truth.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-libra-rabbit', 'Harmony. Balance. Justice. A Libra will pursue all three with the full force of their considerable charm — and if they have to shower you in hugs to get there, so be it.

A Libra is someone born between September 22 – October 23.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-death-and-famine-set', 'The Book of Revelation speaks of the Four Horsemen — harbingers of humanity''s final chapter, riders of War, Famine, Plague, and Death. But what about the animals? Surely the creatures of the earth deserve their own reckoning?

Enter the four fuzzy Bunsmen of the Bunpocalypse. When the third seal breaks, a dark horse rises — its rider bearing scales, a voice measuring out wheat and barley against a day''s labour, sparing the oil and the wine. The end of days, it turns out, is thoroughly adorable.

"When the Lamb opened the third seal, I heard the third living creature say, ''Come!'' I looked, and there before me was a black horse! Its rider was holding a pair of scales in his hand. Then I heard what sounded like a voice among the four living creatures, saying, ''A quart of wheat for a day''s wages, and three quarts of barley for a day''s wages, and do not damage the oil and the wine!''"')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-scorpio-rabbit', 'Don''t mistake the intensity for aggression — though honestly, fair warning.

Scorpios are fierce, fiercely loyal, and brave in ways most signs can only dream of. This rabbit will stand by your side through the darkest of times... and will not hesitate to deliver a firm thwap the moment you go off the rails. It''s love. Mostly.

A Scorpio is someone born between October 23 – November 21.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ace-rabbit', 'A crowd-designed plush rabbit, created by and for fans who are asexual.

Meet the Ace Pride Rabbit — soft grey fur, rich purple accents, and ears lined with hearts that echo the asexual pride flag. Whether you''re celebrating your own identity or wrapping someone you love in something meaningful, this bunny shows up for you. Snuggle-worthy and quietly powerful, it carries a simple message: you belong here, exactly as you are.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bisexual-rabbit', 'A crowd-designed plush rabbit, made by and for fans who are bisexual. A small note: the colours on this restock have shifted slightly from the original — still every bit as vibrant, just a little evolved.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-depression-rabbit', 'The Mayo Clinic describes depression as a mood disorder marked by a persistent heaviness — a sadness and loss of interest that doesn''t lift on its own. Also known as major depressive disorder or clinical depression, it reaches into how you think, how you feel, and how you move through each day. Simple tasks grow enormous. And sometimes the weight of it whispers things that aren''t true.

This isn''t weakness. This isn''t something you can outrun with a better attitude or a good night''s sleep. Depression is real, it is medical, and it often takes time — and real support — to ease. But here is what matters most: most people do find their way through, with medication, therapy, or both.

You are not alone in this.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-migraine-rabbit', 'Migraines don''t just hurt — they steal. They take you out of your own life, away from the people you''d rather be with, leaving you hiding from light and sound while time slips past.

This rabbit gets it. Consider it a soft, slightly grumpy companion for the hours when even existing feels like too much. You are not alone in shaking your fist at migraines.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-borderline-personality-disorder-rabbit', 'BPD wears many faces — the dread of being left behind, a sense of self that shifts like smoke, moods that crash and surge without warning, and impulses that arrive before thought does. Relationships become the centre of everything, yet the very intensity of that need can make them feel impossible to hold.

Here is something worth knowing, though: people with BPD weren''t broken at birth. The research is clear — BPD is most often the echo of profound early trauma, the mind''s attempt to survive chronic neglect, instability, or harm. That constant internal pulling, the swing between self-hatred and desperate longing, is what happens when a young person has to bargain endlessly just to feel safe.

They are not broken. They survived something hard. And that matters.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-love-bear', 'Do Bears Love in the Woods?

Worn soft from years of being held close — that''s not damage, that''s a life well-loved. Some of us arrive already a little threadbare, and that is perfectly fine, because we are still very much worth cuddling.

Of course, every bear worth their honey has an opinion about nearby beehives. Whether or not acting on that opinion is wise… well, that''s between them and the bees.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-love-kitten', 'The feline cousin of the beloved Love Rabbit — just as tender, significantly more dramatic.

Love can leave a scratch or two, and a proper catfight leaves marks that linger. But not all cats and mice are natural enemies — sometimes the chase just becomes a dance, and what starts as instinct blooms into something unexpectedly sweet.

Proof that even the oldest rivalries can end in a cuddle.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-love-frog', 'The old story goes like this: a scorpion asks a frog for a ride across the river, promising not to sting. Halfway across, the scorpion stings anyway — and as they both sink beneath the water, explains simply: it''s just what scorpions do.

Some things can''t be argued with, charmed out of, or loved away. Not because the scorpion is evil, exactly — but because nature doesn''t negotiate. Sometimes the lesson arrives cold and wet and a little late.

"I couldn''t help it," says the scorpion. "It''s my nature."')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-adhd-bat', 'ADHD Bat? Loading… buffering… did something just move over there??

Life with ADHD means the engine is always running — mind racing, body restless, ideas arriving five at once and disappearing just as fast. Day-dreamers and deep-divers, the ones who leap before looking and feel everything at full volume. That thin thread of attention snaps so easily, and discouragement loves to rush in to fill the gap.

But here''s the thing about a mind that moves like that: it''s the same engine that builds worlds, makes unexpected connections, and refuses to settle for boring. ADHD Bat gets it — mismatched socks, lost keys, seventeen open tabs, and all. You are more than welcome here.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('trauma-bunny', 'They started as an attachment — a tiny companion clipped to PTSD Bunny — but somewhere along the way, Trauma Bunny took on a life of its own. They turn up in coat pockets, wedged between sofa cushions, perched on windowsills. Quiet little reminders of the things we carry and the quiet courage it takes to carry them.

Tuck one away close. They''re trying their best out here — and honestly, so are you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-angry-rabbit', 'He gives absolutely zero fluffs. Not a single one. Do not test him.

Fluff around and find out.

Angry Rabbit has collected his share of stitches and emotional scars — more than you could shake a carrot at — and he is not here to pretend otherwise. Nor should he be.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-gender-dysphoria', 'Gender Dysphoria can arrive early or late — the feeling of inhabiting a body that doesn''t quite fit, or watching yourself grow into something that was never quite right. It''s disorienting, exhausting, and at times frightening. And anthropologists and biologists have documented dozens of distinct expressions of human gender across cultures and history, which means the map is far larger than two points suggest.

Gender Dysphoria Rabbit isn''t asking you to have it figured out. Not today, not tomorrow, not on anyone else''s timeline. What they want you to know is that you are not navigating this alone — that not knowing is allowed, that knowing what you want but not yet having it is valid, and that every version of you in the middle of this exploration is worth showing up for.

Your all-gender-inclusive, endlessly patient fuzzy companion is right here.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-mad-cow', 'Mad Cow — Your Personal Stampede Stopper

The world has gotten loud. Tempers run high, patience runs thin, and some days it feels like everyone around you is one traffic jam away from completely losing it. You don''t have to go down with them.

Mad Cow is here for exactly this — squeeze those legs and watch those little arms flap like they''ve got somewhere to be. It''s ridiculous. It''s satisfying. It works. A funny-looking friend with a face that has absolutely Seen Things, full of something like understanding, ready to absorb whatever the day threw at you.

You can''t singlehandedly fix what''s broken out there — but you can keep your own fuse intact. Let the flapping do its job. Mad Cow holds no judgment, asks no questions, and delivers reliable therapeutic silliness on demand.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ptsd-bunny', 'Trauma has a way of pulling the ground out from under you. One moment the world has rules, a logic you can trust — and then something shatters it, and suddenly you''re floating in the aftermath, unsure of what''s solid, what''s safe, who you are without the certainty you didn''t know you were depending on.

Once called Shell Shock, what we now know as PTSD can follow any confrontation with the terrifying and the unthinkable — assault, accident, sudden loss, war, disaster. It touches not only those who lived through it directly, but the people who love them, and the first responders who arrive after. The wound is real. The disorientation is real. And the long road back is not something anyone should have to walk alone.

PTSD Bunny also carries some of what C-PTSD feels like — the chronic, layered kind that grows from prolonged harm. Because of how complex and individual that experience is, there''s a separate line of companions designed around childhood trauma and C-PTSD specifically.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('buns-in-a-bun', 'A bun with buns — because one is never enough. Mama Bun is doing her absolute best, thank you very much. The feet are swollen, the hands won''t warm up, and that scar has been itching all day. She adores her tiny kits with every fibre of her being… but she also hasn''t slept in what feels like centuries.

Could you take them for just five minutes? Please?')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-sleep-paralysis', 'The room is dark. Your eyes are open. Something is hovering above you — something wrong and impossible — and yet your body refuses to respond. You''re caught between worlds: not fully dreaming, not fully here.

Around 8% of people experience sleep paralysis at some point, that terrifying limbo where the mind rouses before the body can follow. Some even sense a creature perched on their chest, watching. Sleep Paralysis Rabbit and his creepy little Spider Bun companion are here to remind you that you''re not alone in the dark — and that even the things that haunt you can be held.', '[{"name":"Spider Bun","key":"spider bun"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-rage-rabbit', 'RAGE. RABBIT.

On the outside: pure fury, teeth bared, done with everything and everyone. But pull the head off Rage Rabbit and you''ll find what''s really underneath — something bruised and bandaged and quietly falling apart. Because anger is never just anger, is it? Sadness, guilt, hurt, shame — these don''t always have a face we''re willing to show the world, so we hand them a mask instead.

Next time the rage rises, try it. Remove the head. Look at what''s hiding inside. That''s the part worth tending to. Once you''ve sat with it, put the head back on — and maybe, just maybe, you''ll feel a little lighter.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-numb-bunny', 'There are seasons when the loudest thing you feel is… nothing. The storm passed, and what it left behind isn''t peace — it''s empty quiet. That particular exhaustion, physical and emotional at once, is something Numb Bunny knows well.

Soft enough to sink into, big enough to use as a pillow, Numb Bunny is here for the days when you''ve simply run out. You don''t have to feel anything right now. Just rest.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-mini-bumps', 'Think of him as a holiday spirit with slightly sharper edges. Scruffy Bumps keeps his own list — not of children, but of every pet who''s ever been mistreated. Cats, dogs, fish, frogs… he''s watching. Treat your furry (or scaly) companions well, or you might find out what happens when he checks that list twice.

This is the mini keychain version of Scruffy Bumps, small enough to carry his quiet judgment with you everywhere.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bipolar-bunny', 'Bipolar disorder involves extreme shifts in mood — from the electric highs of mania or hypomania to the crushing lows of depression. The Mayo Clinic describes it as one of the most prevalent mood disorders, yet it''s anything but simple: its symptoms are intensely personal, varying in severity and shape from one person to the next.

Bipolar Bunny turns inside out — one moment a smiling black plush, the next a frowning white one. Even the bag it arrives in flips between a happy face and a sad one. A small, tangible reminder that both states are real, and that you are more than either of them.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-jealous-rabbit', 'Green with envy? Teal with jealousy? On the surface you present exactly what the world expects — serene, put-together, utterly unbothered. But flip the script and there it is: the simmering storm of feelings you''d rather nobody see.

Envy Rabbit wears two faces — one sweet and composed, one cracked open with jealousy and contempt. No judgment here. We''ve all been on both sides of that head.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-ocd-rabbit', 'Obsessive-Compulsive Disorder is a mental health condition built from two relentless forces: obsessions — those intrusive, unwanted thoughts or urges that arrive uninvited — and compulsions, the repetitive behaviours that follow in an attempt to neutralise them.

OCD is deeply personal, often shaped by trauma or anxiety that accumulates in its own time, and it can co-occur with other forms of neurodivergence like Autism or Tourette''s. This particular OCD Rabbit reflects the designer''s own experience — one window into the condition, not a definition of it.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-anxiety-bunnies-set-of-5', 'The Anxiety Rabbit comes with two little Worry Bunnies tucked inside — but what happens when two isn''t nearly enough? Worries have a habit of multiplying.

Here''s how it works: pluck a Worry Bunny from the pouch. Roll it gently between your thumb and fingers, fix your mind on whatever''s gnawing at you, and whisper three times — "Nibble my worries away." Tuck it back into the pouch before you sleep. Overnight, your tiny bunny will get to work.

Nibble, nibble. Bye-bye, worries.', '[{"name":"5× Worry Bunnies","key":"worry bunnies"},{"name":"Bunny Pouch","key":"bunny pouch"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-ouchie', 'Your body reads like a medical textbook — one long, exhausting chapter after another. The aches, the nausea, the cycles of treatment and waiting and bracing for what comes next. Other people catch glimpses and struggle to believe the half of it. You live it, front to back, every single day.

Somewhere along the way you became an expert in enduring. Not because you chose to, but because you had to. And even on the days when you can barely feel it — there is something quietly extraordinary in the fact that you keep going.

Ouchie is bandaged, a little battered, and entirely familiar with the toll of a body that never quite cooperates. He''s here to be held through the rough stretches, to bear a little of the weight, and to remind you that even the most worn-down among us deserve a soft place to rest.', '[{"name":"Ouchie Canvas Bag","key":"ouchie canvas bag"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore, accessories) values ('plushie-dreadfuls-toto', '"He was a little black dog with long silky hair and small black eyes that twinkled merrily on either side of his funny, wee nose."

After countless seasons wandering the emerald roads of Oz, Toto grew rather envious of those Flying Monkeys and their magnificent wings. So his dear friend the Tin Woodman — whose capacity for kindness is boundless — stitched a magic green heart right to Toto''s chest. They say a gentle rub of that heart can mend even the most bruised of spirits.

Mind yourself, though. This little winged dog has never met a leash he couldn''t outwit, nor a perfectly calm afternoon he couldn''t upend. Where Toto dashes, adventure follows — ready or not. Lace up your shoes.', '[{"name":"Bat Wing Pumpkin Purse","key":"bat wing pumpkin purse"}]'::jsonb)
  on conflict (handle) do update set alt_lore = excluded.alt_lore, accessories = excluded.accessories;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-scruffy-bumps', 'Think of him as a Saint Nick who swapped the gift sack for a set of very sharp claws… and who takes the naughty list considerably more seriously. He keeps a meticulous tally of how every creature is treated — dogs, cats, fish, frogs, the whole lot. Spoil your pets and you''ve nothing to fear. Neglect them, however, and Scruffy Bumps will have a word. Or a scratch.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-goth-rabbit', 'The clock strikes twelve. Wet cobblestones catch the amber gleam of a harvest moon as Goth Rabbit steps out — clove in hand, six-inch stilettos clicking a slow, deliberate rhythm toward the Crystal Palace Bowl. From somewhere inside, Andrew Eldritch''s voice tears through the walls, "This Corrosion" stirring the crowd into a glorious frenzy.

It''s going to be one of those nights. Obviously.

Goth Rabbit arrives fully committed to the aesthetic: permanent midnight eyeliner that never runs, black lace bows adorning her ears, and a corset back laced tight enough to hold all that darkness in. There is more internal corrosion here than most people encounter in a lifetime.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-wolfenswine', 'Tread lightly. And perhaps upgrade your building materials.

When the Big Bad came huffing and puffing down the lane, the little pig had a contingency plan — heavy, angular, and absolutely unforgiving. The wolf never saw it coming.

Somebody''s wearing a very fashionable new coat.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-anxiety-rabbit', 'That voice — small sometimes, enormous at others — is just trying to keep you safe. Anxiety has always meant well, even when the warnings pile up faster than you can sort through them. You don''t have to carry all of it alone.

That''s what the Worry Bunnies are for. Whisper your troubles to them, tuck them away inside Anxiety Rabbit''s zippered body, and let them get to work. For the really stubborn fears, give them until the Full Moon — the rabbit in the moon understands these things — and they will have puzzled out an answer by then. Just don''t disturb them after midnight. They do their best thinking undisturbed.

While you wait, tell Anxiety Rabbit what you''re grateful for. It won''t make the hard things disappear, but it will make right now feel a little lighter — for both of you.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-hammibal-lecter', 'Walk quietly and keep something solid close at hand. Because when that wolf arrives with grand architectural ambitions and a very confident pair of lungs…

BAM. Daddy''s wearing a whole new wardrobe.

Hammibal Lecter comes equipped with a fold-back wolf head hat — practical protection for delicate piggy ears on those bitter winter nights, and a quiet trophy for a pig who does not play games.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

insert into catalog_overrides (handle, alt_lore) values ('plushie-dreadfuls-bearfisted-ripped-bear', 'There is one rule that every creature in The Woods learns, sooner or later — usually sooner: do not throw hands with a Bearfisted Bear.

Because when a Bearfisted Bear connects in the woods, there is no one around to hear you exit the atmosphere.')
  on conflict (handle) do update set alt_lore = excluded.alt_lore;

commit;
