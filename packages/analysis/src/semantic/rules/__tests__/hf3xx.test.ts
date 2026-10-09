import { describe, expect, test } from 'vitest';

import { hf3xxResponseRule } from '../hf3xx.js';
import { diagnosticsOf, pairOf } from './rule-run.js';

const run = (response: object | string): string[] =>
    diagnosticsOf(
        hf3xxResponseRule,
        typeof response === 'string'
            ? response
            : pairOf({ path: [{ matcher: 'exact', value: '/' }] }, response),
    );

describe('hf3xx', () => {
    test.each([
        {
            expected: [
                'HF301 warning 15:10-15:20 Response contains both body and bodyFile; please remove one of them, otherwise body is used if non-empty',
            ],
            label: 'body and bodyFile both set — warns and points at the bodyFile key',
            response: { status: 200, body: 'hi', bodyFile: 'out.txt' },
        },
        {
            expected: [],
            label: 'body and bodyFile both set — stays silent when only one of body/bodyFile is set',
            response: { status: 200, body: 'hi' },
        },
        {
            expected: [],
            label: 'body and bodyFile both set — stays silent when only one of body/bodyFile is set (2)',
            response: { status: 200, bodyFile: 'out.txt' },
        },
        {
            expected: [
                'HF302 warning 18:12-18:31 Response contains both Content-Length and Transfer-Encoding headers; please remove one of these headers',
            ],
            label: 'Content-Length and Transfer-Encoding both set — warns on the second header key (case-insensitive names)',
            response: {
                status: 200,
                headers: { 'content-length': ['3'], 'Transfer-Encoding': ['chunked'] },
            },
        },
        {
            expected: [],
            label: 'Content-Length and Transfer-Encoding both set — stays silent with only one of the two',
            response: { status: 200, headers: { 'Content-Length': ['3'] } },
        },
        {
            expected: ['HF303 warning 17:14-17:17 Content-Length 3 does not match body length 5'],
            label: 'Content-Length mismatch — warns when Content-Length disagrees with UTF-8 byte length',
            response: { status: 200, body: 'hello', headers: { 'Content-Length': ['3'] } },
        },
        {
            expected: ['HF303 warning 17:14-17:17 Content-Length 2 does not match body length 6'],
            label: 'Content-Length mismatch — uses UTF-8 byte length, not code-unit length',
            response: { status: 200, body: '€€', headers: { 'Content-Length': ['2'] } },
        },
        {
            expected: [],
            label: 'Content-Length mismatch — is silent when length matches',
            response: { status: 200, body: 'hello', headers: { 'Content-Length': ['5'] } },
        },
        {
            expected: [],
            label: 'Content-Length mismatch — skips when templated/encodedBody/bodyFile makes the body unmeasurable',
            response: {
                status: 200,
                body: '{{ Request.Body }}',
                templated: true,
                headers: { 'Content-Length': ['3'] },
            },
        },
        {
            expected: [],
            label: 'Content-Length mismatch — skips when templated/encodedBody/bodyFile makes the body unmeasurable (2)',
            response: {
                status: 200,
                body: 'aGVsbG8=',
                encodedBody: true,
                headers: { 'Content-Length': ['3'] },
            },
        },
        {
            expected: ['HF305 warning 14:18-14:32 encodedBody is set but body is not valid base64'],
            label: 'encodedBody but invalid base64 — warns on a non-base64 body when encodedBody is true',
            response: { status: 200, body: 'not base64!!', encodedBody: true },
        },
        {
            expected: [],
            label: 'encodedBody but invalid base64 — accepts valid padded base64',
            response: { status: 200, body: 'aGVsbG8=', encodedBody: true },
        },
        {
            expected: [],
            label: 'encodedBody but invalid base64 — accepts an empty body (decodes to empty) and ignores when encodedBody is false',
            response: { status: 200, body: '', encodedBody: true },
        },
        {
            expected: [],
            label: 'encodedBody but invalid base64 — accepts an empty body (decodes to empty) and ignores when encodedBody is false (2)',
            response: { status: 200, body: 'not base64!!', encodedBody: false },
        },
        {
            expected: ['HF306 warning 14:24-14:28 Negative delay is ignored'],
            label: 'negative fixedDelay — warns on a negative fixedDelay and is silent on >= 0',
            response: { status: 200, fixedDelay: -100 },
        },
        {
            expected: [],
            label: 'negative fixedDelay — warns on a negative fixedDelay and is silent on >= 0 (2)',
            response: { status: 200, fixedDelay: 0 },
        },
        {
            expected: [],
            label: 'negative fixedDelay — warns on a negative fixedDelay and is silent on >= 0 (3)',
            response: { status: 200, fixedDelay: 250 },
        },
        {
            expected: [],
            label: 'logNormalDelay constraints — accepts a valid log-normal delay',
            response: { status: 200, logNormalDelay: { min: 10, max: 100, mean: 50, median: 40 } },
        },
        {
            expected: [
                'HF307 warning 15:20-15:21 logNormalDelay mean and median cannot be less than or equal to 0',
            ],
            label: 'logNormalDelay constraints — warns when mean or median <= 0',
            response: { status: 200, logNormalDelay: { mean: 0, median: 5 } },
        },
        {
            expected: [
                'HF307 warning 15:19-15:21 logNormalDelay min and max cannot be less than 0',
            ],
            label: 'logNormalDelay constraints — warns when min is negative',
            response: { status: 200, logNormalDelay: { min: -1, max: 100, mean: 50, median: 40 } },
        },
        {
            expected: ['HF307 warning 16:19-16:21 logNormalDelay min must be less than max'],
            label: 'logNormalDelay constraints — warns when max < min',
            response: { status: 200, logNormalDelay: { min: 100, max: 10, mean: 50, median: 40 } },
        },
        {
            expected: ['HF307 warning 16:22-16:24 logNormalDelay mean cannot be less than median'],
            label: 'logNormalDelay constraints — warns when median > mean',
            response: { status: 200, logNormalDelay: { mean: 30, median: 50 } },
        },
        {
            expected: ['HF304 warning 13:20-13:22 Status 99 is outside the valid HTTP range'],
            label: 'status out of range — status 99',
            response: { status: 99 },
        },
        {
            expected: ['HF304 warning 13:20-13:23 Status 600 is outside the valid HTTP range'],
            label: 'status out of range — status 600',
            response: { status: 600 },
        },
        {
            expected: ['HF304 warning 13:20-13:21 Status 0 is outside the valid HTTP range'],
            label: 'status out of range — status 0',
            response: { status: 0 },
        },
        {
            expected: ['HF304 warning 13:20-13:23 Status 700 is outside the valid HTTP range'],
            label: 'status out of range — status 700',
            response: { status: 700 },
        },
        { expected: [], label: 'status out of range — status 100', response: { status: 100 } },
        { expected: [], label: 'status out of range — status 200', response: { status: 200 } },
        { expected: [], label: 'status out of range — status 404', response: { status: 404 } },
        { expected: [], label: 'status out of range — status 599', response: { status: 599 } },
        { expected: [], label: 'a document whose data is no object', response: '{"data":123}' },
    ])(
        // Given - a response holding the case $label names
        // Then - every HF3xx diagnostic, its severity, its range and its message, or none
        'hf3xxResponseRule — $label',
        ({ expected, response }) => {
            expect(run(response)).toStrictEqual(expected);
        },
    );
});
