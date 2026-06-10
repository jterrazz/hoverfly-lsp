# Authoritative Templating Spec — Hoverfly Response Templating (gaps B2, B3, C10)

> Primary-source verification against `SpectoLabs/hoverfly@master` Go source, the SpectoLabs raymond
> fork (`SpectoLabs/raymond`), and the pinned `brianvoe/gofakeit/v6 v6.28.0`. Every claim below is
> backed by a verbatim source excerpt + permalink. Docs are used only to corroborate, never as the
> source of truth.
>
> Engine: **`github.com/SpectoLabs/raymond`** pinned at `v2.0.3-0.20240827093205-07f3a7bebd7d+incompatible`
> (a Handlebars implementation; a SpectoLabs fork of `aymerick/raymond`). Go toolchain `1.26.4`.
> Templating runs on a response body only when `response.templated == true`; helper names are also
> used in `data.variables[].function`.

Raw URL pattern: `https://raw.githubusercontent.com/SpectoLabs/hoverfly/master/<path>`

Source files inspected:

- `core/templating/templating.go` — engine, `helperMethodMap` registration, `TemplatingData`/`Request` structs.
- `core/templating/template_helpers.go` — all helper implementations.
- `core/templating/parse_duration.go` — the `now` offset parser (`ParseDuration`).
- `core/util/util.go` — `FetchFromRequestBody`, `jsonPath`, `xPath` (the `Request.Body` / jsonpath / xpath engine).
- `go.mod` — dependency pins.
- `SpectoLabs/raymond` `helper.go` + `data_frame.go` — built-in (block) helpers and `@data` vars.
- `brianvoe/gofakeit@v6.28.0` — `*Faker` method set (the valid `{{faker 'X'}}` names).

---

## 0. TL;DR for the LSP

1. **52 Hoverfly helpers** registered in `helperMethodMap` (the §1 table) — confirms the count in
   `02-hoverfly-source-truth.md`. PLUS **8 raymond built-ins** (`if`, `unless`, `with`, `each`,
   `first`, `log`, `lookup`, `equal`) that are NOT in that map but ARE valid in templates — the prior
   report missed these as autocomplete/validation targets (§4). So the LSP keyword universe is **60**
   helper names, but only the **52** Hoverfly ones are valid in `variables[].function`.
