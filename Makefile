.PHONY: build lint test typecheck install docs

node_modules/.install: package-lock.json
	npm ci
	@touch node_modules/.install

install: node_modules/.install

build: node_modules/.install
	npm run build

typecheck: node_modules/.install
	npm run typecheck

# The pages under docs/reference/ are a projection of the BUILT analysis package, so the gate
# regenerates them and refuses a tree where the committed copy has drifted. The
# shared CI runs no such step: it is this repository's own, and `lint` owns it.
docs: build
	@tmp=$$(mktemp -d); cp -R docs/reference "$$tmp/reference"; \
	npm run docs:diagnostics; \
	if diff -r "$$tmp/reference" docs/reference > /dev/null; then rm -rf "$$tmp"; else \
		diff -r "$$tmp/reference" docs/reference; rm -rf "$$tmp"; \
		echo "docs/reference/ was stale — the regenerated projection is in your tree; commit it."; \
		exit 1; \
	fi

lint: node_modules/.install docs
	npm run lint

test: node_modules/.install
	npm test
