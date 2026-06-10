.PHONY: build lint test typecheck install

node_modules/.install: package-lock.json
	npm ci
	@touch node_modules/.install

install: node_modules/.install

build: node_modules/.install
	npm run build

typecheck: node_modules/.install
	npm run typecheck

lint: node_modules/.install
	npm run lint

test: node_modules/.install
	npm test
