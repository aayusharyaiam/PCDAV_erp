SHELL := /bin/sh
NPM ?= npm

export DATABASE_URL ?= postgresql://pcdav:pcdav_local@localhost:5433/pcdav?schema=public
export FRONTEND_ORIGIN ?= http://localhost:3000

.PHONY: install build migrate test

install:
	$(NPM) ci --prefix backend --include=dev
	$(NPM) ci --prefix frontend --include=dev

build:
	$(NPM) --prefix backend run build
	$(NPM) --prefix frontend run build

migrate:
	$(NPM) --prefix backend run db:migrate

test:
	$(NPM) --prefix backend test -- --runInBand
