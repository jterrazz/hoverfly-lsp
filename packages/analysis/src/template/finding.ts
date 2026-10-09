type TemplateFindingKind =
    | 'HF502'
    | 'HF503'
    | 'HF504'
    | 'HF505'
    | 'HF506'
    | 'HF507'
    | 'HF508'
    | 'HF509';

export type TemplateFinding = {
    readonly kind: TemplateFindingKind;
    /** Inclusive start offset into the decoded template. */
    readonly start: number;
    /** Exclusive end offset into the decoded template. */
    readonly end: number;
    /** Catalog message placeholder args for this finding's code. */
    readonly args: Readonly<Record<string, string>>;
};
