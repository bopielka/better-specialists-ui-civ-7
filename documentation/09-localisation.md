# 09 — Localisation

## Layout

```
text/<locale>/InGameText.xml    every on-screen string   (27 rows)
text/<locale>/ModInfoText.xml   the mod's name and description in the Mods browser (2 rows)
```

Locales shipped — twelve:

```
en_us  de_DE  es_ES  fr_FR  it_IT  ja_JP  ko_KR  pl_PL  pt_BR  ru_RU  zh_Hans_CN  zh_Hant_HK
```

Both files are registered per locale in the `.modinfo`: `InGameText.xml` under `<UpdateText>`
in **both** action groups, `ModInfoText.xml` under `<LocalizedText>`.

⚠️ `en_us` is listed **without** a `locale` attribute (it is the fallback); every other
locale carries `locale="xx_XX"`.

## ⚠️ Two different file shapes

| | `text/en_us/` | every other locale |
|---|---|---|
| Wrapper element | `<EnglishText>` | `<LocalizedText>` |
| Row attribute | `Tag` only | `Tag` **and** `Language="xx_XX"` |

```xml
<!-- en_us -->
<Database><EnglishText>
    <Row Tag="LOC_NAJANE_SPECIALISTS_COMMON_HEADER">
        <Text>Common Specialists Yields</Text>
    </Row>
</EnglishText></Database>

<!-- pl_PL -->
<Database><LocalizedText>
    <Row Tag="LOC_NAJANE_SPECIALISTS_COMMON_HEADER" Language="pl_PL">
        <Text>Wspólne dochody specjalistów</Text>
    </Row>
</LocalizedText></Database>
```

⚠️ Copying an `en_us` row into another locale file without adding `Language=` produces a row
that validates and never displays. `Database.log` is where a genuine XML failure shows up;
this particular mistake is not one, which is what makes it worth stating.

## ⚠️ Ukrainian lives in `ru_RU`

The game has **no Ukrainian locale**, so those strings sit in the Russian one —
`text/ru_RU/InGameText.xml` contains Ukrainian text under `Language="ru_RU"`. This is a
deliberate choice, the same one the sibling Commerce mod makes. **It is not a mislabelled
file — do not "fix" it**, and do not machine-translate over it.

## The twenty-seven keys

Every locale file carries **the same twenty-seven tags** — verified identical across all twelve.
A missing key renders as the raw `LOC_…` tag on screen.

| Key | Used by |
|---|---|
| `LOC_NAJANE_SPECIALISTS_COMMON_HEADER` | the panel's section title (`data-l10n-id`) |
| `LOC_OPTIONS_GROUP_NAJANE_MODS` | ⚠️ the options group heading — **derived from the group id**, not chosen |
| `LOC_OPTIONS_NAJANE_ALWAYS_NEGATIVES` + `_DESCRIPTION` | option |
| `LOC_OPTIONS_NAJANE_ORIGINAL_DEFAULT` + `_DESCRIPTION` | option |
| `LOC_OPTIONS_NAJANE_NO_NEGATIVE_COMMON` + `_DESCRIPTION` | option |
| `LOC_OPTIONS_NAJANE_NO_POSITIVE_COMMON` + `_DESCRIPTION` | option |
| `LOC_OPTIONS_NAJANE_ONLY_NONZERO` + `_DESCRIPTION` | option |
| `LOC_OPTIONS_NAJANE_FULL_ON_HOVER` + `_DESCRIPTION` | option |
| `LOC_NAJANE_SPECIALISTS_KEY_TO_ORIGINAL` | the hint, when the mod's view is on screen |
| `LOC_NAJANE_SPECIALISTS_KEY_TO_DIFF` | the hint, when the game's view is on screen |
| `LOC_NAJANE_SPECIALISTS_KEY_FALLBACK` | the hint when the action is unbound |
| `LOC_INPUT_NAJANE_ALTERNATIVE_VIEW` + `_HELP` | the row in the key-binding screen |
| `LOC_OPTIONS_NAJANE_HIGHEST_FOOD` / `_PRODUCTION` / `_GOLD` / `_SCIENCE` / `_CULTURE` / `_HAPPINESS` / `_INFLUENCE` | the seven per-yield filters |
| `LOC_OPTIONS_NAJANE_HIGHEST_ONLY_DESCRIPTION` | ⚠️ **shared by all seven** — the description differs only in the yield the label already names |