2. **`now` offset units** (from `parse_duration.go`'s `unitMap`): `ns, us, µs, μs, ms, s, m, h, d, y`
   with optional leading `+`/`-` and fractional values. **`w` (week) is NOT supported.** `d`=24h,
   `y`=365d. Invalid offsets are silently ignored (time unchanged). (§2)
3. **`faker`** dispatches by reflection: `reflect.ValueOf(t.fakerSource).MethodByName(fakerType).Call([]reflect.Value{})`
   over a `*gofakeit.Faker`. Valid `{{faker 'X'}}` names = the **210 zero-argument exported methods**
   on `*gofakeit.Faker` in v6.28.0 (full list in §3). Anything else renders empty.
4. **Grammar:** Hoverfly exercises real Handlebars block helpers (`#each`, `#if`/`#unless`,
   `#equal ... {{else}} ... {{/equal}}`), **subexpressions** `(helper 'a' 'b')`, `@index/@first/@last/@key`,
   `this`/`this.field`, and dotted paths (`Request.QueryParam.x`, `State.y`). **Recommendation: a
   real (nested, block-aware) Handlebars parser, not a flat tokenizer** (§5).
5. **`Request.Body 'jsonpath' '$.x'`** is a **method call on the `Request.Body` field** (a Go func
   field), not a path lookup — same engine as the `journal`/`jsonFromJWT` helpers. queryType is one of
   `jsonpath`, `xpath`, `jsonpathfromxml`. JSONPath = **`k8s.io/client-go/util/jsonpath`** (kubectl
   dialect — composite `{range}`, `{.field}`, filters; NOT Jayway/RFC9535). XPath = **`ChrisTrenkamp/xsel`**.
   XML→JSON via `SpectoLabs/goxml2json`. (§6)

---

## 1. Complete helper signature / arity table (the 52 Hoverfly helpers)

VERBATIM registration block (`core/templating/templating.go`, `NewEnrichedTemplator`):

```go
helperMethodMap["now"] = t.nowHelper
helperMethodMap["randomString"] = t.randomString
helperMethodMap["randomStringLength"] = t.randomStringLength
helperMethodMap["randomBoolean"] = t.randomBoolean
helperMethodMap["randomInteger"] = t.randomInteger
helperMethodMap["randomIntegerRange"] = t.randomIntegerRange
helperMethodMap["randomFloat"] = t.randomFloat
helperMethodMap["randomFloatRange"] = t.randomFloatRange
helperMethodMap["randomEmail"] = t.randomEmail
helperMethodMap["randomIPv4"] = t.randomIPv4
helperMethodMap["randomIPv6"] = t.randomIPv6
helperMethodMap["randomUuid"] = t.randomUuid
helperMethodMap["replace"] = t.replace
helperMethodMap["split"] = t.split
helperMethodMap["concat"] = t.concat
helperMethodMap["length"] = t.length
helperMethodMap["substring"] = t.substring
helperMethodMap["rightmostCharacters"] = t.rightmostCharacters
helperMethodMap["isNumeric"] = t.isNumeric
helperMethodMap["isAlphanumeric"] = t.isAlphanumeric
helperMethodMap["isBool"] = t.isBool
helperMethodMap["isGreaterThan"] = t.isGreaterThan
helperMethodMap["isGreaterThanOrEqual"] = t.isGreaterThanOrEqual
helperMethodMap["isLessThan"] = t.isLessThan
helperMethodMap["isLessThanOrEqual"] = t.isLessThanOrEqual
helperMethodMap["isBetween"] = t.isBetween
helperMethodMap["matchesRegex"] = t.matchesRegex
helperMethodMap["faker"] = t.faker
helperMethodMap["requestBody"] = t.requestBody
helperMethodMap["csv"] = t.fetchSingleFieldCsv
helperMethodMap["csvMatchingRows"] = t.fetchMatchingRowsCsv
helperMethodMap["csvAsArray"] = t.csvAsArray
helperMethodMap["csvAsMap"] = t.csvAsMap
helperMethodMap["csvAddRow"] = t.csvAddRow
helperMethodMap["csvDeleteRows"] = t.csvDeleteRows
helperMethodMap["csvCountRows"] = t.csvCountRows
helperMethodMap["csvSqlCommand"] = t.csvSqlCommand
helperMethodMap["journal"] = t.parseJournalBasedOnIndex
helperMethodMap["hasJournalKey"] = t.hasJournalKey
helperMethodMap["setStatusCode"] = t.setStatusCode
helperMethodMap["setHeader"] = t.setHeader
helperMethodMap["sum"] = t.sum
helperMethodMap["add"] = t.add
helperMethodMap["subtract"] = t.subtract
helperMethodMap["multiply"] = t.multiply
helperMethodMap["divide"] = t.divide
helperMethodMap["initArray"] = t.initArray
helperMethodMap["addToArray"] = t.addToArray
helperMethodMap["getArray"] = t.getArray
helperMethodMap["putValue"] = t.putValue
helperMethodMap["getValue"] = t.getValue
helperMethodMap["jsonFromJWT"] = t.jsonFromJWT
```

Permalink: `…/master/core/templating/templating.go`

**Count = 52. Confirmed identical to `02-hoverfly-source-truth.md` §4.1.** No additions/removals on
master.

### Signature/arity table

Arities are derived from the Go function signatures in `template_helpers.go` (verbatim bodies were
read). Notes:

- A trailing `*raymond.Options` parameter is **supplied by raymond automatically** — it is NOT a
  user-typed argument. Helpers that take it can be used as inline OR can read render context (Kvs,
  InternalVars, Request).
- raymond does NOT enforce arity at call time the way a typed language would: passing too few/too many
  positional args generally yields runtime errors or empty output, not a compile error. The LSP should
  treat these arities as the _intended_ contract for diagnostics/signature-help (warn, not hard-fail,
  on mismatch).
- All these helpers are **inline** (they return a value). None are block helpers. Block helpers come
  from raymond (§4).
- Most args are passed as **strings** (helpers parse them); a few are typed `int`/`float64`/`bool`
  (raymond coerces, and `callHelper` in `getVariables` reflects on the Go kind — see §1.1).

| Helper                 | Go signature (excl. auto `options`)                                                      | Args (count / type)        | Returns                | Inline/Block                | Example                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------- | -------------------------- | ---------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| `now`                  | `nowHelper(offset, format string)`                                                       | 2 opt strings              | string                 | inline                      | `{{now '' ''}}` / `{{now '-1d' 'unix'}}`                                         |
| `randomString`         | `()`                                                                                     | 0                          | string                 | inline                      | `{{randomString}}`                                                               |
| `randomStringLength`   | `(length int)`                                                                           | 1 int                      | string                 | inline                      | `{{randomStringLength 10}}`                                                      |
| `randomBoolean`        | `()`                                                                                     | 0                          | string("true"/"false") | inline                      | `{{randomBoolean}}`                                                              |
| `randomInteger`        | `()`                                                                                     | 0                          | string                 | inline                      | `{{randomInteger}}`                                                              |
| `randomIntegerRange`   | `(min, max int)`                                                                         | 2 int                      | string                 | inline                      | `{{randomIntegerRange 1 10}}`                                                    |
| `randomFloat`          | `()`                                                                                     | 0                          | string                 | inline                      | `{{randomFloat}}`                                                                |
| `randomFloatRange`     | `(min, max float64)`                                                                     | 2 float                    | string                 | inline                      | `{{randomFloatRange 1.0 2.0}}`                                                   |
| `randomEmail`          | `()`                                                                                     | 0                          | string                 | inline                      | `{{randomEmail}}`                                                                |
| `randomIPv4`           | `()`                                                                                     | 0                          | string                 | inline                      | `{{randomIPv4}}`                                                                 |
| `randomIPv6`           | `()`                                                                                     | 0                          | string                 | inline                      | `{{randomIPv6}}`                                                                 |
| `randomUuid`           | `()`                                                                                     | 0                          | string                 | inline                      | `{{randomUuid}}`                                                                 |
| `replace`              | `(target, oldValue, newValue string)`                                                    | 3 string                   | string                 | inline                      | `{{replace (Request.Body 'jsonpath' '$.x') 'a' 'b'}}`                            |
| `split`                | `(target, separator string)`                                                             | 2 string                   | []string               | inline                      | `{{split 'a,b,c' ','}}`                                                          |
| `concat`               | `(args ...interface{})`                                                                  | **variadic**               | string                 | inline                      | `{{concat 'a' 'b' (getArray 'x')}}`                                              |
| `length`               | `(stringToCheck string)`                                                                 | 1 string                   | string(int)            | inline                      | `{{length 'hello'}}`                                                             |
| `substring`            | `(str, startStr, endStr string)`                                                         | 3 string (ints-as-strings) | string                 | inline                      | `{{substring 'hello' '0' '2'}}`                                                  |
| `rightmostCharacters`  | `(str, countStr string)`                                                                 | 2 string                   | string                 | inline                      | `{{rightmostCharacters '12345' '2'}}`                                            |
| `isNumeric`            | `(stringToCheck string)`                                                                 | 1 string                   | bool                   | inline (use w/ `#if`)       | `{{#if (isNumeric x)}}…{{/if}}`                                                  |
| `isAlphanumeric`       | `(s string)`                                                                             | 1 string                   | bool                   | inline                      | `{{isAlphanumeric x}}`                                                           |
| `isBool`               | `(s string)`                                                                             | 1 string                   | bool                   | inline                      | `{{isBool x}}`                                                                   |
| `isGreaterThan`        | `(value1, value2 string)`                                                                | 2 string                   | bool                   | inline                      | `{{#if (isGreaterThan a b)}}…{{/if}}`                                            |
| `isGreaterThanOrEqual` | `(value1, value2 string)`                                                                | 2 string                   | bool                   | inline                      | —                                                                                |
| `isLessThan`           | `(value1, value2 string)`                                                                | 2 string                   | bool                   | inline                      | —                                                                                |
| `isLessThanOrEqual`    | `(value1, value2 string)`                                                                | 2 string                   | bool                   | inline                      | —                                                                                |
| `isBetween`            | `(value, min, max string)`                                                               | 3 string                   | bool                   | inline                      | `{{isBetween x '1' '10'}}`                                                       |
| `matchesRegex`         | `(valueToCheck, pattern string)`                                                         | 2 string                   | bool                   | inline                      | `{{matchesRegex x '^\\d+$'}}`                                                    |
| `faker`                | `(fakerType string) []reflect.Value`                                                     | 1 string                   | dynamic                | inline                      | `{{faker 'Name'}}`                                                               |
| `requestBody`          | `(queryType, query string)` (+auto options)                                              | 2 string                   | interface{}            | inline                      | `{{requestBody 'jsonpath' '$.x'}}`                                               |
| `csv`                  | `(dataSourceName, searchFieldName, searchFieldValue, returnFieldName string)` (+options) | 4 string                   | string                 | inline                      | `{{csv 'pets' 'id' '1' 'name'}}`                                                 |
| `csvMatchingRows`      | `(dataSourceName, searchFieldName, searchFieldValue string)`                             | 3 string                   | []RowMap               | inline (iterate w/ `#each`) | `{{#each (csvMatchingRows 'pets' 'category' 'dogs')}}…{{/each}}`                 |
| `csvAsArray`           | `(dataSourceName string)`                                                                | 1 string                   | [][]string             | inline (`#each`)            | `{{#each (csvAsArray 'pets')}}…{{/each}}`                                        |
| `csvAsMap`             | `(dataSourceName string)`                                                                | 1 string                   | []RowMap               | inline (`#each`)            | `{{#each (csvAsMap 'pets')}}{{this.name}}{{/each}}`                              |
| `csvAddRow`            | `(dataSourceName string, newRow []string)`                                               | 2 (string, []string)       | ""                     | inline (side effect)        | `{{csvAddRow 'pets' (split 'a,b' ',')}}`                                         |
| `csvDeleteRows`        | `(dataSourceName, searchFieldName, searchFieldValue string, output bool)`                | 4 (3 string + bool)        | string/""              | inline                      | `{{csvDeleteRows 'pets' 'category' 'cats' true}}`                                |
| `csvCountRows`         | `(dataSourceName string)`                                                                | 1 string                   | string(int)            | inline                      | `{{csvCountRows 'pets'}}`                                                        |
| `csvSqlCommand`        | `(commandString string)`                                                                 | 1 string                   | []RowMap               | inline (`#each`)            | `{{#each (csvSqlCommand "SELECT * FROM pets WHERE category='dogs'")}}…{{/each}}` |
| `journal`              | `(indexName, keyValue, dataSource, queryType, lookupQuery string)` (+options)            | 5 string                   | interface{}            | inline                      | `{{journal 'orderId' '123' 'response' 'jsonpath' '$.status'}}`                   |
| `hasJournalKey`        | `(indexName, keyValue string)`                                                           | 2 string                   | bool                   | inline (`#if`)              | `{{#if (hasJournalKey 'orderId' '123')}}…{{/if}}`                                |
| `setStatusCode`        | `(statusCode string)` (+options)                                                         | 1 string                   | "" (side effect)       | inline                      | `{{setStatusCode '404'}}`                                                        |
| `setHeader`            | `(headerName, headerValue string)` (+options)                                            | 2 string                   | "" (side effect)       | inline                      | `{{setHeader 'X-Foo' 'bar'}}`                                                    |
| `sum`                  | `(numbers []string, format string)`                                                      | 2 ([]string, string)       | string                 | inline                      | `{{sum (getArray 'subtotal') '0.00'}}`                                           |
| `add`                  | `(val1, val2, format string)`                                                            | 3 string                   | string                 | inline                      | `{{add '1' '2' '0.00'}}`                                                         |
| `subtract`             | `(val1, val2, format string)`                                                            | 3 string                   | string                 | inline                      | `{{subtract '5' '2' ''}}`                                                        |
| `multiply`             | `(val1, val2, format string)`                                                            | 3 string                   | string                 | inline                      | `{{multiply (this.price) (this.qty) ''}}`                                        |
| `divide`               | `(val1, val2, format string)`                                                            | 3 string                   | string                 | inline                      | `{{divide '10' '4' '0.00'}}`                                                     |
| `initArray`            | `(key string)` (+options)                                                                | 1 string                   | "" (side effect)       | inline                      | `{{initArray 'subtotal'}}`                                                       |
| `addToArray`           | `(key, value string, output bool)` (+options)                                            | 3 (2 string + bool)        | value/""               | inline                      | `{{addToArray 'subtotal' '5' false}}`                                            |
| `getArray`             | `(key string)` (+options)                                                                | 1 string                   | []string               | inline                      | `{{getArray 'subtotal'}}`                                                        |
| `putValue`             | `(key, value string, output bool)` (+options)                                            | 3 (2 string + bool)        | value/""               | inline                      | `{{putValue 'k' 'v' false}}`                                                     |
| `getValue`             | `(key string)` (+options)                                                                | 1 string                   | string                 | inline                      | `{{getValue 'k'}}`                                                               |
| `jsonFromJWT`          | `(path, token string)`                                                                   | 2 string                   | interface{}            | inline                      | `{{jsonFromJWT '$.payload.sub' (Request.Header.Authorization.[0])}}`             |

#### Important per-helper source facts (verbatim where load-bearing)

- **`now` formats** (verbatim from `nowHelper`): `""` → RFC3339 UTC (`2006-01-02T15:04:05Z07:00`);
  `"unix"` → `now.Unix()` (seconds); `"epoch"` → `now.UnixNano()/1000000` (**milliseconds**, despite
  the name); anything else → treated as a Go time layout `now.UTC().Format(format)`.
  ```go
  if format == "" {
      formatted = now.UTC().Format(defaultDateTimeFormat)
  } else if format == "unix" {
      formatted = strconv.FormatInt(now.Unix(), 10)
  } else if format == "epoch" {
      formatted = strconv.FormatInt(now.UnixNano()/1000000, 10)
  } else {
      formatted = now.UTC().Format(format)
  }
  ```
- **`concat` is variadic** and flattens any `[]interface{}` argument (so it concatenates arrays).
- **`faker` returns `[]reflect.Value`** and is the only helper whose output type is fully dynamic.
- **`setStatusCode` / `setHeader`** mutate `options.InternalVars` (consumed in `RenderTemplate` to
  override `response.Status` / merge `response.Headers`). `setStatusCode` validates `100..599`.
- **`csv*` / `journal` / SQL** are side-effecting / data-source helpers; they require a configured
  CSV datasource or journal — out of scope for static validation but valid names for autocomplete.
- **`isXxx`/`matchesRegex`/`hasJournalKey` return `bool`** → idiomatically wrapped in `#if`/`#unless`.

### 1.1 How `data.variables[].function` calls helpers (arity coercion)

`getVariables` → `callHelper` (`templating.go`) reflects over the helper signature and coerces each
JSON argument by the Go parameter Kind:

```go
function := reflect.ValueOf(t.SupportedMethodMap[variable.Function])
functionType := function.Type()
arguments := make([]reflect.Value, functionType.NumIn())
for i := range arguments {
    if functionType.In(i).Kind() == reflect.String {
        arguments[i] = reflect.ValueOf(parseValidRequestTemplate(variable.Arguments[i].(string), requestDetails))
    } else if functionType.In(i).Kind() == reflect.Int {
        arguments[i] = reflect.ValueOf(int(variable.Arguments[i].(float64)))
    } else if functionType.In(i).Kind() == reflect.Float64 {
        arguments[i] = reflect.ValueOf(variable.Arguments[i].(float64))
    }
}
return function.Call(arguments)[0]
```

LSP consequences for `variables[]`:

- `variable.Function` MUST be one of the 52 names (raymond built-ins like `each`/`if` are NOT usable
  here — only `SupportedMethodMap` is consulted). Validate against the §1 list only.
- `arguments` length should equal the helper's `NumIn()`. String params receive a string (which is
  itself rendered as a sub-template against the request via `parseValidRequestTemplate`), int params
  require a JSON number (cast `float64`→`int`), float params require a JSON number. A type mismatch
  panics and is `recover()`-ed (the variable is simply dropped) — so wrong arg types silently produce
  no variable. The LSP should flag arg count/type mismatches as warnings.
