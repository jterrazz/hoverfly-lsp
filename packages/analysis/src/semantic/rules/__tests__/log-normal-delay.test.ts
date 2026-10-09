import { describe, expect, test } from 'vitest';

import { logNormalDelayViolation } from '../log-normal-delay.js';

const NEGATIVE = 'logNormalDelay min and max cannot be less than 0';
const NOT_POSITIVE = 'logNormalDelay mean and median cannot be less than or equal to 0';

describe('logNormalDelayViolation', () => {
    test.each([
        { delay: { max: 100, mean: 50, median: 40, min: 10 }, violation: undefined },
        {
            delay: { max: -1, mean: 1, median: 1, min: 1 },
            violation: { explain: NEGATIVE, key: 'max' },
        },
        {
            delay: { max: 100, mean: 50, median: 40, min: -1 },
            violation: { explain: NEGATIVE, key: 'min' },
        },
        {
            delay: { max: 0, mean: 0, median: 5, min: 0 },
            violation: { explain: NOT_POSITIVE, key: 'mean' },
        },
        {
            delay: { max: 10, mean: 5, median: 0, min: 1 },
            violation: { explain: NOT_POSITIVE, key: 'median' },
        },
        {
            delay: { max: 10, mean: 50, median: 40, min: 100 },
            violation: { explain: 'logNormalDelay min must be less than max', key: 'max' },
        },
        { delay: { max: 0, mean: 10, median: 10, min: 5 }, violation: undefined },
        { delay: { max: 5, mean: 5, median: 5, min: 5 }, violation: undefined },
        {
            delay: { max: 10, mean: 11, median: 5, min: 1 },
            violation: { explain: 'logNormalDelay mean cannot be greater than max', key: 'mean' },
        },
        {
            delay: { max: 10, mean: 5, median: 11, min: 1 },
            violation: {
                explain: 'logNormalDelay median cannot be greater than max',
                key: 'median',
            },
        },
        {
            delay: { max: 10, mean: 3, median: 3, min: 5 },
            violation: { explain: 'logNormalDelay mean cannot be less than min', key: 'mean' },
        },
        {
            delay: { max: 10, mean: 6, median: 3, min: 5 },
            violation: { explain: 'logNormalDelay median cannot be less than min', key: 'median' },
        },
        { delay: { max: 10, mean: 6, median: 5, min: 5 }, violation: undefined },
        {
            delay: { max: 0, mean: 30, median: 50, min: 0 },
            violation: { explain: 'logNormalDelay mean cannot be less than median', key: 'median' },
        },
    ])(
        // Given - a delay of $delay.min to $delay.max, mean $delay.mean and median $delay.median
        // Then - the first constraint Hoverfly refuses it for, in Go's order, and the field it lands on — or none
        'logNormalDelayViolation — min $delay.min, max $delay.max, mean $delay.mean, median $delay.median',
        ({ delay, violation }) => {
            expect(logNormalDelayViolation(delay)).toStrictEqual(violation);
        },
    );
});