Plus two in `ModInfoText.xml`: `LOC_MOD_NAJANE_SPECIALISTS_NAME` and
`…_DESCRIPTION`.

### The parameterised hint

```xml
<Row Tag="LOC_NAJANE_SPECIALISTS_KEY_TO_ORIGINAL">
    <Text>{1_Key} &#8594; default view</Text>
</Row>
```

⚠️ **`{1_Key}` is filled at runtime with whatever key the player has bound**, so the
placeholder must survive translation. It is composed in code —
`Locale.compose(key, getAlternativeViewKeyLabel())` — because `data-l10n-id` cannot take a
runtime argument. `&#8594;` is the arrow; keep it as an entity.

## ⚠️ Strings that name the wrong key

Several strings still say **"Shift"**, from before the key became a rebindable action
defaulting to **Tab**:

```
text/*/InGameText.xml     LOC_OPTIONS_NAJANE_ORIGINAL_DEFAULT_DESCRIPTION
text/*/ModInfoText.xml    LOC_MOD_NAJANE_SPECIALISTS_DESCRIPTION
```

The repository `README.md` and the code comments in `najane-options.js`
("Invert Shift: …") carry the same staleness. **The hint on screen is correct** — it asks
the engine what is bound — so this is a text problem, not a behaviour one. Fixing it means
twelve files twice over; see [known gaps](11-known-gaps.md).

⚠️ **Do not name a specific key in new strings.** The binding is the player's. Say "the
alternative view key", or compose the label in code.

## ⚠️ Use the game's own yield names

The seven filter labels name a yield, and the game already translates every one of them.
The authoritative source is the game's own text, not a dictionary:

```
<game>/Base/modules/base-standard/text/en_us/YieldsText.xml     LOC_YIELD_<X>_NAME
<game>/Base/modules/base-standard/l10n/<locale>_Text.xml        the same key, translated
```

That is where the wording used here came from — including `Influence` for **`YIELD_DIPLOMACY`**,
and each language's own word for "tile" (Feld, casilla, case, casella, pole, hexágono,
клітинка, 地块, 地塊, タイル, 타일), taken from the mod's existing strings so the new labels
read like the old ones.

⚠️ Several languages store yield names as a **declension table**
(`Żywność|Żywności|Żywności|…` in Polish, the same in Russian and partly in German). Take the
case the sentence needs — the Polish labels use the genitive ("najwięcej **żywności**"), which
is the fourth bar-separated form, not the first.

## In code

```js
label.setAttribute("data-l10n-id", "LOC_NAJANE_SPECIALISTS_COMMON_HEADER");   // static
hint.textContent = Locale.compose("LOC_…_KEY_TO_DIFF", getAlternativeViewKeyLabel());  // parameterised
```

- **Never build a user-visible string by concatenation** where a key with parameters would do.
- ⚠️ **Do not parse a composed string** to get data back out; it breaks in every language
  that words it differently.
- Reuse the game's own keys where the wording already exists —
  `LOC_UI_CONTENT_MGR_SUBTITLE` is used for the shared "Mods" tab title for exactly this
  reason.

## Adding a string — checklist

1. Add the `<Row Tag="…">` to `text/en_us/InGameText.xml`.
2. Add it to **all eleven** other locale files, each with `Language="xx_XX"` inside
   `<LocalizedText>`.
3. Remember `ru_RU` is **Ukrainian**.
4. Check the game does not already have the wording.
5. Compose it with `Locale.compose`, never by concatenation, and never name a key by hand.
6. Deploy — the script verifies every file the `.modinfo` references exists.
7. Check `Database.log` after loading: XML that fails validation is reported there.

A quick parity check before committing:

```bash
for l in text/*/; do printf '%s %s\n' "$(grep -c 'Row Tag' "$l/InGameText.xml")" "$l"; done
```