- **Special-case:** `function: "requestBody"` is handled separately (`getDataFromRequestBody`) and
  requires exactly 2 string arguments (`Arguments[0]`=queryType, `Arguments[1]`=query).

---

## 2. The `now` helper offset tokens (AUTHORITATIVE)

Source: `core/templating/parse_duration.go` — `nowHelper` calls `ParseDuration(offset)`. The unit
table (VERBATIM):

```go
var unitMap = map[string]int64{
	"ns": int64(time.Nanosecond),
	"us": int64(time.Microsecond),
	"µs": int64(time.Microsecond), // U+00B5 = micro symbol
	"μs": int64(time.Microsecond), // U+03BC = Greek letter mu
	"ms": int64(time.Millisecond),
	"s":  int64(time.Second),
	"m":  int64(time.Minute),
	"h":  int64(time.Hour),
	"d":  int64(time.Hour * 24),
	"y":  int64(time.Hour * 24 * 365),
}
```

This is Go's stdlib `time.ParseDuration` **extended with `d` and `y`** (the stdlib does NOT support
`d`/`y`). Behavior of `ParseDuration` (verbatim-confirmed):

- **Accepted units:** `ns`, `us` (and Unicode `µs` U+00B5 / `μs` U+03BC), `ms`, `s`, `m`, `h`, `d`
  (=24h), `y` (=365d). **No `w` (week), no `mo`/`M` (month).**
