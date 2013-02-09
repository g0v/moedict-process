NAME = dict-revised

all:

json: $(NAME).json

$(NAME).json: parse.py sementic.py
	python parse.py

initdb:
	rm -f $(NAME).sqlite3
	sqlite3 $(NAME).sqlite3 < $(NAME).schema

db: $(NAME).sqlite3

$(NAME).sqlite3: convert_json_to_sqlite.py $(NAME).json
	$(MAKE) initdb
	python convert_json_to_sqlite.py

$(NAME).json.bz2: $(NAME).json
	bzip2 < $(NAME).json > $(NAME).json.bz2
$(NAME).sqlite3.bz2: $(NAME).sqlite3
	bzip2 < $(NAME).sqlite3 > $(NAME).sqlite3.bz2

include Makefile.local
