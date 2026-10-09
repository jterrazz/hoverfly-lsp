import { describe, expect, test } from 'vitest';

import { completionsAt, labelsAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

function templatedBody(body: string): string {
    return `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"body":"${body}"}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

describe('template completion', () => {
    test('offers every helper and the path roots at a mustache head', async () => {
        // Given - a just-opened mustache in a templated body
        const result = await integration.call(async () => await labelsAt(templatedBody('{{⟦⟧}}')));

        // Then - the 52 Hoverfly helpers, the 8 raymond built-ins and the data roots
        expect(result.value).toMatch([
            'now',
            'randomString',
            'randomStringLength',
            'randomBoolean',
            'randomInteger',
            'randomIntegerRange',
            'randomFloat',
            'randomFloatRange',
            'randomEmail',
            'randomIPv4',
            'randomIPv6',
            'randomUuid',
            'replace',
            'split',
            'concat',
            'length',
            'substring',
            'rightmostCharacters',
            'isNumeric',
            'isAlphanumeric',
            'isBool',
            'isGreaterThan',
            'isGreaterThanOrEqual',
            'isLessThan',
            'isLessThanOrEqual',
            'isBetween',
            'matchesRegex',
            'faker',
            'requestBody',
            'csv',
            'csvMatchingRows',
            'csvAsArray',
            'csvAsMap',
            'csvAddRow',
            'csvDeleteRows',
            'csvCountRows',
            'csvSqlCommand',
            'journal',
            'hasJournalKey',
            'setStatusCode',
            'setHeader',
            'sum',
            'add',
            'subtract',
            'multiply',
            'divide',
            'initArray',
            'addToArray',
            'getArray',
            'putValue',
            'getValue',
            'jsonFromJWT',
            'if',
            'unless',
            'with',
            'each',
            'first',
            'log',
            'lookup',
            'equal',
            'Request',
            'State',
            'Vars',
            'Literals',
        ]);
    });

    test('recovers a half-typed `{{fa` and offers the helper list', async () => {
        // Given - a half-typed helper name with no closing braces
        const result = await integration.call(async () => await labelsAt(templatedBody('{{fa⟦⟧')));

        // Then - the same list, the client filtering by prefix
        expect(result.value).toMatch([
            'now',
            'randomString',
            'randomStringLength',
            'randomBoolean',
            'randomInteger',
            'randomIntegerRange',
            'randomFloat',
            'randomFloatRange',
            'randomEmail',
            'randomIPv4',
            'randomIPv6',
            'randomUuid',
            'replace',
            'split',
            'concat',
            'length',
            'substring',
            'rightmostCharacters',
            'isNumeric',
            'isAlphanumeric',
            'isBool',
            'isGreaterThan',
            'isGreaterThanOrEqual',
            'isLessThan',
            'isLessThanOrEqual',
            'isBetween',
            'matchesRegex',
            'faker',
            'requestBody',
            'csv',
            'csvMatchingRows',
            'csvAsArray',
            'csvAsMap',
            'csvAddRow',
            'csvDeleteRows',
            'csvCountRows',
            'csvSqlCommand',
            'journal',
            'hasJournalKey',
            'setStatusCode',
            'setHeader',
            'sum',
            'add',
            'subtract',
            'multiply',
            'divide',
            'initArray',
            'addToArray',
            'getArray',
            'putValue',
            'getValue',
            'jsonFromJWT',
            'if',
            'unless',
            'with',
            'each',
            'first',
            'log',
            'lookup',
            'equal',
            'Request',
            'State',
            'Vars',
            'Literals',
        ]);
    });

    test('inserts the arguments of a helper as snippet placeholders', async () => {
        // Given - a mustache head, the replace item read
        const result = await integration.call(
            async () =>
                (await completionsAt(templatedBody('{{⟦⟧}}'))).find(
                    (item) => item.label === 'replace',
                )?.insertText,
        );

        // Then - its three argument placeholders
        expect(result.value).toMatch(`replace \${1:target} \${2:oldValue} \${3:newValue}`);
    });

    test('offers the Request members after `Request.`', async () => {
        // Given - a dotted Request path being continued
        const result = await integration.call(
            async () => await labelsAt(templatedBody('{{Request.⟦⟧}}')),
        );

        // Then - the documented members alone
        expect(result.value).toMatch([
            'Scheme',
            'Method',
            'Host',
            'Path',
            'QueryParam',
            'Header',
            'FormData',
            'Body',
        ]);
    });

    test('offers the declared State keys after `State.`', async () => {
        // Given - state keys declared by another pair's requiresState and transitionsState
        const doc = `{"data":{"pairs":[
      {"request":{"path":[],"requiresState":{"cart":"full"}},"response":{"status":200,"transitionsState":{"checkout":"done"}}},
      {"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{State.⟦⟧}}"}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - both keys
        expect(result.value).toMatch(['cart', 'checkout']);
    });

    test('offers the declared Vars names after `Vars.`', async () => {
        // Given - data.variables declares a variable
        const doc = `{"data":{"variables":[{"name":"token","function":"randomUuid"}],"pairs":[
      {"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{Vars.⟦⟧}}"}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the variable
        expect(result.value).toMatch(['token']);
    });

    test('offers the declared Literals names after `Literals.`', async () => {
        // Given - data.literals declares a literal
        const doc = `{"data":{"literals":[{"name":"apiBase","value":"https://x"}],"pairs":[
      {"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{Literals.⟦⟧}}"}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the literal
        expect(result.value).toMatch(['apiBase']);
    });

    test('offers the zero-arg faker types inside the faker argument', async () => {
        // Given - the cursor inside the faker string argument
        const result = await integration.call(
            async () => await labelsAt(templatedBody("{{faker '⟦⟧'}}")),
        );

        // Then - the 210 zero-arg gofakeit names, no parameterized one
        expect(result.value).toMatch([
            'AchAccount',
            'AchRouting',
            'Address',
            'Animal',
            'AnimalType',
            'AppAuthor',
            'AppName',
            'AppVersion',
            'BeerAlcohol',
            'BeerBlg',
            'BeerHop',
            'BeerIbu',
            'BeerMalt',
            'BeerName',
            'BeerStyle',
            'BeerYeast',
            'Bird',
            'BitcoinAddress',
            'BitcoinPrivateKey',
            'Blurb',
            'Book',
            'BookAuthor',
            'BookGenre',
            'BookTitle',
            'Bool',
            'Breakfast',
            'BS',
            'BuzzWord',
            'Car',
            'CarFuelType',
            'CarMaker',
            'CarModel',
            'CarTransmissionType',
            'CarType',
            'Cat',
            'CelebrityActor',
            'CelebrityBusiness',
            'CelebritySport',
            'ChromeUserAgent',
            'City',
            'Color',
            'Company',
            'CompanySuffix',
            'Contact',
            'Country',
            'CountryAbr',
            'CreditCard',
            'CreditCardCvv',
            'CreditCardExp',
            'CreditCardType',
            'Currency',
            'CurrencyLong',
            'CurrencyShort',
            'Cusip',
            'Date',
            'Day',
            'Dessert',
            'Digit',
            'Dinner',
            'Dog',
            'DomainName',
            'DomainSuffix',
            'Drink',
            'Email',
            'Emoji',
            'EmojiAlias',
            'EmojiCategory',
            'EmojiDescription',
            'EmojiTag',
            'Error',
            'ErrorDatabase',
            'ErrorGRPC',
            'ErrorHTTP',
            'ErrorHTTPClient',
            'ErrorHTTPServer',
            'ErrorObject',
            'ErrorRuntime',
            'ErrorValidation',
            'FarmAnimal',
            'FileExtension',
            'FileMimeType',
            'FirefoxUserAgent',
            'FirstName',
            'FlipACoin',
            'Float32',
            'Float64',
            'Fruit',
            'FutureDate',
            'Gamertag',
            'Gender',
            'HackerAbbreviation',
            'HackerAdjective',
            'HackeringVerb',
            'HackerNoun',
            'HackerPhrase',
            'HackerVerb',
            'HexColor',
            'HexUint128',
            'HexUint16',
            'HexUint256',
            'HexUint32',
            'HexUint64',
            'HexUint8',
            'Hobby',
            'Hour',
            'HTTPMethod',
            'HTTPStatusCode',
            'HTTPStatusCodeSimple',
            'HTTPVersion',
            'InputName',
            'Int16',
            'Int32',
            'Int64',
            'Int8',
            'IPv4Address',
            'IPv6Address',
            'Isin',
            'Job',
            'JobDescriptor',
            'JobLevel',
            'JobTitle',
            'Language',
            'LanguageAbbreviation',
            'LanguageBCP',
            'LastName',
            'Latitude',
            'Letter',
            'Longitude',
            'LoremIpsumWord',
            'Lunch',
            'MacAddress',
            'Map',
            'MiddleName',
            'MinecraftAnimal',
            'MinecraftArmorPart',
            'MinecraftArmorTier',
            'MinecraftBiome',
            'MinecraftDye',
            'MinecraftFood',
            'MinecraftMobBoss',
            'MinecraftMobHostile',
            'MinecraftMobNeutral',
            'MinecraftMobPassive',
            'MinecraftOre',
            'MinecraftTool',
            'MinecraftVillagerJob',
            'MinecraftVillagerLevel',
            'MinecraftVillagerStation',
            'MinecraftWeapon',
            'MinecraftWeather',
            'MinecraftWood',
            'Minute',
            'Month',
            'MonthString',
            'Movie',
            'MovieGenre',
            'MovieName',
            'Name',
            'NamePrefix',
            'NameSuffix',
            'NanoSecond',
            'NiceColors',
            'OperaUserAgent',
            'PastDate',
            'Person',
            'PetName',
            'Phone',
            'PhoneFormatted',
            'Product',
            'ProductCategory',
            'ProductDescription',
            'ProductFeature',
            'ProductMaterial',
            'ProductName',
            'ProductUPC',
            'ProgrammingLanguage',
            'ProgrammingLanguageBest',
            'RGBColor',
            'SafariUserAgent',
            'SafeColor',
            'School',
            'Second',
            'Slogan',
            'Snack',
            'SSN',
            'State',
            'StateAbr',
            'Street',
            'StreetName',
            'StreetNumber',
            'StreetPrefix',
            'StreetSuffix',
            'TimeZone',
            'TimeZoneAbv',
            'TimeZoneFull',
            'TimeZoneOffset',
            'TimeZoneRegion',
            'Uint16',
            'Uint32',
            'Uint64',
            'Uint8',
            'URL',
            'UserAgent',
            'Username',
            'UUID',
            'Vegetable',
            'Vowel',
            'WeekDay',
            'Year',
            'Zip',
        ]);
    });

    test('offers offset examples in the offset slot of now', async () => {
        // Given - the cursor in the first argument of now
        const result = await integration.call(
            async () => await labelsAt(templatedBody("{{now '⟦⟧'}}")),
        );

        // Then - the offset examples
        expect(result.value).toMatch(['-1d', '+1h', '-30m', '1y', '-1.5h']);
    });

    test('offers format strings in the format slot of now', async () => {
        // Given - the cursor in the second argument of now
        const result = await integration.call(
            async () => await labelsAt(templatedBody("{{now '-1d' '⟦⟧'}}")),
        );

        // Then - unix, epoch and the Go layouts
        expect(result.value).toMatch([
            '(empty → RFC3339)',
            'unix',
            'epoch',
            '2006-01-02',
            '2006-01-02T15:04:05Z07:00',
        ]);
    });

    test('offers the @-variables and this inside #each', async () => {
        // Given - a mustache head inside an unclosed #each block
        const result = await integration.call(
            async () => await labelsAt(templatedBody('{{#each items}}{{⟦⟧')),
        );

        // Then - the each data variables and this, beside the helpers
        expect(result.value).toMatch([
            'now',
            'randomString',
            'randomStringLength',
            'randomBoolean',
            'randomInteger',
            'randomIntegerRange',
            'randomFloat',
            'randomFloatRange',
            'randomEmail',
            'randomIPv4',
            'randomIPv6',
            'randomUuid',
            'replace',
            'split',
            'concat',
            'length',
            'substring',
            'rightmostCharacters',
            'isNumeric',
            'isAlphanumeric',
            'isBool',
            'isGreaterThan',
            'isGreaterThanOrEqual',
            'isLessThan',
            'isLessThanOrEqual',
            'isBetween',
            'matchesRegex',
            'faker',
            'requestBody',
            'csv',
            'csvMatchingRows',
            'csvAsArray',
            'csvAsMap',
            'csvAddRow',
            'csvDeleteRows',
            'csvCountRows',
            'csvSqlCommand',
            'journal',
            'hasJournalKey',
            'setStatusCode',
            'setHeader',
            'sum',
            'add',
            'subtract',
            'multiply',
            'divide',
            'initArray',
            'addToArray',
            'getArray',
            'putValue',
            'getValue',
            'jsonFromJWT',
            'if',
            'unless',
            'with',
            'each',
            'first',
            'log',
            'lookup',
            'equal',
            'Request',
            'State',
            'Vars',
            'Literals',
            '@index',
            '@first',
            '@last',
            '@key',
            'this',
        ]);
    });

    test('offers the @-variables after `{{@` inside #each', async () => {
        // Given - a `{{@` continuation inside #each
        const result = await integration.call(
            async () => await labelsAt(templatedBody('{{#each items}}{{@⟦⟧')),
        );

        // Then - the @-variables
        expect(result.value).toMatch(['@index', '@first', '@last', '@key']);
    });

    test('offers the matching open block name at `{{/`', async () => {
        // Given - a block close typed inside an open #each
        const result = await integration.call(
            async () => await labelsAt(templatedBody('{{#each items}}{{/⟦⟧')),
        );

        // Then - each, to close the block
        expect(result.value).toMatch(['each']);
    });

    test('offers the helpers inside a templated response header value', async () => {
        // Given - templated true and a header value holding a mustache head
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"headers":{"X-Trace":["{{⟦⟧}}"]}}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the helper list, as in a body
        expect(result.value).toMatch([
            'now',
            'randomString',
            'randomStringLength',
            'randomBoolean',
            'randomInteger',
            'randomIntegerRange',
            'randomFloat',
            'randomFloatRange',
            'randomEmail',
            'randomIPv4',
            'randomIPv6',
            'randomUuid',
            'replace',
            'split',
            'concat',
            'length',
            'substring',
            'rightmostCharacters',
            'isNumeric',
            'isAlphanumeric',
            'isBool',
            'isGreaterThan',
            'isGreaterThanOrEqual',
            'isLessThan',
            'isLessThanOrEqual',
            'isBetween',
            'matchesRegex',
            'faker',
            'requestBody',
            'csv',
            'csvMatchingRows',
            'csvAsArray',
            'csvAsMap',
            'csvAddRow',
            'csvDeleteRows',
            'csvCountRows',
            'csvSqlCommand',
            'journal',
            'hasJournalKey',
            'setStatusCode',
            'setHeader',
            'sum',
            'add',
            'subtract',
            'multiply',
            'divide',
            'initArray',
            'addToArray',
            'getArray',
            'putValue',
            'getValue',
            'jsonFromJWT',
            'if',
            'unless',
            'with',
            'each',
            'first',
            'log',
            'lookup',
            'equal',
            'Request',
            'State',
            'Vars',
            'Literals',
        ]);
    });

    test('offers the helpers when the body holds `{{` and templated is absent', async () => {
        // Given - no templated key, a template in progress
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"body":"{{fa⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the helper list, HF501 asking separately for templated
        expect(result.value).toMatch([
            'now',
            'randomString',
            'randomStringLength',
            'randomBoolean',
            'randomInteger',
            'randomIntegerRange',
            'randomFloat',
            'randomFloatRange',
            'randomEmail',
            'randomIPv4',
            'randomIPv6',
            'randomUuid',
            'replace',
            'split',
            'concat',
            'length',
            'substring',
            'rightmostCharacters',
            'isNumeric',
            'isAlphanumeric',
            'isBool',
            'isGreaterThan',
            'isGreaterThanOrEqual',
            'isLessThan',
            'isLessThanOrEqual',
            'isBetween',
            'matchesRegex',
            'faker',
            'requestBody',
            'csv',
            'csvMatchingRows',
            'csvAsArray',
            'csvAsMap',
            'csvAddRow',
            'csvDeleteRows',
            'csvCountRows',
            'csvSqlCommand',
            'journal',
            'hasJournalKey',
            'setStatusCode',
            'setHeader',
            'sum',
            'add',
            'subtract',
            'multiply',
            'divide',
            'initArray',
            'addToArray',
            'getArray',
            'putValue',
            'getValue',
            'jsonFromJWT',
            'if',
            'unless',
            'with',
            'each',
            'first',
            'log',
            'lookup',
            'equal',
            'Request',
            'State',
            'Vars',
            'Literals',
        ]);
    });

    test(String.raw`maps the cursor after a \n escape to the Request continuation`, async () => {
        // Given - a two-character escape before the mustache
        const result = await integration.call(
            async () => await labelsAt(templatedBody(String.raw`line1\n{{Request.⟦⟧}}`)),
        );

        // Then - the Request members, the escape counted once
        expect(result.value).toMatch([
            'Scheme',
            'Method',
            'Host',
            'Path',
            'QueryParam',
            'Header',
            'FormData',
            'Body',
        ]);
    });

    test('offers nothing in a plain body', async () => {
        // Given - a body with no template syntax and no templated key
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"body":"plain ⟦⟧text"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - nothing
        expect(result.value).toMatch([]);
    });

    test('offers no helper in a requiresState value', async () => {
        // Given - a cursor in a requiresState value, which is not templated
        const doc = `{"data":{"pairs":[{"request":{"path":[],"requiresState":{"k":"⟦⟧"}},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - nothing templated
        expect(result.value).toMatch([]);
    });

    test('offers nothing in the literal text of a templated body', async () => {
        // Given - the cursor outside any mustache of a templated body
        const result = await integration.call(
            async () => await labelsAt(templatedBody('hello ⟦⟧ world')),
        );

        // Then - nothing
        expect(result.value).toMatch([]);
    });
});