- **Grammar:** `[-+]?([0-9]*(\.[0-9]*)?[a-z]+)+` — optional leading sign, then one or more
  number+unit segments. Concatenation is allowed: `"2h45m"`, `"1d12h"`, `"-1.5h"`, `"300ms"`.
- **Sign:** leading `-` sets `neg` (subtract from now); leading `+` or none = add.
- **Fractions:** `"-1.5h"` is valid (fractional value scaled by unit).
- **Special:** `"0"` (no unit) → zero duration. Empty string → no offset applied (the helper guards
  `if offset != ""`).
- **On error:** `nowHelper` does `if err == nil { now = now.Add(duration) }` — so an unparseable
  offset (e.g. `"cat"`, or `"2w"`) is **silently ignored**; the unmodified `now` is used. Confirmed by
  test `Test_now_withInvalidOffset` (`"cat"` → base time unchanged).

Tested offsets (from `template_helpers_test.go`): `""`, `"1d"`, `"-1d"`, `"cat"` (invalid → ignored).

**LSP recommendation for `now` offsets:**

- Autocomplete/validate offset literals against the regex `^[-+]?(\d+(\.\d+)?(ns|us|µs|μs|ms|s|m|h|d|y))+$`
  or empty string.
- Emit a diagnostic (info/warning, not error — Hoverfly tolerates it) for `w`, `mo`, `M`, or any
  unknown unit, noting it will be silently ignored at render time.
- For the `format` arg, offer `unix`, `epoch`, `""`, plus Go time-layout snippets
  (`2006-01-02`, `15:04:05`, etc.). `epoch` = milliseconds (document this footgun).

---

## 3. The `faker` helper — dispatch + authoritative valid names (gofakeit v6.28.0)

### 3.1 Dependency pin

`go.mod` (verbatim line): `github.com/brianvoe/gofakeit/v6 v6.28.0`. Import in both templating files:
`github.com/brianvoe/gofakeit/v6`. The faker source is created once: `fakerSource: gofakeit.New(0)`
(`*gofakeit.Faker`, deterministic seed 0).

### 3.2 Dispatch mechanism (VERBATIM)

