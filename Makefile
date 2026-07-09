NAME = dict-revised

.PHONY: all json db

all:

json: $(NAME).json

$(NAME).json:
	bun run parse

db: $(NAME).sqlite3

$(NAME).sqlite3: $(NAME).json
	bun run to-sqlite

$(NAME).json.bz2: $(NAME).json
	bzip2 < $(NAME).json > $(NAME).json.bz2
$(NAME).sqlite3.bz2: $(NAME).sqlite3
	bzip2 < $(NAME).sqlite3 > $(NAME).sqlite3.bz2

include Makefile.local
