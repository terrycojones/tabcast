NAME := tabcast-extension

extract:
	rm -fr export
	mkdir export
	git archive --prefix=$(NAME)/ -v --format zip HEAD > export/$(NAME).zip
	cd export && unzip -o $(NAME).zip
	rm -r export/$(NAME).zip export/$(NAME)/Makefile export/$(NAME)/bin

cws: extract
	grep -v '"update_url":' export/$(NAME)/manifest.json > export/$(NAME)/manifest.new
	mv export/$(NAME)/manifest.new export/$(NAME)/manifest.json
	cp PRIVATE-KEY export/$(NAME)/key.pem
	cd export && zip -qr -9 -X $(NAME)-for-chrome-web-store $(NAME)

crx: extract
	cd export && ../bin/create-crx.sh $(NAME) ../PRIVATE-KEY

dist: crx
	./bin/upload-crx.py export/$(NAME).crx
	./bin/upload-update-manifest.py < export/$(NAME)/manifest.json

lint:
	-jshint --show-non-errors background.js
	-jshint --show-non-errors options.js

clean:
	find . -name '*~' | xargs -r rm
	rm -fr export