```go
func (t templateHelpers) faker(fakerType string) []reflect.Value {
	if t.fakerSource == nil {
		t.fakerSource = gofakeit.New(0)
	}
	if reflect.ValueOf(t.fakerSource).MethodByName(fakerType).IsValid() {
		return reflect.ValueOf(t.fakerSource).MethodByName(fakerType).Call([]reflect.Value{})
	}
	return []reflect.Value{}
}
```

Key facts:

- It is **reflection over `*gofakeit.Faker` methods by name** (no allow-list map).
- `MethodByName(fakerType)` is **case-sensitive** and matches exported method names exactly
  (`'Name'`, `'Email'`, `'UUID'`, `'CreditCardNumber'`…). Lowercase/typo'd names are invalid.
- It calls with **zero arguments** (`Call([]reflect.Value{})`). Therefore **only zero-argument
  exported methods on `*Faker` are valid faker types.** Methods that require arguments (e.g.
  `Number(min,max)`, `Sentence(n)`, `Password(...)`, `Regex(s)`) will panic on `.Call` with no args;
  the panic is recovered upstream only in the `variables[]` path — in inline rendering it will error.
  So for safety the valid set = **zero-arg `*Faker` methods**.
- If invalid, returns empty `[]reflect.Value` → renders to empty string.

### 3.3 Authoritative list of valid `{{faker 'X'}}` names

Derived by enumerating `func (f *Faker) X() …` zero-arg exported methods across the v6.28.0 source
(`grep -roE 'func \(f \*Faker\) [A-Z][A-Za-z0-9]*\(\)'`). **210 names** (feed directly to autocomplete):

```
AchAccount, AchRouting, Address, Animal, AnimalType, AppAuthor, AppName, AppVersion,
BeerAlcohol, BeerBlg, BeerHop, BeerIbu, BeerMalt, BeerName, BeerStyle, BeerYeast, Bird,
BitcoinAddress, BitcoinPrivateKey, Blurb, Book, BookAuthor, BookGenre, BookTitle, Bool,
Breakfast, BS, BuzzWord, Car, CarFuelType, CarMaker, CarModel, CarTransmissionType, CarType,
Cat, CelebrityActor, CelebrityBusiness, CelebritySport, ChromeUserAgent, City, Color, Company,
CompanySuffix, Contact, Country, CountryAbr, CreditCard, CreditCardCvv, CreditCardExp,
CreditCardType, Currency, CurrencyLong, CurrencyShort, Cusip, Date, Day, Dessert, Digit, Dinner,
Dog, DomainName, DomainSuffix, Drink, Email, Emoji, EmojiAlias, EmojiCategory, EmojiDescription,
EmojiTag, Error, ErrorDatabase, ErrorGRPC, ErrorHTTP, ErrorHTTPClient, ErrorHTTPServer,
ErrorObject, ErrorRuntime, ErrorValidation, FarmAnimal, FileExtension, FileMimeType,
FirefoxUserAgent, FirstName, FlipACoin, Float32, Float64, Fruit, FutureDate, Gamertag, Gender,
HackerAbbreviation, HackerAdjective, HackeringVerb, HackerNoun, HackerPhrase, HackerVerb,
HexColor, HexUint128, HexUint16, HexUint256, HexUint32, HexUint64, HexUint8, Hobby, Hour,
HTTPMethod, HTTPStatusCode, HTTPStatusCodeSimple, HTTPVersion, InputName, Int16, Int32, Int64,
Int8, IPv4Address, IPv6Address, Isin, Job, JobDescriptor, JobLevel, JobTitle, Language,
LanguageAbbreviation, LanguageBCP, LastName, Latitude, Letter, Longitude, LoremIpsumWord, Lunch,
MacAddress, Map, MiddleName, MinecraftAnimal, MinecraftArmorPart, MinecraftArmorTier,
MinecraftBiome, MinecraftDye, MinecraftFood, MinecraftMobBoss, MinecraftMobHostile,
MinecraftMobNeutral, MinecraftMobPassive, MinecraftOre, MinecraftTool, MinecraftVillagerJob,
MinecraftVillagerLevel, MinecraftVillagerStation, MinecraftWeapon, MinecraftWeather,
MinecraftWood, Minute, Month, MonthString, Movie, MovieGenre, MovieName, Name, NamePrefix,
NameSuffix, NanoSecond, NiceColors, OperaUserAgent, PastDate, Person, PetName, Phone,
PhoneFormatted, Product, ProductCategory, ProductDescription, ProductFeature, ProductMaterial,
ProductName, ProductUPC, ProgrammingLanguage, ProgrammingLanguageBest, RGBColor, SafariUserAgent,
SafeColor, School, Second, Slogan, Snack, SSN, State, StateAbr, Street, StreetName, StreetNumber,
StreetPrefix, StreetSuffix, TimeZone, TimeZoneAbv, TimeZoneFull, TimeZoneOffset, TimeZoneRegion,
Uint16, Uint32, Uint64, Uint8, URL, UserAgent, Username, UUID, Vegetable, Vowel, WeekDay, Year, Zip
```

Caveats for LSP authors:

- These are the **zero-arg** methods. gofakeit also has many parameterized methods
  (`Number(min,max)`, `Sentence(wordCount)`, `Password(...)`, `Regex(pattern)`, `Generate(str)`,
  `Lexify`, `Numerify`, etc.) — **do NOT offer those** for `{{faker 'X'}}`; they will panic with the
  zero-arg call. The 210 list is the safe universe.
