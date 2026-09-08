<!-- GENERATED FILE. Do not edit by hand. Run `npm run docs:diagnostics` to regenerate. -->

# Template reference

Hoverfly response bodies marked `"templated": true` are rendered through [SpectoLabs/raymond](https://github.com/SpectoLabs/raymond) (a Handlebars fork). The LSP validates template syntax, helper names, helper arity, `Vars`/`Literals` resolution, `faker` types, and `now` offsets (see the HF5xx codes in [diagnostics.md](./diagnostics.md)).

> Generated from `packages/core/src/registry/helpers.ts` and `registry/faker.ts`. Regenerate with `npm run docs:diagnostics`.

There are **52 Hoverfly helpers** plus **8 raymond built-ins** (60 total).

## Hoverfly helpers

The 52 helpers registered in Hoverfly's `helperMethodMap`. These, and **only** these, are also valid in `data.variables[].function`.

| Helper | Kind | Arguments | Example | Notes |
| --- | --- | --- | --- | --- |
| `now` | inline | offset: string?, format: string? | `{{now '-1d' 'unix'}}` | Current time, optionally offset and formatted. format "" => RFC3339, "unix" => seconds, "epoch" => MILLISECONDS (misnamed), else a Go time layout. |
| `randomString` | inline | none | `{{randomString}}` | Random string. |
| `randomStringLength` | inline | length: int | `{{randomStringLength 10}}` | Random string of the given length. |
| `randomBoolean` | inline | none | `{{randomBoolean}}` | Random boolean as the string "true"/"false". |
| `randomInteger` | inline | none | `{{randomInteger}}` | Random integer. |
| `randomIntegerRange` | inline | min: int, max: int | `{{randomIntegerRange 1 10}}` | Random integer in [min, max]. |
| `randomFloat` | inline | none | `{{randomFloat}}` | Random float. |
| `randomFloatRange` | inline | min: float, max: float | `{{randomFloatRange 1.0 2.0}}` | Random float in [min, max]. |
| `randomEmail` | inline | none | `{{randomEmail}}` | Random email (powered by icrowley/fake, NOT gofakeit). |
| `randomIPv4` | inline | none | `{{randomIPv4}}` | Random IPv4 address. |
| `randomIPv6` | inline | none | `{{randomIPv6}}` | Random IPv6 address. |
| `randomUuid` | inline | none | `{{randomUuid}}` | Random UUID. |
| `replace` | inline | target: string, oldValue: string, newValue: string | `{{replace (Request.Body 'jsonpath' '$.x') 'a' 'b'}}` | Replace all occurrences of oldValue with newValue in target. |
| `split` | inline | target: string, separator: string | `{{split 'a,b,c' ','}}` | Split target into a []string by separator. |
| `concat` | inline | none | `{{concat 'a' 'b' (getArray 'x')}}` | Concatenate all arguments into one string; flattens any []interface{} argument. |
| `length` | inline | stringToCheck: string | `{{length 'hello'}}` | Length of the string, as a string. |
| `substring` | inline | str: string, startStr: string, endStr: string | `{{substring 'hello' '0' '2'}}` | Substring of str from start to end (indices passed as strings). |
| `rightmostCharacters` | inline | str: string, countStr: string | `{{rightmostCharacters '12345' '2'}}` | The rightmost N characters of str. |
| `isNumeric` | inline | stringToCheck: string | `{{#if (isNumeric x)}}…{{/if}}` | Returns bool, typically wrapped in #if. |
| `isAlphanumeric` | inline | s: string | `{{isAlphanumeric x}}` | Returns bool: alphanumeric check. |
| `isBool` | inline | s: string | `{{isBool x}}` | Returns bool: boolean-string check. |
| `isGreaterThan` | inline | value1: string, value2: string | `{{#if (isGreaterThan a b)}}…{{/if}}` | Returns bool: value1 > value2. (Short form `isGreater` does NOT exist.) |
| `isGreaterThanOrEqual` | inline | value1: string, value2: string | `{{#if (isGreaterThanOrEqual a b)}}…{{/if}}` | Returns bool: value1 >= value2. |
| `isLessThan` | inline | value1: string, value2: string | `{{#if (isLessThan a b)}}…{{/if}}` | Returns bool: value1 < value2. (Short form `isLess` does NOT exist.) |
| `isLessThanOrEqual` | inline | value1: string, value2: string | `{{#if (isLessThanOrEqual a b)}}…{{/if}}` | Returns bool: value1 <= value2. |
| `isBetween` | inline | value: string, min: string, max: string | `{{isBetween x '1' '10'}}` | Returns bool: min <= value <= max. |
| `matchesRegex` | inline | valueToCheck: string, pattern: string | `{{matchesRegex x '^\d+$'}}` | Returns bool: value matches the regex pattern. |
| `faker` | inline | fakerType: string | `{{faker 'Name'}}` | Generate fake data via reflection over *gofakeit.Faker (v6.28.0). Only zero-arg method names are valid. |
| `requestBody` | inline | queryType: string, query: string | `{{requestBody 'jsonpath' '$.x'}}` | Extract from the request body. queryType in {jsonpath, xpath, jsonpathfromxml}. Equivalent to the {{Request.Body ...}} method-call form. |
| `csv` | inline | dataSourceName: string, searchFieldName: string, searchFieldValue: string, returnFieldName: string | `{{csv 'pets' 'id' '1' 'name'}}` | Look up a single field in a CSV data source. |
| `csvMatchingRows` | inline | dataSourceName: string, searchFieldName: string, searchFieldValue: string | `{{#each (csvMatchingRows 'pets' 'category' 'dogs')}}…{{/each}}` | Return all matching CSV rows ([]RowMap); iterate with #each. |
| `csvAsArray` | inline | dataSourceName: string | `{{#each (csvAsArray 'pets')}}…{{/each}}` | Return the CSV as [][]string; iterate with #each. |
| `csvAsMap` | inline | dataSourceName: string | `{{#each (csvAsMap 'pets')}}{{this.name}}{{/each}}` | Return the CSV as []RowMap; iterate with #each and access this.field. |
| `csvAddRow` | inline | dataSourceName: string, newRow: array | `{{csvAddRow 'pets' (split 'a,b' ',')}}` | Append a row to a CSV data source (side effect). |
| `csvDeleteRows` | inline | dataSourceName: string, searchFieldName: string, searchFieldValue: string, output: bool | `{{csvDeleteRows 'pets' 'category' 'cats' true}}` | Delete matching CSV rows; optionally output the deleted count. |
| `csvCountRows` | inline | dataSourceName: string | `{{csvCountRows 'pets'}}` | Count CSV rows, as a string. |
| `csvSqlCommand` | inline | commandString: string | `{{#each (csvSqlCommand "SELECT * FROM pets WHERE category='dogs'")}}…{{/each}}` | Run a SQL command over CSV data sources; returns []RowMap, iterate with #each. |
| `journal` | inline | indexName: string, keyValue: string, dataSource: string, queryType: string, lookupQuery: string | `{{journal 'orderId' '123' 'response' 'jsonpath' '$.status'}}` | Look up a value in the journal by index. |
| `hasJournalKey` | inline | indexName: string, keyValue: string | `{{#if (hasJournalKey 'orderId' '123')}}…{{/if}}` | Returns bool: whether a journal index has the key. Typically wrapped in #if. |
| `setStatusCode` | inline | statusCode: string | `{{setStatusCode '404'}}` | Override the response status (validated 100..599). Side effect; returns "". |
| `setHeader` | inline | headerName: string, headerValue: string | `{{setHeader 'X-Foo' 'bar'}}` | Merge a response header. Side effect; returns "". |
| `sum` | inline | numbers: array, format: string | `{{sum (getArray 'subtotal') '0.00'}}` | Sum a []string of numbers, formatted. |
| `add` | inline | val1: string, val2: string, format: string | `{{add '1' '2' '0.00'}}` | Add two numbers, formatted. |
| `subtract` | inline | val1: string, val2: string, format: string | `{{subtract '5' '2' ''}}` | Subtract val2 from val1, formatted. |
| `multiply` | inline | val1: string, val2: string, format: string | `{{multiply (this.price) (this.qty) ''}}` | Multiply two numbers, formatted. Commonly used as a subexpression. |
| `divide` | inline | val1: string, val2: string, format: string | `{{divide '10' '4' '0.00'}}` | Divide val1 by val2, formatted. |
| `initArray` | inline | key: string | `{{initArray 'subtotal'}}` | Initialise a named array in the render context. Side effect; returns "". |
| `addToArray` | inline | key: string, value: string, output: bool | `{{addToArray 'subtotal' '5' false}}` | Append to a named array; optionally output the value. |
| `getArray` | inline | key: string | `{{getArray 'subtotal'}}` | Read a named array ([]string) from the render context. |
| `putValue` | inline | key: string, value: string, output: bool | `{{putValue 'k' 'v' false}}` | Store a named value; optionally output it. |
| `getValue` | inline | key: string | `{{getValue 'k'}}` | Read a named value from the render context. |
| `jsonFromJWT` | inline | path: string, token: string | `{{jsonFromJWT '$.payload.sub' (Request.Header.Authorization.[0])}}` | Extract a JSONPath value from a decoded JWT token. |

## Raymond built-ins

The 8 Handlebars built-ins usable in any templated body. `first` and `equal` are SpectoLabs-fork additions a generic Handlebars language server would not know. These are **not** valid in `data.variables[].function`.

| Helper | Kind | Arguments | Example | Notes |
| --- | --- | --- | --- | --- |
| `if` | block | condition: any | `{{#if cond}}…{{else}}…{{/if}}` | Block: render the body when the condition is truthy; {{else}} otherwise. |
| `unless` | block | condition: any | `{{#unless cond}}…{{/unless}}` | Block: inverse of #if. |
| `with` | block | context: any | `{{#with obj}}{{field}}{{/with}}` | Block: rescope the context to the argument. |
| `each` | block | iterable: any | `{{#each (csvAsMap 'pets')}}{{this.name}}{{/each}}` | Block: iterate arrays/slices/maps/structs; sets @index/@key/@first/@last and this. |
| `first` | block | iterable: any | `{{#first items}}{{this}}{{/first}}` | Block (SpectoLabs fork extra): render only for the first element. |
| `log` | inline | value: any | `{{log x}}` | Inline: log a value, returns "". |
| `lookup` | inline | obj: any, field: any | `{{lookup obj 'field'}}` | Inline: dynamic property access, lookup obj 'field'. |
| `equal` | block | a: any, b: any | `{{#equal a b}}…{{else}}…{{/equal}}` | Block (SpectoLabs fork extra): render body when Str(a) == Str(b); {{else}} otherwise. |

## `now` offsets and formats

- Units: ns, us, µs, μs, ms, s, m, h, d (=24h), y (=365d). No w/mo/M. Invalid offsets are silently ignored.
- format: "" => RFC3339; "unix" => seconds; "epoch" => MILLISECONDS (misnamed footgun); else a Go time layout (e.g. "2006-01-02").
- Accepted units: `ns`, `us`, `µs`, `μs`, `ms`, `s`, `m`, `h`, `d`, `y`.
- Offset pattern: `^[-+]?(\d+(\.\d+)?(ns|us|µs|μs|ms|s|m|h|d|y))+$`.

## `faker` types

Hoverfly's `{{faker 'X'}}` dispatches by reflection over `*gofakeit.Faker` (pinned to gofakeit **v6.28.0**). Only the **210 zero-argument** method names below are valid, and they are **case-sensitive**. Parameterized methods (`Number`, `Sentence`, `Password`, `Regex`, …) panic at render time when called with no arguments; the LSP flags those (HF508). The authoritative list lives in [`packages/core/src/registry/faker.ts`](../packages/core/src/registry/faker.ts).

<details><summary>All 210 faker type names</summary>

| | | | | | |
| --- | --- | --- | --- | --- | --- |
| `AchAccount` | `AchRouting` | `Address` | `Animal` | `AnimalType` | `AppAuthor` |
| `AppName` | `AppVersion` | `BeerAlcohol` | `BeerBlg` | `BeerHop` | `BeerIbu` |
| `BeerMalt` | `BeerName` | `BeerStyle` | `BeerYeast` | `Bird` | `BitcoinAddress` |
| `BitcoinPrivateKey` | `Blurb` | `Book` | `BookAuthor` | `BookGenre` | `BookTitle` |
| `Bool` | `Breakfast` | `BS` | `BuzzWord` | `Car` | `CarFuelType` |
| `CarMaker` | `CarModel` | `CarTransmissionType` | `CarType` | `Cat` | `CelebrityActor` |
| `CelebrityBusiness` | `CelebritySport` | `ChromeUserAgent` | `City` | `Color` | `Company` |
| `CompanySuffix` | `Contact` | `Country` | `CountryAbr` | `CreditCard` | `CreditCardCvv` |
| `CreditCardExp` | `CreditCardType` | `Currency` | `CurrencyLong` | `CurrencyShort` | `Cusip` |
| `Date` | `Day` | `Dessert` | `Digit` | `Dinner` | `Dog` |
| `DomainName` | `DomainSuffix` | `Drink` | `Email` | `Emoji` | `EmojiAlias` |
| `EmojiCategory` | `EmojiDescription` | `EmojiTag` | `Error` | `ErrorDatabase` | `ErrorGRPC` |
| `ErrorHTTP` | `ErrorHTTPClient` | `ErrorHTTPServer` | `ErrorObject` | `ErrorRuntime` | `ErrorValidation` |
| `FarmAnimal` | `FileExtension` | `FileMimeType` | `FirefoxUserAgent` | `FirstName` | `FlipACoin` |
| `Float32` | `Float64` | `Fruit` | `FutureDate` | `Gamertag` | `Gender` |
| `HackerAbbreviation` | `HackerAdjective` | `HackeringVerb` | `HackerNoun` | `HackerPhrase` | `HackerVerb` |
| `HexColor` | `HexUint128` | `HexUint16` | `HexUint256` | `HexUint32` | `HexUint64` |
| `HexUint8` | `Hobby` | `Hour` | `HTTPMethod` | `HTTPStatusCode` | `HTTPStatusCodeSimple` |
| `HTTPVersion` | `InputName` | `Int16` | `Int32` | `Int64` | `Int8` |
| `IPv4Address` | `IPv6Address` | `Isin` | `Job` | `JobDescriptor` | `JobLevel` |
| `JobTitle` | `Language` | `LanguageAbbreviation` | `LanguageBCP` | `LastName` | `Latitude` |
| `Letter` | `Longitude` | `LoremIpsumWord` | `Lunch` | `MacAddress` | `Map` |
| `MiddleName` | `MinecraftAnimal` | `MinecraftArmorPart` | `MinecraftArmorTier` | `MinecraftBiome` | `MinecraftDye` |
| `MinecraftFood` | `MinecraftMobBoss` | `MinecraftMobHostile` | `MinecraftMobNeutral` | `MinecraftMobPassive` | `MinecraftOre` |
| `MinecraftTool` | `MinecraftVillagerJob` | `MinecraftVillagerLevel` | `MinecraftVillagerStation` | `MinecraftWeapon` | `MinecraftWeather` |
| `MinecraftWood` | `Minute` | `Month` | `MonthString` | `Movie` | `MovieGenre` |
| `MovieName` | `Name` | `NamePrefix` | `NameSuffix` | `NanoSecond` | `NiceColors` |
| `OperaUserAgent` | `PastDate` | `Person` | `PetName` | `Phone` | `PhoneFormatted` |
| `Product` | `ProductCategory` | `ProductDescription` | `ProductFeature` | `ProductMaterial` | `ProductName` |
| `ProductUPC` | `ProgrammingLanguage` | `ProgrammingLanguageBest` | `RGBColor` | `SafariUserAgent` | `SafeColor` |
| `School` | `Second` | `Slogan` | `Snack` | `SSN` | `State` |
| `StateAbr` | `Street` | `StreetName` | `StreetNumber` | `StreetPrefix` | `StreetSuffix` |
| `TimeZone` | `TimeZoneAbv` | `TimeZoneFull` | `TimeZoneOffset` | `TimeZoneRegion` | `Uint16` |
| `Uint32` | `Uint64` | `Uint8` | `URL` | `UserAgent` | `Username` |
| `UUID` | `Vegetable` | `Vowel` | `WeekDay` | `Year` | `Zip` |

</details>

## JSONPath / XPath dialects

Hoverfly's JSONPath support uses the **kubectl** dialect (`k8s.io/client-go/util/jsonpath`), **not** Jayway or RFC 9535. XPath is evaluated by `ChrisTrenkamp/xsel`. Expressions written for Jayway-style JSONPath (filters, recursive descent specifics) may not behave the same; author against the kubectl JSONPath syntax.
