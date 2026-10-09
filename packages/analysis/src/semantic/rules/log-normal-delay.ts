// outside: Go's ValidateLogNormalDelayOptions (core/delay/log_normal_generator.go), in its order —
// the first violation is the one reported; an absent field is Go's int zero value, 0. Go guards the
// two "less than min" checks with min != 0, which the positive mean and median already imply.

/** A log-normal delay's four bounds, an absent one read as Go's zero. */
export type LogNormalDelay = {
    readonly max: number;
    readonly mean: number;
    readonly median: number;
    readonly min: number;
};

/** The first constraint a delay breaks, with the field it lands on. */
export type LogNormalViolation = { readonly explain: string; readonly key: keyof LogNormalDelay };

const NEGATIVE = 'logNormalDelay min and max cannot be less than 0';
const NOT_POSITIVE = 'logNormalDelay mean and median cannot be less than or equal to 0';

const CONSTRAINTS: readonly (LogNormalViolation & {
    readonly broken: (delay: LogNormalDelay) => boolean;
})[] = [
    { broken: ({ max }) => max < 0, explain: NEGATIVE, key: 'max' },
    { broken: ({ min }) => min < 0, explain: NEGATIVE, key: 'min' },
    { broken: ({ mean }) => mean <= 0, explain: NOT_POSITIVE, key: 'mean' },
    { broken: ({ median }) => median <= 0, explain: NOT_POSITIVE, key: 'median' },
    {
        broken: ({ max, min }) => max !== 0 && max < min,
        explain: 'logNormalDelay min must be less than max',
        key: 'max',
    },
    {
        broken: ({ max, mean }) => max !== 0 && mean > max,
        explain: 'logNormalDelay mean cannot be greater than max',
        key: 'mean',
    },
    {
        broken: ({ max, median }) => max !== 0 && median > max,
        explain: 'logNormalDelay median cannot be greater than max',
        key: 'median',
    },
    {
        broken: ({ mean, min }) => mean < min,
        explain: 'logNormalDelay mean cannot be less than min',
        key: 'mean',
    },
    {
        broken: ({ median, min }) => median < min,
        explain: 'logNormalDelay median cannot be less than min',
        key: 'median',
    },
    {
        broken: ({ mean, median }) => median > mean,
        explain: 'logNormalDelay mean cannot be less than median',
        key: 'median',
    },
];

/** The first constraint Hoverfly's import refuses the delay for, or none. */
export function logNormalDelayViolation(delay: LogNormalDelay): LogNormalViolation | undefined {
    const violated = CONSTRAINTS.find(({ broken }) => broken(delay));
    return violated === undefined ? undefined : { explain: violated.explain, key: violated.key };
}