- Some zero-arg methods return **non-string** types (e.g. `Bool() bool`, `Int64() int64`,
  `Float64() float64`, `Date() time.Time`, `Map() map[string]any`, `Address() *AddressInfo`,
  `Person() *PersonInfo`, `Contact() *ContactInfo`, `CreditCard() *CreditCardInfo`,
  `Job() *JobInfo`). raymond will stringify primitives sensibly but struct-returning ones
  (`Address`, `Person`, `Contact`, `CreditCard`, `Job`, `Map`, `Book`, `Car`, `Product`, `Movie`,
  `Error`, `School`, `Company`?…) render as Go `%v`/`&{…}` — usually not what the author wants. The
  LSP MAY mark struct/non-string returners with an informational hint ("returns a struct; use a
  scalar faker like `Email`/`Name`/`UUID` for a plain value"). This is advisory, not a hard error.
- This list is large by design and feeds autocomplete; it is pinned to v6.28.0. If Hoverfly bumps
  gofakeit, regenerate the list. (Verification command is in §8.)

---

## 4. raymond built-in helpers (the 8 the LSP must ALSO recognise)

These are registered by raymond itself (`SpectoLabs/raymond` `helper.go` `init()`), NOT by Hoverfly,
and are therefore **absent from the 52-helper map** but fully usable in any templated body. VERBATIM:

```go
RegisterHelper("if", ifHelper)
RegisterHelper("unless", unlessHelper)
RegisterHelper("with", withHelper)
RegisterHelper("each", eachHelper)
RegisterHelper("first", firstHelper)
RegisterHelper("log", logHelper)
RegisterHelper("lookup", lookupHelper)
RegisterHelper("equal", equalHelper)
```

| Name     | Kind   | Arity | Notes                                                                                           |
| -------- | ------ | ----- | ----------------------------------------------------------------------------------------------- |
| `if`     | block  | 1     | `{{#if cond}}…{{else}}…{{/if}}` truthiness                                                      |
| `unless` | block  | 1     | inverse of `if`                                                                                 |
| `with`   | block  | 1     | rescopes context to the arg                                                                     |
| `each`   | block  | 1     | iterates arrays/slices/maps/structs; sets `@index/@key/@first/@last` and `this`                 |
| `first`  | block  | 1     | **SpectoLabs fork extra** — renders block only for the first element                            |
| `equal`  | block  | 2     | **SpectoLabs fork extra** — `{{#equal a b}}…{{else}}…{{/equal}}`; compares via `Str(a)==Str(b)` |
| `log`    | inline | 1     | logs, returns ""                                                                                |
| `lookup` | inline | 2     | `{{lookup obj 'field'}}` dynamic property access                                                |

`equalHelper` (verbatim) — string comparison, used heavily by Hoverfly docs:

```go
func equalHelper(a interface{}, b interface{}, options *Options) interface{} {
	if Str(a) == Str(b) {
		return options.Fn()
	}
	return options.Inverse()
}
```

> Standard Handlebars only ships `if/unless/with/each/log/lookup/blockHelperMissing/helperMissing`.
> The SpectoLabs fork **adds `equal` and `first`**. The LSP must special-case these two (e.g. a generic
> Handlebars language server would not know them).

### `@data` variables inside `#each`/`#first` (verbatim, `data_frame.go`)

```go
// newIterDataFrame instanciates a new private data frame with iteration data set (@index, @key, @first, @last)
func (p *DataFrame) newIterDataFrame(length int, i int, key interface{}) *DataFrame {
	result := p.Copy()
	result.Set("index", i)
	result.Set("key", key)
	result.Set("first", i == 0)
	result.Set("last", i == length-1)
	return result
}
```

→ Inside an `#each`/`#first` block these are valid: **`@index`, `@key`, `@first`, `@last`**, plus the
current item as **`this`** (and `this.<field>` for maps/structs/RowMap). Confirmed by the docs idiom
`{{#unless @last}},{{/unless}}` and `{{this.id}}`.

---

## 5. Template grammar the LSP must parse + tokenizer-vs-parser recommendation

### 5.1 Handlebars features Hoverfly actually exercises (from docs + source behavior)

Real-world templates (verbatim from `docs/pages/keyconcepts/templating/`) prove the LSP must handle:

- **Block helpers with bodies and `{{else}}`:**
  ```handlebars
  {{#equal (csvDeleteRows "pets" "category" "cats" true) "0"}}
    {{setStatusCode "404"}}
    {"Message":"Error no cats found"}
  {{else}}
    {{setStatusCode "200"}}
    {"Message":"All cats deleted"}
  {{/equal}}
  ```
- **`#each` over data-source results with `this` / `this.field` / `@last`:**
  ```handlebars
  {{#each (csvAsMap "pets")}}
    { "id":{{this.id}}, "name":"{{this.name}}" }{{#unless @last}},{{/unless}}
  {{/each}}
  ```
- **Nested `#each` with bare `this`:**
  ```handlebars
  {{#each (csvAsArray "pets")}}{{#each this}}{{this}} {{/each}}{{/each}}
  ```
- **Subexpressions (parenthesised helper calls as arguments), arbitrarily nested:**
  ```handlebars
  {{addToArray "subtotal" (multiply (this.price) (this.quantity) "") false}}
  total:
  {{sum (getArray "subtotal") "0.00"}}
  ```
- **The `Request.Body` method-call form inside `#each`:**
  ```handlebars
  {{#each (Request.Body "jsonpath" "$.lineitems.lineitem")}} … {{/each}}
  ```
- **Dotted path expressions / indexed access:** `{{Request.QueryParam.foo}}`,
  `{{Request.QueryParam.foo.[1]}}`, `{{Request.Header.Authorization.[0]}}`,
  `{{Request.Path.[2]}}`, `{{State.someKey}}`, `{{Literals.x}}`, `{{Vars.x}}` (the `TemplatingData`
  fields — see `02-hoverfly-source-truth.md` §4.2).
- **String literal args in single OR double quotes** (`'pets'`, `"SELECT * FROM pets WHERE category = 'dogs'"`),
  number literals, boolean literals (`true`/`false`).
- **`@data` vars:** `@index`, `@key`, `@first`, `@last`.

### 5.2 Recommendation: **real nested parser**, not a flat tokenizer

**Build a proper block-aware Handlebars parser (recursive descent / mustache-AST), not a regex
tokenizer.** Justification grounded in the above:

1. **Block nesting is unbounded and semantically meaningful.** `#each`/`#if`/`#unless`/`#equal`/
   `#with`/`#first` open scopes that must be matched with `{{/name}}` and may contain `{{else}}`.
   A tokenizer cannot validate "unclosed `{{#each}}`" or "mismatched `{{/if}}`", which are the most
   common authoring errors. Only a parser with a block stack gives correct diagnostics, folding
   ranges, and bracket matching.
2. **Subexpressions are recursively nested expressions** (`(multiply (this.price) (this.quantity) '')`).
   These require an expression grammar (balanced parens, argument lists) — exactly what a parser
   provides. Signature-help/argument counting for the §1 arities is only feasible with parsed
   argument nodes.
3. **Scope-sensitive completions.** `this`, `this.<field>`, `@index/@first/@last/@key` are only valid
   inside an `#each`/`#first` block; `{{else}}` only inside a block. Context-correct autocomplete
   requires knowing the enclosing block — i.e. an AST with scope.
4. **Path expressions vs helper calls vs method calls.** `{{Request.Body 'jsonpath' '$.x'}}` (a field
   that is a function), `{{Request.QueryParam.foo}}` (path), `{{faker 'Name'}}` (helper) all look
   superficially similar; disambiguation (and per-form validation) needs structured parsing of the
   leading path + trailing args.

Practical approach: reuse an existing Handlebars/mustache grammar (e.g. a tree-sitter-handlebars
grammar, or port raymond's own lexer+parser structure) and layer Hoverfly-specific semantics on top:
the 52+8 helper names, the `@data` vars, the `TemplatingData` path roots (`Request`, `State`,
`Literals`, `Vars`), and the `now`/`faker`/`requestBody` argument rules. A flat tokenizer is only
acceptable for cheap _highlighting_; for diagnostics/completion/hover the project needs the AST.

One pragmatic note: because templating only applies when `response.templated == true`, the LSP should
parse a response `body` as a Handlebars template **only** in that case (and always for
`variables[].function`/`arguments` which are structured JSON, not embedded templates — though string
args there are themselves mini-templates per `parseValidRequestTemplate`).

---

## 6. `Request.Body 'jsonpath' '$.x'` accessors + jsonpath/xpath libraries

### 6.1 It is a method call on a func-typed field, NOT a path lookup

`TemplatingData.Request.Body` is a Go **function field** (VERBATIM, `templating.go`):

```go
type Request struct {
	QueryParam map[string][]string
	Header     map[string][]string
	Path       []string
	Scheme     string
	Body       func(queryType, query string, options *raymond.Options) interface{}
	FormData   map[string][]string
	body       string   // unexported raw body
	Method     string
	Host       string
}
```

The field is wired to `templateHelpers{}.requestBody`:

```go
func getRequest(requestDetails *models.RequestDetails) Request {
	return Request{ … Body: templateHelpers{}.requestBody, … body: requestDetails.Body, … }
}
```

And `requestBody` (VERBATIM):

```go
func (t templateHelpers) requestBody(queryType, query string, options *raymond.Options) interface{} {
	body := ""
	if toMatch, exists := options.Value("request").(Request); exists {
		body = toMatch.body
	} else {
		journalToMatch := options.Value("Request").(journal.Request)
		body = journalToMatch.BodyStr
	}
	queryType = strings.ToLower(queryType)
	return util.FetchFromRequestBody(queryType, query, body)
}
```

So `{{Request.Body 'jsonpath' '$.x'}}` is raymond invoking the `Body` func field with two string args
(raymond auto-injects `options`). `queryType` is **lowercased**, so `'JsonPath'`/`'JSONPATH'` work.
There is also a top-level helper `requestBody` (same function) → `{{requestBody 'jsonpath' '$.x'}}`
is equivalent. The LSP should treat both forms identically and validate the **2 string args**
(queryType ∈ {`jsonpath`, `xpath`, `jsonpathfromxml`}, query = expression).

### 6.2 Dispatch + libraries (VERBATIM, `core/util/util.go`)

```go
func FetchFromRequestBody(queryType, query, toMatch string) interface{} {
	if queryType == "jsonpath" {
		return jsonPath(query, toMatch)
	} else if queryType == "xpath" {
		return xPath(query, toMatch)
	} else if queryType == "jsonpathfromxml" {
		xmlReader := strings.NewReader(toMatch)
		jsonBytes, err := xj.Convert(xmlReader)
		if err != nil {
			return ""
		}
		return jsonPath(query, jsonBytes.String())
	}
	log.Errorf("Unknown query type \"%s\" for templating Request.Body", queryType)
	return ""
}
```

Accepted `queryType` values: **`jsonpath`, `xpath`, `jsonpathfromxml`** (anything else logs an error,
returns `""`). `jsonpathfromxml` converts XML→JSON first (via `SpectoLabs/goxml2json`) then runs the
JSONPath engine.

The wrappers (VERBATIM):

```go
func jsonPath(query, toMatch string) interface{} {
	query = PrepareJsonPathQuery(query)
	result, err := JsonPathExecution(query, toMatch)
	…
}
func xPath(query, toMatch string) string {
	result, err := XpathExecution(query, toMatch)
	…
}
```

Import block of `util.go` (the load-bearing libs):

```go
"github.com/ChrisTrenkamp/xsel/exec"
"github.com/ChrisTrenkamp/xsel/grammar"
"github.com/ChrisTrenkamp/xsel/parser"
"github.com/ChrisTrenkamp/xsel/store"
"k8s.io/client-go/util/jsonpath"           // JSONPath engine
xj "github.com/SpectoLabs/goxml2json"        // XML -> JSON
"github.com/tdewolff/minify/v2"              // (minification helpers)
```

### 6.3 Library identities + dialect quirks (CRITICAL for the LSP)

**JSONPath = `k8s.io/client-go/util/jsonpath`** (the **kubectl JSONPath** dialect — NOT
Jayway/Goessner-classic, NOT RFC 9535). go.mod pins `k8s.io/client-go v0.35.0`. Dialect quirks the
LSP should account for and document in hover/diagnostics:

- **Leading `$` optional** — kubectl jsonpath treats `{.foo}` and `$.foo` both as valid roots;
  expressions can be wrapped in `{...}`. Hoverfly's `PrepareJsonPathQuery` normalises this (it wraps
  bare expressions in `{}` if needed — confirm exact behavior before tightening diagnostics).
- **`range`/`end`** keywords for iteration (`{range .items[*]}…{end}`) — kubectl-specific.
- **Filters** `?(@.x=="y")` are supported but the syntax/operators differ from Jayway (kubectl uses
  `==`, `<`, `>`, regex via `=~` in newer versions).
- **No script expressions / no `length()` function** the way Jayway has; aggregate behavior differs.
- Recursive descent `..` is supported.
- Large integers: Hoverfly post-processes scientific-notation output (`containScientificNotation` /
  `convertToPlainNotation` in `jsonPath`) to avoid `1e+09`-style results — a kubectl-jsonpath quirk.
- Array results: when the JSONPath yields a JSON array string, `jsonPath` unmarshals it to
  `[]interface{}` so it can be iterated with `{{#each}}`.

  → **LSP guidance:** validate `jsonpath` expressions against the _kubectl_ grammar, not generic
  JSONPath. Be lenient (warn, don't error) since exact engine behavior is hard to replicate; offer
  hover docs linking to kubectl JSONPath. Do NOT assume Jayway functions/filters.

**XPath = `github.com/ChrisTrenkamp/xsel`** (an XPath 1.0/2.0 engine over a custom store/parser; NOT
`antchfx/xpath`, NOT `go-xmlpath`). go.mod has no separate version (it's a direct require —
re-check exact pin in §8). Quirks:

- xsel implements XPath with its own grammar (`xsel/grammar`), executes via `xsel/exec`. Standard
  XPath axes/functions apply; namespace handling and some XPath 2.0 features may differ from libxml2.
- The result is `.String()`-ified (`xPath` returns a string), so node-set results are flattened to a
  string — the LSP should document that `xpath` yields a single string, not an iterable node set
  (unlike `jsonpath`, which can yield arrays for `#each`).

**XML→JSON = `github.com/SpectoLabs/goxml2json`** (`v0.0.0-20240121223617-8e03292c14ea`) — used only by
the `jsonpathfromxml` branch.

> Note: `02-hoverfly-source-truth.md` §3 lists the _matcher_ JSONPath/XPath via the matcher registry;
> the templating `Request.Body` accessors use the **same `util.FetchFromRequestBody`** plumbing, so
> the jsonpath/xpath dialects are identical between matchers and templating. One engine to model.

---

## 7. Net deltas vs `02-hoverfly-source-truth.md`

| Item              | Prior report               | This report (verified)                                                                                         |
| ----------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Helper count      | 52 (map)                   | **Confirmed 52** Hoverfly helpers, verbatim list identical.                                                    |
| raymond built-ins | not enumerated             | **+8** (`if/unless/with/each/first/log/lookup/equal`); `first`+`equal` are SpectoLabs fork extras.             |
| `now` units       | "datetime helper support"  | **Authoritative:** `ns,us,µs,μs,ms,s,m,h,d,y` (NO `w`); sign+fraction; invalid silently ignored; `epoch`=ms.   |
| faker             | "reflection over gofakeit" | **Confirmed reflection over `*gofakeit.Faker` (v6.28.0), zero-arg only → 210 names (full list).**              |
| jsonpath lib      | not pinned                 | **`k8s.io/client-go/util/jsonpath` (kubectl dialect)** — important: NOT Jayway.                                |
| xpath lib         | not pinned                 | **`ChrisTrenkamp/xsel`**; XML→JSON via `SpectoLabs/goxml2json`; queryType also includes `jsonpathfromxml`.     |
| Grammar           | "Handlebars"               | Exercises block helpers + subexpressions + `@data`; **recommend real parser**.                                 |
| `Request.Body`    | "invoked as a function"    | **Confirmed:** func-typed struct field == top-level `requestBody` helper; 2 string args; queryType lowercased. |

---

## 8. Re-verification commands / permalinks

Source (raw, master):

- `…/master/core/templating/templating.go`
- `…/master/core/templating/template_helpers.go`
- `…/master/core/templating/parse_duration.go`
- `…/master/core/util/util.go`
- `…/master/go.mod`
- raymond fork: `https://raw.githubusercontent.com/SpectoLabs/raymond/master/helper.go`,
  `…/raymond/master/data_frame.go`

(`…` = `https://raw.githubusercontent.com/SpectoLabs/hoverfly`)

Regenerate the 210 faker names for a given gofakeit tag (here `v6.28.0`):

```bash
# download each *Faker source file, then:
grep -rhoE 'func \(f \*Faker\) [A-Z][A-Za-z0-9]*\(\)' *.go \
  | sed -E 's/func \(f \*Faker\) ([A-Za-z0-9]+)\(\).*/\1/' | sort -u
# files: address animal app auth beer book car celebrity color company csv emoji error
#        file finance food game generate hacker html image internet json languages lorem
#        minecraft misc movie number payment person product school slice sql string struct
#        template time weighted word  (from https://raw.githubusercontent.com/brianvoe/gofakeit/v6.28.0/<f>.go)
```

Pins captured: Hoverfly `master`; gofakeit `v6.28.0`; raymond `v2.0.3-0.20240827093205-07f3a7bebd7d+incompatible`;
`k8s.io/client-go v0.35.0`; `icrowley/fake v0.0.0-20240710202011-f797eb4a99c0` (powers
`randomEmail/randomIPv4/randomIPv6` — NOT gofakeit); Go `1.26.4`.

### 8.1 Unverified / to double-check by an implementer

- Exact behavior of `PrepareJsonPathQuery`, `JsonPathExecution`, `XpathExecution` bodies (read the
  rest of `util.go` and any `jsonpath`/`xpath` helper files) to pin the precise kubectl-jsonpath
  normalisation and the xsel invocation — I confirmed the dispatch + libraries but not those wrapper
  internals line-by-line.
- The exact `go.mod` version line for `github.com/ChrisTrenkamp/xsel` (listed as a direct require; I
  saw `v0.9.16` in the dependency dump — confirm against go.mod/go.sum before hard-coding).
- Whether any parameterized gofakeit method is _intentionally_ exposed elsewhere (none are reachable
  via `{{faker 'X'}}` given the zero-arg `.Call`, but `variables[]`'s `callHelper` path does NOT
  reach faker specially, so the zero-arg constraint holds everywhere).
