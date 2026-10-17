# Generation prompts

Kept so the brand can be regenerated or extended consistently. Colours: emerald `#047857`, deep forest `#022C22`, amber `#FBBF24`, dark-mode emerald `#34D399`.

## Logo (ChatGPT image generation)

### Main symbol → `logo/source/concept-a-pin-cross.png`
```
Design a minimal, modern logo symbol for "MediLink Rwanda", a healthcare access
platform that helps people in Rwanda find clinics that accept their insurance,
book visits, and follow their place in the queue from their phone.

Concept: a location pin whose inner space forms a simple plus/medical cross.
The pin outline is made of two interlocking rounded strokes that suggest two
links joining together (connection between patients and clinics). Add one very
restrained angular zig-zag detail inspired by Rwandan Imigongo geometric art
along one inner edge.

Style: flat vector, geometric, bold uniform stroke weight, rounded corners,
no gradients, no shadows, no 3D, no texture, no text. It must stay recognizable
at 16×16 pixels.
Colors: emerald green #047857 as the main color, deep forest green #022C22 for
secondary shapes, an optional tiny accent in warm amber #FBBF24.
Canvas: square 1024×1024, plain white or transparent background, symbol centered
with generous padding.
Avoid: red cross on white, stethoscopes, hearts, snakes/caduceus, pills,
photorealism, clip-art look.
```

### Alternatives (replace the "Concept:" paragraph)
- `concept-b-linked-m.png`: "a lowercase 'm' drawn as one continuous rounded line whose two arches overlap like chain links, with a small plus sign in the overlap"
- `concept-c-ticket.png`: "a rounded ticket shape with a plus-sign cut-out and a small clock notch, suggesting 'your turn, on time'"

### Horizontal lockup → `logo/source/logo-horizontal-raw.png`
```
Using the same symbol, create a horizontal logo lockup: symbol on the left,
wordmark "MediLink" on the right in a clean geometric sans-serif similar to
Figtree SemiBold, color #0F172A, with "RWANDA" smaller underneath in emerald
#047857, wide letter-spacing. Flat, white background, 2048×1024, no extra elements.
```
(Final wordmark should be set in Figtree in Figma. AI text can be misspelled.)

### App icon / favicon → `logo/source/app-icon-raw.png`
```
Create a simplified app icon version of this symbol for favicons and phone home
screens: only the pin-with-cross shape, no zig-zag or fine details, thicker
strokes, white symbol on a solid emerald #047857 rounded-square background
(corner radius about 22%). Symbol perfectly centered and occupying only the
central 60% of the canvas (safe zone for Android maskable icons). 1024×1024,
flat, no gradient, no shadow.
```
Dark variant → `app-icon-dark-raw.png`: add "Variant: symbol in #34D399 on background #022C22."

## Hero video (Google Flow)

Style line appended to every shot:
```
Cinematic documentary realism, warm soft morning light, shallow depth of field,
calm and hopeful mood, muted color grade with deep emerald greens and warm golden
highlights, slow smooth camera movement, 16:9. Ambient sound only, no dialogue,
no music. No on-screen text, no logos, no watermarks, no subtitles.
```

| File | Prompt |
|---|---|
| `shot-01-kigali-sunrise.mp4` | Aerial shot slowly pushing forward over the green hills of Kigali, Rwanda, at sunrise; light mist in the valleys, red-roofed houses and modern buildings on the ridges, a few motorcycles on a winding road, the city waking up peacefully. |
| `shot-02-waiting-at-home.mp4` | Inside a modest, tidy home in Kigali in the early morning, an elderly Rwandan woman in a colorful kitenge dress sits relaxed at a wooden table drinking tea. Her smartphone on the table lights up with a soft green notification glow (screen content not readable). She looks at it, smiles, and calmly stands up to leave. Slow dolly-in, warm window light. |
| `shot-03-journey.mp4` | A young Rwandan mother carrying her toddler on her back walks unhurried along a clean, tree-lined street in Kigali toward a small modern health center, morning sun through the trees. Side tracking shot, relaxed pace. |
| `shot-04-arrival-reception.mp4` | A bright, clean, modern Rwandan health center reception with white walls and emerald-green accents. A few patients sit calmly in a spacious waiting area. A wall screen shows large blurred numbers. A friendly nurse in light green scrubs welcomes the mother and child at the reception desk. Slow gimbal move forward. |
| `shot-05-care.mp4` | A Rwandan doctor in a white coat gently examines a smiling child seated on her mother's lap in a bright consultation room, then looks at a tablet and nods reassuringly. Close medium shot, soft natural light. |
| `bg-loop-waiting-area.mp4` | Seamless looping shot of a calm, bright, modern health center waiting area in Rwanda: soft daylight moving slowly across the floor, a few people seated relaxed, plants, emerald-green accents, very subtle camera drift. The left third of the frame is uncluttered and slightly darker to leave space for headline text. Minimal motion so the first and last frames match. |

**Usage note:** the people are AI-generated. Don't present them as real patients or testimonials. Replace them with consented footage from the pilot later.
