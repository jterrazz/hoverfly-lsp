import { describe, expect, test } from 'vitest';

import { createStringSourceMap } from '../source-map.js';

function described(
    raw: string,
    at: number,
): { decoded: string; toDecodedOffset: string; toDocOffset: string } {
    const map = createStringSourceMap(raw, at);
    const toDoc = Array.from({ length: map.decoded.length + 3 }, (_, index) => index - 1);
    const toDecoded = Array.from({ length: raw.length + 3 }, (_, index) => at + index - 1);
    return {
        decoded: map.decoded,
        toDecodedOffset: toDecoded
            .map((offset) => `${offset}:${map.toDecodedOffset(offset)}`)
            .join(' '),
        toDocOffset: toDoc.map((offset) => `${offset}:${map.toDocOffset(offset)}`).join(' '),
    };
}

describe('createStringSourceMap', () => {
    test.each([
        {
            at: 10,
            map: {
                decoded: 'hello',
                toDecodedOffset: '9:0 10:0 11:0 12:1 13:2 14:3 15:4 16:5 17:5 18:5',
                toDocOffset: '-1:11 0:11 1:12 2:13 3:14 4:15 5:16 6:16',
            },
            raw: '"hello"',
        },
        {
            at: 0,
            map: {
                decoded: 'abc',
                toDecodedOffset: '-1:0 0:0 1:1 2:2 3:3 4:3',
                toDocOffset: '-1:0 0:0 1:1 2:2 3:3 4:3',
            },
            raw: 'abc',
        },
        {
            at: 0,
            map: {
                decoded: 'a\nb',
                toDecodedOffset: '-1:0 0:0 1:0 2:1 3:2 4:2 5:3 6:3 7:3',
                toDocOffset: '-1:1 0:1 1:2 2:4 3:5 4:5',
            },
            raw: String.raw`"a\nb"`,
        },
        {
            at: 0,
            map: {
                decoded: '"\\/\b\f\n\r\t',
                toDecodedOffset:
                    '-1:0 0:0 1:0 2:1 3:1 4:2 5:2 6:3 7:3 8:4 9:4 10:5 11:5 12:6 13:6 14:7 15:7 16:8 17:8 18:8 19:8',
                toDocOffset: '-1:1 0:1 1:3 2:5 3:7 4:9 5:11 6:13 7:15 8:17 9:17',
            },
            raw: String.raw`"\"\\\/\b\f\n\r\t"`,
        },
        {
            at: 0,
            map: {
                decoded: 'AZ',
                toDecodedOffset: '-1:0 0:0 1:0 2:1 3:1 4:1 5:1 6:1 7:1 8:2 9:2 10:2',
                toDocOffset: '-1:1 0:1 1:7 2:8 3:8',
            },
            raw: String.raw`"\u0041Z"`,
        },
        {
            at: 0,
            map: {
                decoded: '😀x',
                toDecodedOffset:
                    '-1:0 0:0 1:0 2:1 3:1 4:1 5:1 6:1 7:1 8:2 9:2 10:2 11:2 12:2 13:2 14:3 15:3 16:3',
                toDocOffset: '-1:1 0:1 1:7 2:13 3:14 4:14',
            },
            raw: String.raw`"\uD83D\uDE00x"`,
        },
        {
            at: 0,
            map: {
                decoded: '😀y',
                toDecodedOffset: '-1:0 0:0 1:0 2:1 3:2 4:3 5:3 6:3',
                toDocOffset: '-1:1 0:1 1:2 2:3 3:4 4:4',
            },
            raw: '"😀y"',
        },
        {
            at: 100,
            map: {
                decoded: 'line1\n{{x}}',
                toDecodedOffset:
                    '99:0 100:0 101:0 102:1 103:2 104:3 105:4 106:5 107:6 108:6 109:7 110:8 111:9 112:10 113:11 114:11 115:11',
                toDocOffset:
                    '-1:101 0:101 1:102 2:103 3:104 4:105 5:106 6:108 7:109 8:110 9:111 10:112 11:113 12:113',
            },
            raw: String.raw`"line1\n{{x}}"`,
        },
        {
            at: 0,
            map: {
                decoded: 'AB{{Vars.x}}',
                toDecodedOffset:
                    '-1:0 0:0 1:0 2:1 3:1 4:1 5:1 6:1 7:1 8:2 9:2 10:2 11:2 12:2 13:2 14:3 15:4 16:5 17:6 18:7 19:8 20:9 21:10 22:11 23:12 24:12 25:12',
                toDocOffset:
                    '-1:1 0:1 1:7 2:13 3:14 4:15 5:16 6:17 7:18 8:19 9:20 10:21 11:22 12:23 13:23',
            },
            raw: String.raw`"\u0041\u0042{{Vars.x}}"`,
        },
        {
            at: 0,
            map: {
                decoded: 'a\\zb',
                toDecodedOffset: '-1:0 0:0 1:0 2:1 3:2 4:3 5:4 6:4 7:4',
                toDocOffset: '-1:1 0:1 1:2 2:3 3:4 4:5 5:5',
            },
            raw: String.raw`"a\zb"`,
        },
        {
            at: 5,
            map: {
                decoded: 'hi',
                toDecodedOffset: '4:0 5:0 6:0 7:1 8:2 9:2 10:2',
                toDocOffset: '-1:6 0:6 1:7 2:8 3:8',
            },
            raw: '"hi"',
        },
        {
            at: 0,
            map: {
                decoded: '',
                toDecodedOffset: '-1:0 0:0 1:0 2:0 3:0',
                toDocOffset: '-1:1 0:1 1:1',
            },
            raw: '""',
        },
        {
            at: 100,
            map: {
                decoded: 'line1\n{{Request.x}}',
                toDecodedOffset:
                    '99:0 100:0 101:0 102:1 103:2 104:3 105:4 106:5 107:6 108:6 109:7 110:8 111:9 112:10 113:11 114:12 115:13 116:14 117:15 118:16 119:17 120:18 121:19 122:19 123:19',
                toDocOffset:
                    '-1:101 0:101 1:102 2:103 3:104 4:105 5:106 6:108 7:109 8:110 9:111 10:112 11:113 12:114 13:115 14:116 15:117 16:118 17:119 18:120 19:121 20:121',
            },
            raw: String.raw`"line1\n{{Request.x}}"`,
        },
        {
            at: 0,
            map: {
                decoded: 'a12345',
                toDecodedOffset: '-1:0 0:0 1:1 2:2 3:3 4:4 5:5 6:6 7:6',
                toDocOffset: '-1:0 0:0 1:1 2:2 3:3 4:4 5:5 6:6 7:6',
            },
            raw: 'a12345',
        },
        {
            at: 0,
            map: {
                decoded: '\\z1234',
                toDecodedOffset: '-1:0 0:0 1:1 2:2 3:3 4:4 5:5 6:6 7:6',
                toDocOffset: '-1:0 0:0 1:1 2:2 3:3 4:4 5:5 6:6 7:6',
            },
            raw: String.raw`\z1234`,
        },
        {
            at: 0,
            map: {
                decoded: '\\u12zz',
                toDecodedOffset: '-1:0 0:0 1:1 2:2 3:3 4:4 5:5 6:6 7:6',
                toDocOffset: '-1:0 0:0 1:1 2:2 3:3 4:4 5:5 6:6 7:6',
            },
            raw: String.raw`\u12zz`,
        },
        {
            at: 0,
            map: {
                decoded: '"ab',
                toDecodedOffset: '-1:0 0:0 1:1 2:2 3:3 4:3',
                toDocOffset: '-1:0 0:0 1:1 2:2 3:3 4:3',
            },
            raw: '"ab',
        },
        {
            at: 0,
            map: {
                decoded: 'ab"',
                toDecodedOffset: '-1:0 0:0 1:1 2:2 3:3 4:3',
                toDocOffset: '-1:0 0:0 1:1 2:2 3:3 4:3',
            },
            raw: 'ab"',
        },
        {
            at: 0,
            map: {
                decoded: '"',
                toDecodedOffset: '-1:0 0:0 1:1 2:1',
                toDocOffset: '-1:0 0:0 1:1 2:1',
            },
            raw: '"',
        },
        {
            at: 0,
            map: {
                decoded: 'au1234',
                toDecodedOffset: '-1:0 0:0 1:1 2:2 3:3 4:4 5:5 6:6 7:6',
                toDocOffset: '-1:0 0:0 1:1 2:2 3:3 4:4 5:5 6:6 7:6',
            },
            raw: 'au1234',
        },
    ])(
        // Given - the JSON string token $raw at document offset $at
        // Then - its decoded text, and where every offset maps each way — one past each end included, so the clamps are read too
        'maps $raw at $at',
        ({ at, map, raw }) => {
            expect(described(raw, at)).toStrictEqual(map);
        },
    );
});
