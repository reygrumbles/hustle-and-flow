# Hustle & Flow v0.5

Mobile-first freestyle rhyme trainer.

## Current build

- WRITE / RANDOM / CYPHER / DUAL CYPHER
- 30 / 60 / 90 second cypher timing
- Dual Cypher lane B starts at +15 seconds
- Full-screen Focus mode starts automatically for timed modes
- One full rhyme bank at a time in Dual, with pinned bank switching
- Perfect / near / both rhyme banks (Both default)
- Datamuse full-bank lookup (up to 1,000 per query type)
- **One-tap microphone recording in Focus mode**
- **Automatic offline vocal polish after STOP**
  - high-pass cleanup
  - mud reduction / presence / air EQ
  - compression
  - peak normalization + soft limiting
  - conservative tonal pitch guard on stable pitched notes
  - raw take preserved for A/B comparison
  - polished WAV export

## Recording note

The pitch guard is intentionally conservative in this prototype: it corrects stable tonal sections while fast-changing speech/rap is left mostly untouched. This avoids forcing ordinary rap delivery onto musical notes.
