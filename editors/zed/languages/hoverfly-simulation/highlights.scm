; Hoverfly Simulation highlighting.
;
; Hoverfly simulations are JSON, so these queries target the tree-sitter-json
; grammar (declared as `grammar = "json"` in config.toml). Capture names follow
; Zed's highlight conventions so the active theme colors them.

(pair
  key: (_) @property)

(string) @string

(number) @number

[
  (null)
  (true)
  (false)
] @constant

(escape_sequence) @string.escape

(comment) @comment

["{" "}"] @punctuation.bracket
["[" "]"] @punctuation.bracket
["," ":"] @punctuation.delimiter
