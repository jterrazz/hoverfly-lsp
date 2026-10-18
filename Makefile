.PHONY: install build lint fix test mutation check docs

node_modules/.install: package-lock.json
	npm ci
	@touch node_modules/.install

install: node_modules/.install

build: node_modules/.install
	npm run build

# invariant: docs/reference/ is a projection of the BUILT analysis package, so the gate
# regenerates it and refuses a tree where the committed copy has drifted.
docs: build
	@tmp=$$(mktemp -d); cp -R docs/reference "$$tmp/reference"; \
	npm run docs:diagnostics; \
	if diff -r "$$tmp/reference" docs/reference > /dev/null; then rm -rf "$$tmp"; else \
		diff -r "$$tmp/reference" docs/reference; rm -rf "$$tmp"; \
		echo "docs/reference/ was stale: the regenerated projection is in your tree; commit it."; \
		exit 1; \
	fi

# invariant: the server's type check reads the analysis package's built declarations, and its
# spec spawns the built binary, so both gates read the build.
lint: node_modules/.install docs
	npm run lint

fix: build
	npx typescript fix

test: build
	npm test

mutation: build
	npx typescript mutation

check: lint test mutation
